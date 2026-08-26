import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { shipmentsQuery } from "@/lib/queries";
import { WarehouseLayout } from "@/components/WarehouseLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShipmentActions } from "@/components/ShipmentActions";
import { fullTime } from "@/lib/format";

export const Route = createFileRoute("/shipments/")({
  head: () => ({
    meta: [
      { title: "Shipments — OmniLogistics Mock 3PL" },
      {
        name: "description",
        content:
          "Searchable shipment register with tracking IDs, order IDs, carrier status, goods condition and operator actions.",
      },
      { property: "og:title", content: "Shipments — OmniLogistics Mock 3PL" },
      {
        property: "og:description",
        content: "Filter and operate every shipment in the Mock Logistics simulator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShipmentsPage,
});

function ShipmentsPage() {
  const { data, isLoading, isError } = useQuery(shipmentsQuery);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [condition, setCondition] = useState("ALL");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (s) =>
        (term === "" ||
          s.tracking_id.toLowerCase().includes(term) ||
          s.omnitrust_order_id.toLowerCase().includes(term)) &&
        (status === "ALL" || s.carrier_status === status) &&
        (condition === "ALL" || s.goods_condition === condition),
    );
  }, [data, q, status, condition]);

  return (
    <WarehouseLayout>
      <h1 className="label-xs mb-3">Shipment Register</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-xs font-mono text-sm"
          placeholder="Search tracking or order ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ALL", "IN_TRANSIT", "DELIVERED", "DAMAGED"].map((v) => (
              <SelectItem key={v} value={v} className="font-mono text-xs">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger className="w-40 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ALL", "INTACT", "DAMAGED"].map((v) => (
              <SelectItem key={v} value={v} className="font-mono text-xs">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              {[
                "Tracking ID",
                "Order ID",
                "Items",
                "Status",
                "Condition",
                "Created",
                "Updated",
                "Actions",
              ].map((h) => (
                <th key={h} className="label-xs px-3 py-2 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 font-mono text-muted-foreground">
                  Loading shipments...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 font-mono text-destructive">
                  Mock Logistics API unavailable on :5001
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 font-mono text-muted-foreground">
                  No shipments match these filters.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.tracking_id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    <Link
                      to="/shipments/$trackingId"
                      params={{ trackingId: s.tracking_id }}
                      className="text-primary hover:underline"
                    >
                      {s.tracking_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{s.omnitrust_order_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.item_count}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={s.carrier_status} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge value={s.goods_condition} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {fullTime(s.created_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {fullTime(s.updated_at)}
                  </td>
                  <td className="px-3 py-2">
                    <ShipmentActions shipment={s} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </WarehouseLayout>
  );
}
