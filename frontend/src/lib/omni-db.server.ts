/** Server-only database orchestration for the OmniTrust settlement flow. */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { MAX_TURNS, type NegotiationTurn } from "./omni";
import {
  arbitrate,
  gatekeeper,
  proposeWithAI,
  providerRef,
  refundGate,
  sellerCounter,
  settlementGate,
  signPayload,
  trackingId,
  webhookSecret,
  type GateCheck,
} from "./engine.server";

export type DB = SupabaseClient<Database>;

type AuditInput = {
  userId: string;
  orderId?: string | null;
  negotiationId?: string | null;
  category: string;
  eventType: string;
  actor: string;
  entity?: string;
  status?: string;
  latencyMs?: number | null;
  requestId?: string | null;
  decision?: string | null;
  payload?: Record<string, unknown>;
};

export async function audit(db: DB, e: AuditInput) {
  const { error } = await db.from("audit_events").insert({
    user_id: e.userId,
    order_id: e.orderId ?? null,
    negotiation_id: e.negotiationId ?? null,
    category: e.category,
    event_type: e.eventType,
    actor: e.actor,
    entity: e.entity ?? "",
    status: e.status ?? "success",
    latency_ms: e.latencyMs ?? null,
    request_id: e.requestId ?? null,
    decision: e.decision ?? null,
    payload: (e.payload ?? {}) as never,
  });
  if (error) console.error("audit insert failed", error.message);
}

function must<T>(data: T | null, message: string): T {
  if (!data) throw new Error(message);
  return data;
}

/* ---------------------------------- profile --------------------------------- */

