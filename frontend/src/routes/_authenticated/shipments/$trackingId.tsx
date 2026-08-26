import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, Panel, StatusBadge, Timeline } from "@/components/omni/ui";
import { inr, timeOf } from "@/lib/omni";
import { fetchShipment } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/shipments/$trackingId")({
  head: () => ({
    meta: [
      { title: "Shipment custody — OmniTrust" },
      { name: "description", content: "Tracking, carrier and condition for a shipment under escrow custody." },
      { property: "og:title", content: "Shipment custody — OmniTrust" },
      { property: "og:description", content: "Tracking, carrier and condition under escrow custody." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShipmentDetail,
});

function ShipmentDetail() {
  const { trackingId } = Route.useParams();
  const load = useServerFn(fetchShipment);
  const shipment = useQuery({
    queryKey: ["shipment", trackingId],
    queryFn: () => load({ data: { tracking: trackingId } }),
    refetchInterval: 5000,
  });

  const s = shipment.data;
  const order = s?.orders as
    | { id: string; product_name: string; total_amount: number; status: string }
    | undefined;

  return (
    <AppShell
      title="Shipment custody"
      subtitle={`Tracking ${trackingId}`}
      actions={
        <>
          {order ? (
            <Link
              to="/orders/$orderId"
              params={{ orderId: order.id }}
              className="label-mono lift border border-border px-4 py-2.5"
            >
              Open order
            </Link>
          ) : null}
          <Link to="/logistics" className="label-mono lift border border-primary px-4 py-2.5 text-primary">
            Warehouse portal →
          </Link>
        </>
      }
    >
      {shipment.isLoading ? <ApiState loading /> : null}
      {shipment.isError ? <ApiState error={shipment.error} onRetry={() => shipment.refetch()} /> : null}

      {s ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="Parcel">
              <div className="grid gap-4 sm:grid-cols-4">
                <LabelValue label="Tracking ID" value={s.tracking_id} mono />
                <LabelValue label="Carrier" value={s.carrier} />
                <LabelValue label="Condition" value={s.condition} />
                <div>
                  <span className="label-mono text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Linked order">
              {order ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <LabelValue label="Product" value={order.product_name} />
                  <LabelValue label="Order total" value={inr(order.total_amount)} mono />
                  <div>
                    <span className="label-mono text-muted-foreground">Order status</span>
                    <div className="mt-1">
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No order linked.</p>
              )}
            </Panel>
          </div>

          <Panel title="Custody chain">
            <Timeline
              steps={[
                { label: "Registered with 3PL", state: "done", detail: timeOf(s.created_at) },
                {
                  label: "Delivered",
                  state: s.status === "delivered" ? "done" : s.status === "damaged" ? "failed" : "current",
                  detail: s.status === "damaged" ? "Damage reported at handover" : "Awaits signed webhook",
                },
                {
                  label: "Escrow decision",
                  state: order?.status === "settled" ? "done" : order?.status === "refunded" ? "failed" : "todo",
                  detail: order?.status ?? undefined,
                },
              ]}
            />
            <p className="mt-4 text-sm text-muted-foreground">
              Delivery state only changes when a signed 3PL webhook is verified server-side.
            </p>
          </Panel>
        </div>
      ) : null}
    </AppShell>
  );
}
