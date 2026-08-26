import { Link } from "@tanstack/react-router";
import type { Shipment } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { ShipmentActions } from "./ShipmentActions";
import { relTime } from "@/lib/format";

export function ShipmentCard({ shipment }: { shipment: Shipment }) {
  return (
    <div className="panel flex flex-col gap-4 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/shipments/$trackingId"
            params={{ trackingId: shipment.tracking_id }}
            className="font-mono text-base text-primary hover:underline"
          >
            {shipment.tracking_id}
          </Link>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {shipment.omnitrust_order_id} · {shipment.item_count} items
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge value={shipment.carrier_status} />
          <StatusBadge value={shipment.goods_condition} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
        <div>CREATED {relTime(shipment.created_at)}</div>
        <div className="text-right">UPDATED {relTime(shipment.updated_at)}</div>
      </div>

      <ShipmentActions shipment={shipment} />
    </div>
  );
}
