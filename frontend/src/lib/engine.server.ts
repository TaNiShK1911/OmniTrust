/**
 * Server-only deterministic engine: negotiation guardrails, gatekeeper policy,
 * arbitrator policy and HMAC signing. Nothing here touches the database.
 */
import { createHmac, timingSafeEqual } from "crypto";

import { MAX_TURNS, POLICY_REFUND_CAP_PCT } from "./omni";

export type GateCheck = { label: string; pass: boolean; detail: string };

export type ProposalInput = {
  productName: string;
  listPrice: number;
  priceFloor: number;
  buyerTarget: number;
  lastSellerPrice: number;
  quantity: number;
  turn: number;
};

/** Deterministic fallback proposal, used when the AI provider is unavailable. */
export function fallbackProposal(input: ProposalInput) {
  const span = input.lastSellerPrice - input.buyerTarget;
  const price = Math.round(input.buyerTarget + (span * input.turn) / (MAX_TURNS + 1));
  return {
    price,
    rationale: `Deterministic fallback: converging from ${input.buyerTarget} toward ${input.lastSellerPrice}.`,
    aiUsed: false,
  };
}

/** Ask the Frontend AI Gateway for a buyer-agent proposal. Never throws. */
export async function proposeWithAI(input: ProposalInput): Promise<{
  price: number;
  rationale: string;
  aiUsed: boolean;
  latencyMs: number;
  error?: string;
}> {
  const key = process.env["GATEWAY_API_KEY"];
  const started = Date.now();
  if (!key) {
    return { ...fallbackProposal(input), latencyMs: 0, error: "AI provider not configured" };
  }
  try {
    const res = await fetch("https://ai.gateway.frontend.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You are a procurement Buyer Agent in a bounded B2B negotiation. Reply ONLY with compact JSON: {\"unit_price\": number, \"rationale\": string}. The rationale must be under 160 characters. You do not know the seller's price floor.",
          },
          {
            role: "user",
            content: `Product: ${input.productName}. Quantity: ${input.quantity}. Seller's current unit price: ${input.lastSellerPrice}. Your internal target unit price: ${input.buyerTarget}. Negotiation turn ${input.turn} of ${MAX_TURNS}. Propose the next unit price.`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { unit_price?: number; rationale?: string }) : null;
    const price = Number(parsed?.unit_price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("unparseable proposal");
    return {
      price: Math.round(price),
      rationale: (parsed?.rationale ?? "Proposal generated.").slice(0, 200),
      aiUsed: true,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ...fallbackProposal(input),
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "AI provider unavailable",
    };
  }
}

/** Deterministic gatekeeper. The AI can suggest anything; only this decides. */
export function gatekeeper(input: ProposalInput, proposed: number) {
  const checks: GateCheck[] = [
    {
      label: "Turn budget not exceeded",
      pass: input.turn <= MAX_TURNS,
      detail: `turn ${input.turn} of ${MAX_TURNS}`,
    },
    {
      label: "Proposal is a positive number",
      pass: Number.isFinite(proposed) && proposed > 0,
      detail: `proposed ${proposed}`,
    },
    {
      label: "Proposal >= seller price floor",
      pass: proposed >= input.priceFloor,
      detail: `floor ${input.priceFloor}`,
    },
    {
      label: "Proposal <= list price",
      pass: proposed <= input.listPrice,
      detail: `list ${input.listPrice}`,
    },
    {
      label: "Quantity within order limit",
      pass: input.quantity > 0 && input.quantity <= 500,
      detail: `qty ${input.quantity}`,
    },
  ];
  const pass = checks.every((c) => c.pass);
  return { checks, pass };
}

/** Seller counter when the gatekeeper rejects: midpoint of floor and last ask. */
export function sellerCounter(input: ProposalInput) {
  return Math.round((input.priceFloor + input.lastSellerPrice) / 2);
}

/** Deterministic arbitrator for damaged shipments. */
export function arbitrate(totalPaid: number) {
  const penaltyPct = 30;
  const refund = Math.round((totalPaid * penaltyPct) / 100);
  return {
    decision: "PARTIAL_REFUND",
    penaltyPct,
    refundAmount: refund,
    reason: "DAMAGED_GOODS",
    confidence: 91,
  };
}

/** Deterministic refund policy gate. */
export function refundGate(opts: {
  refundAmount: number;
  totalPaid: number;
  disputeOpen: boolean;
  alreadyRefunded: boolean;
}): { checks: GateCheck[]; pass: boolean } {
  const cap = Math.round((opts.totalPaid * POLICY_REFUND_CAP_PCT) / 100);
  const checks: GateCheck[] = [
    {
      label: "Refund <= amount paid",
      pass: opts.refundAmount <= opts.totalPaid,
      detail: `paid ${opts.totalPaid}`,
    },
    {
      label: `Refund <= policy cap (${POLICY_REFUND_CAP_PCT}%)`,
      pass: opts.refundAmount <= cap,
      detail: `cap ${cap}`,
    },
    { label: "Dispute is open", pass: opts.disputeOpen, detail: opts.disputeOpen ? "open" : "closed" },
    {
      label: "No existing successful refund",
      pass: !opts.alreadyRefunded,
      detail: opts.alreadyRefunded ? "refund already recorded" : "none",
    },
  ];
  return { checks, pass: checks.every((c) => c.pass) };
}

export function settlementGate(opts: {
  signatureVerified: boolean;
  delivered: boolean;
  disputeOpen: boolean;
  escrowHeld: boolean;
  alreadySettled: boolean;
}): { checks: GateCheck[]; pass: boolean } {
  const checks: GateCheck[] = [
    { label: "Webhook signature verified", pass: opts.signatureVerified, detail: "HMAC-SHA256" },
    { label: "Shipment delivered", pass: opts.delivered, detail: "logistics event" },
    { label: "No open dispute", pass: !opts.disputeOpen, detail: opts.disputeOpen ? "dispute open" : "none" },
    { label: "Escrow held", pass: opts.escrowHeld, detail: "escrow state" },
    {
      label: "Not already settled",
      pass: !opts.alreadySettled,
      detail: opts.alreadySettled ? "settlement exists" : "none",
    },
  ];
  return { checks, pass: checks.every((c) => c.pass) };
}

export function webhookSecret() {
  return process.env["LOGISTICS_WEBHOOK_SECRET"] ?? "";
}

export function signPayload(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string, secret: string) {
  if (!secret || !signature) return false;
  const expected = signPayload(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function trackingId() {
  return `OMNI-TRK-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function providerRef(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}