export async function getProfile(db: DB, userId: string) {
  const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export async function saveProfile(
  db: DB,
  userId: string,
  input: {
    full_name?: string;
    company?: string;
    role?: "buyer" | "seller";
    demo_scenario?: string;
    onboarding_completed?: boolean;
  },
) {
  await getProfile(db, userId);
  const { data, error } = await db
    .from("profiles")
    .update(input)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/* --------------------------------- catalog ---------------------------------- */

export async function listProducts(db: DB) {
  const { data, error } = await db.from("products").select("*").order("list_price", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------- negotiation -------------------------------- */

export async function createNegotiation(
  db: DB,
  userId: string,
  input: { productId: string; quantity: number; targetDiscountPct: number },
) {
  const { data: product, error: pErr } = await db
    .from("products")
    .select("*")
    .eq("id", input.productId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const p = must(product, "Product not found");

  const list = Number(p.list_price);
  const target = Math.round(list * (1 - input.targetDiscountPct / 100));

  const { data, error } = await db
    .from("negotiations")
    .insert({
      user_id: userId,
      product_id: p.id,
      quantity: input.quantity,
      buyer_target: target,
      max_turns: MAX_TURNS,
      status: "active",
      turns: [] as never,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(db, {
    userId,
    negotiationId: data.id,
    category: "guardrail",
    eventType: "negotiation.opened",
    actor: "System",
    entity: p.sku,
    decision: "BOUNDS_SET",
    payload: {
      list_price: list,
      buyer_target: target,
      max_turns: MAX_TURNS,
      price_floor: "redacted",
      quantity: input.quantity,
    },
  });

  return { negotiation: data, product: p };
}

export async function getNegotiation(db: DB, id: string) {
  const { data, error } = await db
    .from("negotiations")
    .select("*, product:products(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return must(data, "Negotiation not found");
}

export async function nextTurn(db: DB, userId: string, negotiationId: string) {
  const negotiation = await getNegotiation(db, negotiationId);
  const product = negotiation.product as unknown as Database["public"]["Tables"]["products"]["Row"];
  if (negotiation.status !== "active") {
    return { negotiation, aiError: null as string | null };
  }

  const turns = (negotiation.turns as unknown as NegotiationTurn[]) ?? [];
  const lastSeller = [...turns].reverse().find((t) => t.actor === "seller_agent");
  const lastSellerPrice = lastSeller?.proposed_unit_price ?? Number(product.list_price);
  const turn = negotiation.turn_count + 1;

  const input = {
    productName: product.name,
    listPrice: Number(product.list_price),
    priceFloor: Number(product.price_floor),
    buyerTarget: Number(negotiation.buyer_target),
    lastSellerPrice,
    quantity: negotiation.quantity,
    turn,
  };

  const proposal = await proposeWithAI(input);
  const now = new Date().toISOString();

  await audit(db, {
    userId,
    negotiationId,
    category: "ai",
    eventType: "buyer_agent.proposal",
    actor: "Buyer Agent",
    entity: product.sku,
    status: proposal.error ? "warning" : "success",
    latencyMs: proposal.latencyMs,
    requestId: providerRef("req"),
    decision: "PROPOSED",
    payload: {
      model: proposal.aiUsed ? "google/gemini-2.5-flash-lite" : "deterministic-fallback",
      proposed_unit_price: proposal.price,
      rationale: proposal.rationale,
      provider_error: proposal.error ?? null,
    },
  });

  const gate = gatekeeper(input, proposal.price);

  const newTurns: NegotiationTurn[] = [
    ...turns,
    {
      turn,
      actor: "buyer_agent",
      message: proposal.rationale,
      proposed_unit_price: proposal.price,
      at: now,
    },
    {
      turn,
      actor: "gatekeeper",
      message: gate.pass
        ? "Proposal satisfies every deterministic policy check."
        : "Proposal violated a deterministic policy check and was blocked.",
      decision: gate.pass ? "accepted" : "rejected",
      checks: gate.checks,
      at: now,
    },
  ];

  await audit(db, {
    userId,
    negotiationId,
    category: "guardrail",
    eventType: "gatekeeper.decision",
    actor: "Gatekeeper",
    entity: product.sku,
    status: gate.pass ? "success" : "failed",
    decision: gate.pass ? "ACCEPTED" : "REJECTED",
    payload: { checks: gate.checks, evaluated_unit_price: proposal.price },
  });

  let status = negotiation.status;
  let agreed: number | null = null;

  if (gate.pass) {
    status = "agreed";
    agreed = proposal.price;
    newTurns.push({
      turn,
      actor: "seller_agent",
      message: `Accepted at ${proposal.price} per unit. Awaiting buyer approval.`,
      proposed_unit_price: proposal.price,
      decision: "accepted",
      at: now,
    });
    await audit(db, {
      userId,
      negotiationId,
      category: "ai",
      eventType: "seller_agent.accepted",
      actor: "Seller Agent",
      entity: product.sku,
      decision: "ACCEPTED",
      payload: { agreed_unit_price: proposal.price },
    });
  } else {
    const counter = sellerCounter(input);
    newTurns.push({
      turn,
      actor: "seller_agent",
      message: `Counter-offer at ${counter} per unit.`,
      proposed_unit_price: counter,
      decision: "counter",
      at: now,
    });
    if (turn >= negotiation.max_turns) {
      status = "expired";
      await audit(db, {
        userId,
        negotiationId,
        category: "guardrail",
        eventType: "negotiation.expired",
        actor: "System",
        status: "failed",
        decision: "TURN_BUDGET_EXHAUSTED",
        payload: { turns_used: turn, max_turns: negotiation.max_turns },
      });
    }
  }

  const { data, error } = await db
    .from("negotiations")
    .update({
      turn_count: turn,
      turns: newTurns as never,
      status,
      agreed_unit_price: agreed,
    })
    .eq("id", negotiationId)
    .select("*, product:products(*)")
    .single();
  if (error) throw new Error(error.message);
  return { negotiation: data, aiError: proposal.error ?? null };
}

export async function approveNegotiation(db: DB, userId: string, negotiationId: string) {
  const negotiation = await getNegotiation(db, negotiationId);
  const product = negotiation.product as unknown as Database["public"]["Tables"]["products"]["Row"];
  if (negotiation.status !== "agreed" || !negotiation.agreed_unit_price) {
    throw new Error("Negotiation has not reached an approved consensus.");
  }

  const { data: existing } = await db
    .from("orders")
    .select("id")
    .eq("negotiation_id", negotiationId)
    .maybeSingle();
  if (existing) return { orderId: existing.id };

  const unit = Number(negotiation.agreed_unit_price);
  const total = unit * negotiation.quantity;

  const { data: order, error } = await db
    .from("orders")
    .insert({
      user_id: userId,
      negotiation_id: negotiationId,
      product_id: product.id,
      product_name: product.name,
      quantity: negotiation.quantity,
      unit_price: unit,
      total_amount: total,
      status: "awaiting_escrow",
      idempotency_key: providerRef("idem"),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await db.from("negotiations").update({ status: "approved" }).eq("id", negotiationId);
  await audit(db, {
    userId,
    orderId: order.id,
    negotiationId,
    category: "guardrail",
    eventType: "order.created",
    actor: "System",
    entity: order.id,
    decision: "CONSENSUS_APPROVED",
    payload: { unit_price: unit, quantity: negotiation.quantity, total_amount: total },
  });

  return { orderId: order.id };
}

/* ---------------------------------- orders ---------------------------------- */

export async function listOrders(db: DB) {
  const { data, error } = await db
    .from("orders")
    .select("*, shipments(*), disputes(*)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getOrder(db: DB, id: string) {
  const { data, error } = await db
    .from("orders")
    .select("*, shipments(*), disputes(*), negotiations(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return must(data, "Order not found");
}

export async function createEscrow(db: DB, userId: string, orderId: string) {
  const order = await getOrder(db, orderId);
  if (order.escrow_status === "held") {
    await audit(db, {
      userId,
      orderId,
      category: "payment",
      eventType: "escrow.duplicate_suppressed",
      actor: "Escrow Service",
      status: "warning",
      requestId: order.idempotency_key,
      decision: "IDEMPOTENT_NO_OP",
      payload: { escrow_ref: order.escrow_ref },
    });
    return order;
  }
  const ref = providerRef("pay");
  const { data, error } = await db
    .from("orders")
    .update({ escrow_status: "held", escrow_ref: ref, status: "escrow_held" })
    .eq("id", orderId)
    .select("*, shipments(*), disputes(*)")
    .single();
  if (error) throw new Error(error.message);

  await audit(db, {
    userId,
    orderId,
    category: "payment",
    eventType: "escrow.created",
    actor: "Payment Provider (test mode)",
    entity: ref,
    requestId: order.idempotency_key,
    decision: "FUNDS_HELD",
    latencyMs: 210,
    payload: {
      provider: "razorpay_test",
      provider_ref: ref,
      amount: Number(order.total_amount),
      currency: order.currency,
      api_key: "redacted",
    },
  });
  return data;
}

export async function createShipment(db: DB, userId: string, orderId: string) {
  const order = await getOrder(db, orderId);
  if (order.escrow_status !== "held") throw new Error("Escrow must be held before shipment registration.");
  const existing = (order.shipments as { id: string; tracking_id: string }[])?.[0];
  if (existing) return existing;

  const tid = trackingId();
  const { data, error } = await db
    .from("shipments")
    .insert({ user_id: userId, order_id: orderId, tracking_id: tid })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await db.from("orders").update({ status: "in_transit" }).eq("id", orderId);
  await audit(db, {
    userId,
    orderId,
    category: "logistics",
    eventType: "shipment.registered",
    actor: "Mock 3PL",
    entity: tid,
    decision: "REGISTERED",
    payload: { tracking_id: tid, carrier: data.carrier, condition: "intact" },
  });
  return data;
}

export async function getShipmentByTracking(db: DB, tracking: string) {
  const { data, error } = await db
    .from("shipments")
    .select("*, orders(*)")
    .eq("tracking_id", tracking)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return must(data, "Shipment not found");
}

/* ------------------------- logistics webhook emitter ------------------------ */

/**
 * Emits a signed logistics event to the public webhook route, exactly like the
 * external 3PL would. `mode` lets the demo show tampering and replay handling.
 */
export async function emitLogisticsEvent(
  db: DB,
  userId: string,
  input: { tracking: string; event: "delivered" | "damaged"; mode: "valid" | "tampered" | "replay" },
  origin: string,
) {
  const shipment = await getShipmentByTracking(db, input.tracking);
  const eventId =
    input.mode === "replay" ? `evt_replay_${input.tracking}` : providerRef("evt");
  const body = JSON.stringify({
    event_id: eventId,
    tracking_id: input.tracking,
    event: input.event,
    condition: input.event === "damaged" ? "damaged" : "intact",
    occurred_at: new Date().toISOString(),
    user_id: shipment.user_id,
  });
  const secret = webhookSecret();
  const signature =
    input.mode === "tampered" ? signPayload(body, "wrong-secret-supplied-by-attacker") : signPayload(body, secret);

  const res = await fetch(`${origin}/api/public/webhooks/logistics`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-omnitrust-signature": signature },
    body,
  });
  const result = (await res.json().catch(() => ({}))) as {
    error?: string;
    duplicate?: boolean;
    delivered?: boolean;
    dispute_id?: string | null;
  };

  if (!res.ok) {
    await audit(db, {
      userId,
      orderId: shipment.order_id,
      category: "webhook",
      eventType: "webhook.rejected",
      actor: "OmniTrust Verifier",
      entity: input.tracking,
      status: "failed",
      requestId: eventId,
      decision: "SIGNATURE_INVALID",
      payload: { http_status: res.status, reason: result.error ?? "rejected", financial_action: "none" },
    });
  }
  return {
    ok: res.ok,
    status: res.status,
    error: result.error ?? null,
    duplicate: result.duplicate ?? false,
    delivered: result.delivered ?? false,
    disputeId: result.dispute_id ?? null,
  };
}

/* ------------------------- settlement / dispute flow ------------------------ */

export async function settleOrder(db: DB, userId: string, orderId: string) {
  const order = await getOrder(db, orderId);
  const shipment = (order.shipments as { status: string }[])?.[0];
  const dispute = (order.disputes as { status: string }[])?.[0];

  const gate = settlementGate({
    signatureVerified: order.status === "delivered" || order.status === "settled",
    delivered: shipment?.status === "delivered",
    disputeOpen: dispute?.status === "open",
    escrowHeld: order.escrow_status === "held",
    alreadySettled: Boolean(order.settlement_ref),
  });

  if (!gate.pass) {
    await audit(db, {
      userId,
      orderId,
      category: "settlement",
      eventType: "settlement.blocked",
      actor: "Settlement Gate",
      status: "failed",
      decision: "BLOCKED",
      payload: { checks: gate.checks },
    });
    return { ok: false, checks: gate.checks, order };
  }

  const ref = providerRef("pout");
  const { data, error } = await db
    .from("orders")
    .update({ status: "settled", escrow_status: "released", settlement_ref: ref })
    .eq("id", orderId)
    .select("*, shipments(*), disputes(*)")
    .single();
  if (error) throw new Error(error.message);

  await audit(db, {
    userId,
    orderId,
    category: "settlement",
    eventType: "settlement.submitted",
    actor: "Payment Provider (test mode)",
    entity: ref,
    decision: "SELLER_PAID",
    latencyMs: 340,
    requestId: order.idempotency_key,
    payload: { checks: gate.checks, provider_ref: ref, amount: Number(order.total_amount) },
  });
  return { ok: true, checks: gate.checks, order: data };
}

export async function getDispute(db: DB, id: string) {
  const { data, error } = await db.from("disputes").select("*, orders(*)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return must(data, "Dispute not found");
}

export async function runArbitration(db: DB, userId: string, disputeId: string) {
  const dispute = await getDispute(db, disputeId);
  const order = dispute.orders as unknown as Database["public"]["Tables"]["orders"]["Row"];
  const result = arbitrate(Number(order.total_amount));

  const { data, error } = await db
    .from("disputes")
    .update({
      status: "arbitrated",
      decision: result.decision,
      penalty_pct: result.penaltyPct,
      refund_amount: result.refundAmount,
      confidence: result.confidence,
    })
    .eq("id", disputeId)
    .select("*, orders(*)")
    .single();
  if (error) throw new Error(error.message);

  await audit(db, {
    userId,
    orderId: order.id,
    category: "dispute",
    eventType: "arbitrator.decision",
    actor: "Arbitrator Agent",
    entity: disputeId,
    decision: result.decision,
    latencyMs: 420,
    payload: {
      decision: result.decision,
      penalty_pct: result.penaltyPct,
      refund_amount: result.refundAmount,
      reason: result.reason,
      confidence: result.confidence,
      hidden_reasoning: "redacted",
    },
  });
  return data;
}

export async function runRefund(db: DB, userId: string, disputeId: string) {
  const dispute = await getDispute(db, disputeId);
  const order = dispute.orders as unknown as Database["public"]["Tables"]["orders"]["Row"];
  const amount = Number(dispute.refund_amount ?? 0);

  const gate = refundGate({
    refundAmount: amount,
    totalPaid: Number(order.total_amount),
    disputeOpen: dispute.status === "arbitrated",
    alreadyRefunded: Boolean(order.refund_ref),
  });

  if (!gate.pass) {
    await audit(db, {
      userId,
      orderId: order.id,
      category: "refund",
      eventType: "refund.blocked",
      actor: "Refund Gate",
      status: "failed",
      decision: "BLOCKED",
      payload: { checks: gate.checks, requested_amount: amount },
    });
    return { ok: false, checks: gate.checks, dispute };
  }

  const ref = providerRef("rfnd");
  await db
    .from("orders")
    .update({ status: "refunded", escrow_status: "refunded", refund_ref: ref, refund_amount: amount })
    .eq("id", order.id);
  const { data, error } = await db
    .from("disputes")
    .update({ status: "resolved", refund_ref: ref })
    .eq("id", disputeId)
    .select("*, orders(*)")
    .single();
  if (error) throw new Error(error.message);

  await audit(db, {
    userId,
    orderId: order.id,
    category: "refund",
    eventType: "refund.submitted",
    actor: "Payment Provider (test mode)",
    entity: ref,
    decision: "REFUND_EXECUTED",
    latencyMs: 380,
    requestId: order.idempotency_key,
    payload: { checks: gate.checks, provider_ref: ref, refund_amount: amount },
  });
  return { ok: true, checks: gate.checks, dispute: data };
}

/* ----------------------------------- audit ---------------------------------- */

export async function listAudit(db: DB, orderId?: string | null, limit = 200) {
  let query = db.from("audit_events").select("*").order("created_at", { ascending: true }).limit(limit);
  if (orderId) query = query.eq("order_id", orderId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function dashboardSnapshot(db: DB) {
  const [orders, negotiations, events] = await Promise.all([
    listOrders(db),
    db.from("negotiations").select("*, product:products(name)").order("created_at", { ascending: false }).limit(10),
    db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(12),
  ]);
  return {
    orders,
    negotiations: negotiations.data ?? [],
    events: events.data ?? [],
  };
}

export async function resetDemo(db: DB, userId: string) {
  await db.from("audit_events").delete().eq("user_id", userId);
  await db.from("disputes").delete().eq("user_id", userId);
  await db.from("shipments").delete().eq("user_id", userId);
  await db.from("orders").delete().eq("user_id", userId);
  await db.from("negotiations").delete().eq("user_id", userId);
  return { ok: true };
}

export async function dependencyStatus(): Promise<{ name: string; ok: boolean; detail: string }[]> {
  return [
    { name: "Database", ok: true, detail: "Postgres + row level security" },
    {
      name: "AI provider",
      ok: Boolean(process.env["GATEWAY_API_KEY"]),
      detail: process.env["GATEWAY_API_KEY"] ? "Gateway reachable" : "Key missing — deterministic fallback",
    },
    { name: "Payment provider", ok: true, detail: "Test mode simulator, server-side only" },
    {
      name: "Webhook signing key",
      ok: Boolean(webhookSecret()),
      detail: webhookSecret() ? "HMAC-SHA256 configured" : "Missing signing secret",
    },
    { name: "Mock 3PL", ok: true, detail: "In-app warehouse portal" },
  ];
}

export type { GateCheck };
