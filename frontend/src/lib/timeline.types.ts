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
  details?: Record<string, unknown>;
  proof_hash?: string;
  reference_id?: string;
}

/**
 * Bryntum Scheduler / TaskBoard data model compatibility interface.
 * Maps OmniTrust escrow milestones directly to Bryntum EventModel records.
 */
export interface BryntumEventModel {
  id: string;
  name: string;
  startDate: string;
  endDate?: string;
  resourceId?: string;
  eventType: TimelineEventType;
  status: "completed" | "in_progress" | "pending" | "failed";
  proofHash?: string;
  referenceId?: string;
}

export function toBryntumEvents(milestones: LifecycleMilestone[]): BryntumEventModel[] {
  return milestones.map((m) => ({
    id: m.id,
    name: m.title,
    startDate: m.timestamp,
    resourceId: m.actor,
    eventType: m.type,
    status: m.status,
    proofHash: m.proof_hash,
    referenceId: m.reference_id,
  }));
}
