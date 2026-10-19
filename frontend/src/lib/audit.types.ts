/**
 * OmniTrust — Agentic Audit Command Center Data Types
 */

export interface AgentAuditRow {
  order_id: string;
  product_name: string;
  buyer_bid: number;
  seller_counteroffer: number;
  agreed_price: number;
  quantity: number;
  total_amount: number;
  currency: string;
  consensus_score_pct: number;
  logistics_proof_hash: string;
  payment_state: string;
  authorization_id: string | null;
  capture_id: string | null;
  order_status: string;
  created_at: string;
}
