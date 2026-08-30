import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, Panel, StatusBadge } from "@/components/omni/ui";
import { shortId } from "@/lib/omni";
import { fetchOrders } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/logistics")({
  head: () => ({
    meta: [
      { title: "Warehouse portal — OmniTrust" },
      {
        name: "description",
        content: "Registered shipments pending fulfillment by the 3PL provider.",
      },
      { property: "og:title", content: "Warehouse portal — OmniTrust" },
      { property: "og:description", content: "Registered shipments pending fulfillment by the 3PL provider." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Logistics,
});

type Shipment = { id: string; tracking_id: string; status: string; condition: string };

function Logistics() {
  const loadOrders = useServerFn(fetchOrders);

  const orders = useQuery({ queryKey: ["orders"], queryFn: () => loadOrders(), refetchInterval: 5000 });

  const shipments = (orders.data ?? []).flatMap((o) =>
    ((o.shipments as Shipment[] | null) ?? []).map((s) => ({ order: o, shipment: s })),
  );

  return (
    <AppShell
      title="Warehouse portal"
      subtitle="Registered shipments that have been delegated to the OmniTrust Mock 3PL."
    >
      {orders.isLoading ? <ApiState loading /> : null}
      {orders.isError ? <ApiState error={orders.error} onRetry={() => orders.refetch()} /> : null}

      <div className="grid gap-6">
        <Panel title="Registered shipments" dense>
          {shipments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No shipments registered yet. Hold escrow on an order and register a parcel first.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shipments.map(({ order, shipment }) => (
                <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <LabelValue label="Tracking" value={shipment.tracking_id} mono />
                    <LabelValue label="Order" value={shortId(order.id)} mono />
                    <div>
                      <span className="label-mono text-muted-foreground">Shipment</span>
                      <div className="mt-1">
                        <StatusBadge status={shipment.status} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to="/shipments/$trackingId"
                      params={{ trackingId: shipment.tracking_id }}
                      className="label-mono border border-border px-3 py-2"
                    >
                      Inspect locally
                    </Link>
                    <a
                      href={`${import.meta.env.VITE_LOGISTICS_URL ?? "http://localhost:5174"}/shipments/${shipment.tracking_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label-mono inline-flex items-center justify-center border border-transparent bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90"
                    >
                      Open Warehouse Portal ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
