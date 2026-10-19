import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toBryntumEvents } from "./timeline.types.ts";
import type { LifecycleMilestone } from "./timeline.types.ts";

describe("toBryntumEvents adapter", () => {
  it("correctly maps a valid list of milestones", () => {
    const milestones: LifecycleMilestone[] = [
      {
        id: "m-1",
        type: "negotiation_agreed",
        title: "Agreement reached",
        actor: "buyer_agent",
        timestamp: "2026-10-20T10:00:00Z",
        status: "completed",
        proof_hash: "sha256:abc12345",
        reference_id: "ref-999",
        details: {
          end_date: "2026-10-20T11:00:00Z",
        },
      },
    ];

    const bryntumEvents = toBryntumEvents(milestones);
    assert.equal(bryntumEvents.length, 1);
    const event = bryntumEvents[0];
    assert.equal(event.id, "m-1");
    assert.equal(event.name, "Agreement reached");
    assert.equal(event.resourceId, "buyer_agent");
    assert.equal(event.eventType, "negotiation_agreed");
    assert.equal(event.status, "completed");
    assert.equal(event.proofHash, "sha256:abc12345");
    assert.equal(event.referenceId, "ref-999");
    assert.equal(event.startDate, "2026-10-20T10:00:00.000Z");
    assert.equal(event.endDate, "2026-10-20T11:00:00.000Z");
  });

  it("handles missing or malformed timestamps safely", () => {
    const milestones: LifecycleMilestone[] = [
      {
        id: "m-bad-ts",
        type: "waypoint_scan",
        title: "In Transit Scan",
        actor: "carrier",
        timestamp: "not-a-valid-date",
        status: "in_progress",
      },
      {
        id: "m-empty-ts",
        type: "delivery_verified",
        title: "Delivered",
        actor: "carrier",
        timestamp: "",
        status: "pending",
      },
    ];

    const bryntumEvents = toBryntumEvents(milestones);
    assert.equal(bryntumEvents.length, 2);
    // Both invalid timestamps should default to Unix epoch
    assert.equal(bryntumEvents[0].startDate, new Date(0).toISOString());
    assert.equal(bryntumEvents[1].startDate, new Date(0).toISOString());
    assert.equal(bryntumEvents[0].endDate, undefined);
  });

  it("handles empty or non-array inputs gracefully", () => {
    assert.deepEqual(toBryntumEvents([]), []);
    // @ts-expect-error testing non-array runtime fallback
    assert.deepEqual(toBryntumEvents(null), []);
    // @ts-expect-error testing non-array runtime fallback
    assert.deepEqual(toBryntumEvents(undefined), []);
  });
});
