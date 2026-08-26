import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { shipmentsQuery, statsQuery } from "@/lib/queries";
import { WarehouseLayout } from "@/components/WarehouseLayout";
import { ShipmentCard } from "@/components/ShipmentCard";
import { WebhookTerminal } from "@/components/WebhookTerminal";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Warehouse Dashboard — OmniLogistics Mock 3PL" },
      {
        name: "description",
        content:
          "Live operations dashboard for active shipments, transit scans, delivery and damage events, and outbound webhook status codes.",
      },
      { property: "og:title", content: "Warehouse Dashboard — OmniLogistics Mock 3PL" },
      {
        property: "og:description",
        content: "Active shipment queue and live outbound webhook feed for the 3PL simulator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Kpi({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="panel p-4">
      <div className="label-xs">{label}</div>
      <div className={`mt-2 font-mono text-3xl ${tone}`}>{value}</div>
    </div>
  );
}

function Dashboard() {
  const stats = useQuery(statsQuery);
  const shipments = useQuery(shipmentsQuery);
  const active = (shipments.data ?? []).filter((s) => s.status !== "DELIVERED");

  return (
    <WarehouseLayout>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="In Transit" value={stats.data?.in_transit ?? "—"} tone="text-info" />
        <Kpi label="Delivered" value={stats.data?.delivered ?? "—"} tone="text-success" />
        <Kpi label="Damaged" value={stats.data?.damaged ?? "—"} tone="text-warning" />
        <Kpi
          label="Webhook Success"
          value={stats.data ? `${stats.data.webhook_success_rate}%` : "—"}
          tone="text-primary"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="label-xs mb-3">Active Shipments</h2>
          {shipments.isLoading ? (
            <div className="panel p-6 font-mono text-sm text-muted-foreground">
              Loading shipments...
            </div>
          ) : shipments.isError ? (
            <div className="panel border-destructive/40 p-6 font-mono text-sm text-destructive">
              Mock Logistics API unavailable on :5001
            </div>
          ) : active.length === 0 ? (
            <div className="panel p-6 font-mono text-sm text-muted-foreground">
              No active shipments. Waiting for an OmniTrust dispatch.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {active.map((s) => (
                <ShipmentCard key={s.tracking_id} shipment={s} />
              ))}
            </div>
          )}
        </section>

        <WebhookTerminal className="h-fit xl:sticky xl:top-24" />
      </div>
    </WarehouseLayout>
  );
}
