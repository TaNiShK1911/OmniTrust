import { createFileRoute } from "@tanstack/react-router";

import { arbitrate, providerRef, verifySignature, webhookSecret } from "@/lib/engine.server";

type Payload = {
  event_id: string;
  tracking_id: string;
  event: "delivered" | "damaged";
  condition: string;
  occurred_at: string;
  user_id: string;
};

/**
 * External mock-3PL callback. Signature is verified BEFORE anything is read
 * from the payload and before any state or financial action is touched.
 */
export const Route = createFileRoute("/api/public/webhooks/logistics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-omnitrust-signature") ?? "";
        const body = await request.text();

        if (!verifySignature(body, signature, webhookSecret())) {
          return Response.json(
            { error: "Signature verification failed", financial_action: "none" },
            { status: 401 },
          );
        }

        let payload: Payload;
        try {
          payload = JSON.parse(body) as Payload;
        } catch {
          return Response.json({ error: "Malformed payload" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: shipment } = await supabaseAdmin
          .from("shipments")
          .select("*, orders(*)")
          .eq("tracking_id", payload.tracking_id)
          .maybeSingle();
        if (!shipment) return Response.json({ error: "Unknown tracking id" }, { status: 404 });

        const order = shipment.orders as unknown as { id: string; total_amount: string; user_id: string };

        // Idempotency: a replayed event_id never triggers a second financial action.
        const { data: seen } = await supabaseAdmin
          .from("audit_events")
          .select("id")
          .eq("request_id", payload.event_id)
          .eq("event_type", "webhook.verified")
          .maybeSingle();

        if (seen) {
          await supabaseAdmin.from("audit_events").insert({
            user_id: shipment.user_id,
            order_id: order.id,
            category: "webhook",
            event_type: "webhook.duplicate",
            actor: "OmniTrust Verifier",
            entity: payload.tracking_id,
            status: "warning",
            request_id: payload.event_id,
            decision: "IDEMPOTENT_NO_OP",
            payload: { reason: "duplicate event id", financial_action: "none" },
          });
          return Response.json({ ok: true, duplicate: true, financial_action: "none" });
        }

        await supabaseAdmin.from("audit_events").insert({
          user_id: shipment.user_id,
          order_id: order.id,
          category: "webhook",
          event_type: "webhook.verified",
          actor: "OmniTrust Verifier",
          entity: payload.tracking_id,
          status: "success",
          request_id: payload.event_id,
          decision: "SIGNATURE_VALID",
          payload: {
            algorithm: "HMAC-SHA256",
            event: payload.event,
            condition: payload.condition,
            signature: `${signature.slice(0, 12)}…redacted`,
          },
        });

        const delivered = payload.event === "delivered";

        await supabaseAdmin
          .from("shipments")
          .update({
            status: delivered ? "delivered" : "damaged",
            condition: delivered ? "intact" : "damaged",
            last_event_at: new Date().toISOString(),
          })
          .eq("id", shipment.id);

        await supabaseAdmin
          .from("orders")
          .update({ status: delivered ? "delivered" : "disputed" })
          .eq("id", order.id);

        await supabaseAdmin.from("audit_events").insert({
          user_id: shipment.user_id,
          order_id: order.id,
          category: "logistics",
          event_type: delivered ? "shipment.delivered" : "shipment.damaged",
          actor: "Mock 3PL",
          entity: payload.tracking_id,
          status: delivered ? "success" : "warning",
          decision: delivered ? "DELIVERED" : "DAMAGE_REPORTED",
          payload: { condition: payload.condition, occurred_at: payload.occurred_at },
        });

        let disputeId: string | null = null;
        if (!delivered) {
          const preview = arbitrate(Number(order.total_amount));
          const { data: dispute } = await supabaseAdmin
            .from("disputes")
            .insert({
              user_id: shipment.user_id,
              order_id: order.id,
              status: "open",
              reason: preview.reason,
            })
            .select("id")
            .single();
          disputeId = dispute?.id ?? null;
          await supabaseAdmin.from("audit_events").insert({
            user_id: shipment.user_id,
            order_id: order.id,
            category: "dispute",
            event_type: "dispute.created",
            actor: "System",
            entity: disputeId ?? "",
            status: "warning",
            request_id: providerRef("dsp"),
            decision: "DISPUTE_OPEN",
            payload: { reason: preview.reason, escrow: "still held" },
          });
        }

        return Response.json({ ok: true, delivered, dispute_id: disputeId });
      },
    },
  },
});
