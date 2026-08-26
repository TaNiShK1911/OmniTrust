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
  useCreateSampleShipment,
  useMarkDelivered,
  useReportDamage,
  useResetShipment,
  useToggleService,
  healthQuery,
} from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demo Controls — OmniLogistics Mock 3PL" },
      {
        name: "description",
        content:
          "Demo-only helpers to seed shipments, trigger delivery and damage events, reset state, and simulate a Mock Logistics API outage.",
      },
      { property: "og:title", content: "Demo Controls — OmniLogistics Mock 3PL" },
      {
        property: "og:description",
        content: "Seed, reset and trigger events for reliable happy-path and damage-path demos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  const { data: shipments } = useQuery(shipmentsQuery);
  const health = useQuery(healthQuery);
  const [target, setTarget] = useState<string>("");

  const create = useCreateSampleShipment();
  const reset = useResetShipment();
  const deliver = useMarkDelivered();
  const damage = useReportDamage();
  const toggle = useToggleService();

  const selected = target || shipments?.[0]?.tracking_id || "";
  const fail = (e: unknown) =>
    toast.error("Action failed.", {
      description: e instanceof Error ? e.message : "Shipment state was not changed.",
    });

  return (
    <WarehouseLayout>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="label-xs">Demo Controls</h1>
        <span className="rounded-sm border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-warning uppercase">
          Demo Only
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel space-y-3 p-5">
          <h2 className="label-xs">Seed</h2>
          <p className="font-mono text-xs text-muted-foreground">
            Creates a new CREATED shipment and emits a CREATE_SHIPMENT webhook.
          </p>
          <Button
            disabled={create.isPending}
            onClick={() =>
              create.mutate(undefined, {
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
                  {s.tracking_id} · {s.status}
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
                  onSuccess: () => toast.success("Shipment reset to CREATED"),
                  onError: fail,
                })
              }
            >
              Reset Shipment
            </Button>
          </div>
        </div>

        <div className="panel space-y-3 p-5 lg:col-span-2">
          <h2 className="label-xs">Service Simulation</h2>
          <p className="font-mono text-xs text-muted-foreground">
            Take the Mock Logistics API offline to exercise the unavailable-service states.
          </p>
          <Button
            variant={health.isSuccess ? "destructive" : "default"}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!health.isSuccess)}
          >
            {health.isSuccess ? "Simulate API Outage" : "Restore API"}
          </Button>
        </div>
      </div>
    </WarehouseLayout>
  );
}
