import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { shipmentEventsQuery, shipmentQuery } from "@/lib/queries";
import { WarehouseLayout } from "@/components/WarehouseLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { ShipmentActions } from "@/components/ShipmentActions";
import { WebhookTerminal } from "@/components/WebhookTerminal";
import { fullTime } from "@/lib/format";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/shipments/$trackingId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.trackingId} — Shipment Detail | OmniLogistics` },
      {
        name: "description",
        content: `Timeline, event history, webhook attempts and operator actions for shipment ${params.trackingId}.`,
      },
      { property: "og:title", content: `${params.trackingId} — Shipment Detail` },
      {
        property: "og:description",
        content: `Full audit trail and webhook delivery status for shipment ${params.trackingId}.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShipmentDetail,
});

function ShipmentDetail() {
  const { trackingId } = Route.useParams();
  const shipment = useQuery(shipmentQuery(trackingId));
  const events = useQuery(shipmentEventsQuery(trackingId));

  return (
    <WarehouseLayout>
      <Link
        to="/shipments"
        className="label-xs mb-4 inline-flex items-center gap-1 hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" /> Back to shipments
      </Link>

      {shipment.isLoading ? (
        <div className="panel p-6 font-mono text-sm text-muted-foreground">Loading shipment...</div>
      ) : shipment.isError || !shipment.data ? (
        <div className="panel border-destructive/40 p-6 font-mono text-sm text-destructive">
          {shipment.error instanceof Error ? shipment.error.message : "Shipment unavailable"}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <div className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-mono text-xl text-primary">{shipment.data.tracking_id}</h1>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {shipment.data.order_id} · {shipment.data.item_count} items
                  </p>
                </div>
                <div className="flex gap-2">
                  <StatusBadge value={shipment.data.status} />
                  <StatusBadge value={shipment.data.condition} />
                </div>
              </div>

              <dl className="mt-5 grid gap-3 font-mono text-xs sm:grid-cols-2">
                <div>
                  <dt className="label-xs">Created</dt>
                  <dd className="mt-1">{fullTime(shipment.data.created_at)}</dd>
                </div>
                <div>
                  <dt className="label-xs">Updated</dt>
                  <dd className="mt-1">{fullTime(shipment.data.updated_at)}</dd>
                </div>
                {shipment.data.damage_reason ? (
                  <div className="sm:col-span-2">
                    <dt className="label-xs">Damage Reason</dt>
                    <dd className="mt-1 text-warning">{shipment.data.damage_reason}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5">
                <ShipmentActions shipment={shipment.data} size="default" />
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="label-xs mb-3">Event History</h2>
              {events.isLoading ? (
                <p className="font-mono text-xs text-muted-foreground">Loading events…</p>
              ) : (events.data ?? []).length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground">No events recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {(events.data ?? []).map((e) => (
                    <li key={e.id} className="flex gap-3 border-l border-border pl-4">
                      <span className="-ml-[21px] mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div className="font-mono text-xs">
                        <div className="text-foreground">{e.type.replace(/_/g, " ")}</div>
                        <div className="text-muted-foreground">{e.detail}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {fullTime(e.created_at)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <WebhookTerminal trackingId={trackingId} className="h-fit xl:sticky xl:top-24" />
        </div>
      )}
    </WarehouseLayout>
  );
}
