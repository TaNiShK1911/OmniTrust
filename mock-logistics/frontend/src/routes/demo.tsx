import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { WarehouseLayout } from "@/components/WarehouseLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  shipmentsQuery,
  useCreateShipment,
  useMarkDelivered,
  useReportDamage,
  useResetShipment,
} from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Simulate Events — OmniLogistics" },
      {
        name: "description",
        content:
          "Trigger delivery and damage events to see the full settlement flow end to end.",
      },
      { property: "og:title", content: "Simulate Events — OmniLogistics" },
      {
        property: "og:description",
        content: "Trigger delivery and damage events to see the full settlement flow end to end.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  const { data: shipments } = useQuery(shipmentsQuery);
  const [target, setTarget] = useState<string>("");

  const create = useCreateShipment();
  const reset = useResetShipment();
  const deliver = useMarkDelivered();
  const damage = useReportDamage();

  const selected = target || shipments?.[0]?.tracking_id || "";
  const fail = (e: unknown) =>
    toast.error("Action failed.", {
      description: e instanceof Error ? e.message : "Shipment state was not changed.",
    });

  return (
    <WarehouseLayout>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="label-xs">Simulate Events</h1>
        <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-primary uppercase">
          Event Simulator
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel space-y-3 p-5">
          <h2 className="label-xs">Seed</h2>
          <p className="font-mono text-xs text-muted-foreground">
            Creates a new shipment by simulating a warehouse fulfillment request.
          </p>
          <Button
            disabled={create.isPending}
            onClick={() =>
              create.mutate({ orderId: `DEMO-${Date.now().toString().slice(-6)}`, itemCount: 1 }, {
                onSuccess: (s) => toast.success("Shipment created", { description: s.tracking_id }),
                onError: fail,
              })
            }
          >
            Create Sample Shipment
          </Button>
        </div>

        <div className="panel space-y-3 p-5">
          <h2 className="label-xs">Triggers</h2>
          <Select value={selected} onValueChange={setTarget}>
            <SelectTrigger className="font-mono text-xs">
              <SelectValue placeholder="Select shipment" />
            </SelectTrigger>
            <SelectContent>
              {(shipments ?? []).map((s) => (
                <SelectItem key={s.tracking_id} value={s.tracking_id} className="font-mono text-xs">
                  {s.tracking_id} · {s.carrier_status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!selected || deliver.isPending}
              onClick={() =>
                deliver.mutate(selected, {
                  onSuccess: () => toast.success("DELIVERED webhook sent"),
                  onError: fail,
                })
              }
            >
              Delivery Trigger
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selected || damage.isPending}
              onClick={() =>
                damage.mutate(
                  { trackingId: selected, reason: "Demo-triggered damage event" },
                  { onSuccess: () => toast.warning("DAMAGE webhook sent"), onError: fail },
                )
              }
            >
              Damage Trigger
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selected || reset.isPending}
              onClick={() =>
                reset.mutate(selected, {
                  onSuccess: () => toast.success("Shipment reset to IN_TRANSIT"),
                  onError: fail,
                })
              }
            >
              Reset Shipment
            </Button>
          </div>
        </div>
      </div>
    </WarehouseLayout>
  );
}
