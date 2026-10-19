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
  if (!Array.isArray(milestones)) {
    return [];
  }

  return milestones.map((m, idx) => {
    // Sanitize or recover malformed/missing ISO timestamps
    let validStartDate: string;
    try {
      if (m.timestamp && !isNaN(Date.parse(m.timestamp))) {
        validStartDate = new Date(m.timestamp).toISOString();
      } else {
        // Fallback to Unix epoch for invalid or missing timestamps
        validStartDate = new Date(0).toISOString();
      }
    } catch {
      validStartDate = new Date(0).toISOString();
    }

    // Parse optional endDate if available in milestone details
    let validEndDate: string | undefined = undefined;
    if (
      m.details &&
      typeof m.details.end_date === "string" &&
      !isNaN(Date.parse(m.details.end_date))
    ) {
      try {
        validEndDate = new Date(m.details.end_date).toISOString();
      } catch {
        validEndDate = undefined;
      }
    }

    return {
      id: m.id || `milestone-${idx}`,
      name: m.title || "Milestone",
      startDate: validStartDate,
      endDate: validEndDate,
      resourceId: m.actor || "system",
      eventType: m.type,
      status: m.status || "pending",
      proofHash: m.proof_hash,
      referenceId: m.reference_id,
    };
  });
}
