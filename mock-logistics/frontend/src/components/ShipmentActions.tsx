import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Shipment } from "@/lib/mock-backend";
import { useMarkDelivered, useMarkTransit, useReportDamage } from "@/lib/queries";
import { PackageCheck, ScanLine, TriangleAlert } from "lucide-react";

function failToast(e: unknown) {
  toast.error("Action failed.", {
    description: `${e instanceof Error ? e.message : "Unknown error"} — shipment state was not changed.`,
  });
}

export function ShipmentActions({
  shipment,
  size = "sm",
}: {
  shipment: Shipment;
  size?: "sm" | "default";
}) {
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [reason, setReason] = useState("Package crushed during transit");

  const transit = useMarkTransit();
  const deliver = useMarkDelivered();
  const damage = useReportDamage();

  const busy = transit.isPending || deliver.isPending || damage.isPending;
  const delivered = shipment.status === "DELIVERED";

  return (
    <div className="flex flex-wrap gap-2">
      {shipment.status === "CREATED" ? (
        <Button
          size={size}
          variant="secondary"
          disabled={busy}
          onClick={() =>
            transit.mutate(shipment.tracking_id, {
              onSuccess: () =>
                toast.success("Shipment scanned", { description: "IN TRANSIT · INTACT" }),
              onError: failToast,
            })
          }
        >
          <ScanLine className="size-3.5" /> Scan into Transit
        </Button>
      ) : null}

      <Button size={size} disabled={busy || delivered} onClick={() => setDeliverOpen(true)}>
        <PackageCheck className="size-3.5" /> Mark Delivered
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={busy || shipment.condition === "DAMAGED"}
        onClick={() => setDamageOpen(true)}
      >
        <TriangleAlert className="size-3.5" /> Report Damage
      </Button>

      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark shipment as delivered?</DialogTitle>
            <DialogDescription>
              This will send a signed DELIVERED webhook to OmniTrust.
            </DialogDescription>
          </DialogHeader>
          <div className="panel space-y-1 p-3 font-mono text-sm">
            <div className="text-primary">{shipment.tracking_id}</div>
            <div className="text-muted-foreground">{shipment.order_id}</div>
            <div className="text-muted-foreground">{shipment.item_count} items</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeliverOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={deliver.isPending}
              onClick={() =>
                deliver.mutate(shipment.tracking_id, {
                  onSuccess: (res) => {
                    setDeliverOpen(false);
                    toast.success("DELIVERED", {
                      description:
                        res.webhook.status === "SENT"
                          ? "Webhook accepted by OmniTrust — HTTP 200"
                          : "Webhook delivery failed — retrying",
                    });
                  },
                  onError: failToast,
                })
              }
            >
              {deliver.isPending ? "Sending…" : "Confirm Delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={damageOpen} onOpenChange={setDamageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Shipment Damage</DialogTitle>
            <DialogDescription>
              OmniTrust receives a physical-event notification for this shipment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-xs">Tracking ID</Label>
              <div className="mt-1 font-mono text-sm text-primary">{shipment.tracking_id}</div>
            </div>
            <div>
              <Label className="label-xs" htmlFor="damage-reason">
                Reason
              </Label>
              <Textarea
                id="damage-reason"
                className="mt-1 font-mono text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDamageOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={damage.isPending || reason.trim().length === 0}
              onClick={() =>
                damage.mutate(
                  { trackingId: shipment.tracking_id, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setDamageOpen(false);
                      toast.warning("DAMAGED", {
                        description: "Damage event sent to OmniTrust.",
                      });
                    },
                    onError: failToast,
                  },
                )
              }
            >
              {damage.isPending ? "Reporting…" : "Report Damage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
