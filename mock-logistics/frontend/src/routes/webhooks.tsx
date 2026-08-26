import { createFileRoute } from "@tanstack/react-router";
import { WarehouseLayout } from "@/components/WarehouseLayout";
import { WebhookTerminal } from "@/components/WebhookTerminal";
import { useQuery } from "@tanstack/react-query";
import { webhookEventsQuery } from "@/lib/queries";

export const Route = createFileRoute("/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhook Events — OmniLogistics Mock 3PL" },
      {
        name: "description",
        content:
          "Every outbound webhook to OmniTrust: event type, delivery attempts, HTTP response codes, HMAC signatures and payloads.",
      },
      { property: "og:title", content: "Webhook Events — OmniLogistics Mock 3PL" },
      {
        property: "og:description",
        content: "Inspect outbound webhook payloads, attempts and HTTP status codes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const { data } = useQuery(webhookEventsQuery);
  const all = data ?? [];
  const counts = {
    sent: all.filter((w) => w.delivery_status === "SENT").length,
    retrying: all.filter((w) => w.delivery_status === "PENDING").length,
    failed: all.filter((w) => w.delivery_status === "FAILED").length,
  };

  return (
    <WarehouseLayout>
      <h1 className="label-xs mb-3">Outbound Webhook Events</h1>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="label-xs">Delivered</div>
          <div className="mt-2 font-mono text-2xl text-success">{counts.sent}</div>
        </div>
        <div className="panel p-4">
          <div className="label-xs">Pending / Retrying</div>
          <div className="mt-2 font-mono text-2xl text-warning">{counts.retrying}</div>
        </div>
        <div className="panel p-4">
          <div className="label-xs">Failed</div>
          <div className="mt-2 font-mono text-2xl text-destructive">{counts.failed}</div>
        </div>
      </div>
      <WebhookTerminal />
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        Click any row to inspect the payload, HMAC signature and delivery attempts.
      </p>
    </WarehouseLayout>
  );
}
