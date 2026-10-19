/**
 * OmniTrust — Escrow & Logistics Timeline Event Types
 */

export type TimelineEventType =
  | "negotiation_agreed"
  | "paypal_order_created"
  | "paypal_authorization_confirmed"
  | "carrier_pickup"
  | "waypoint_scan"
  | "delivery_verified"
  | "arbitrator_decision"
  | "paypal_capture_completed"
  | "paypal_authorization_voided"
  | "paypal_refund_completed";

export interface LifecycleMilestone {
  id: string;
  type: TimelineEventType;
  title: string;
  actor: string;
  timestamp: string;
  status: "completed" | "in_progress" | "pending" | "failed";
  details?: Record<string, any>;
  proof_hash?: string;
  reference_id?: string;
}
