/** Shared, client-safe domain types and formatting helpers. */

export type NegotiationTurn = {
  turn: number;
  actor: "buyer_agent" | "seller_agent" | "gatekeeper";
  message: string;
  proposed_unit_price?: number;
  decision?: "accepted" | "rejected" | "counter";
  checks?: { label: string; pass: boolean; detail: string }[];
  at: string;
};

export type AuditCategory =
  | "ai"
  | "guardrail"
  | "payment"
  | "logistics"
  | "webhook"
  | "settlement"
  | "dispute"
  | "refund"
  | "auth";

export const CATEGORY_LABEL: Record<string, string> = {
  ai: "AI",
  guardrail: "Guardrail",
  payment: "Payment",
  logistics: "Logistics",
  webhook: "Webhook",
  settlement: "Settlement",
  dispute: "Dispute",
  refund: "Refund",
  auth: "Auth",
};

export const MAX_TURNS = 4;
export const POLICY_REFUND_CAP_PCT = 60;

export function inr(amount: number | string | null | undefined) {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return id.slice(0, 8).toUpperCase();
}

export function timeOf(ts: string) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function safePath(next: string | undefined | null, fallback = "/dashboard") {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export type StatusTone = "success" | "active" | "pending" | "warning" | "failed" | "neutral";

export function toneForStatus(status: string): StatusTone {
  const s = status.toLowerCase();
  if (["settled", "delivered", "success", "released", "accepted", "verified", "refunded"].includes(s))
    return "success";
  if (["active", "in_transit", "negotiating", "held", "escrow_held", "arbitrating"].includes(s))
    return "active";
  if (["created", "registered", "pending", "awaiting_escrow", "open"].includes(s)) return "pending";
  if (["damaged", "disputed", "warning", "partial_refund"].includes(s)) return "warning";
  if (["failed", "rejected", "expired", "cancelled"].includes(s)) return "failed";
  return "neutral";
}
