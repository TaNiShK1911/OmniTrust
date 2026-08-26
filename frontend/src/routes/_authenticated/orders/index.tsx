import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/omni/AppShell";
import { ApiState, Panel, StatusBadge } from "@/components/omni/ui";
import { inr, shortId, timeOf } from "@/lib/omni";
import { fetchOrders } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — OmniTrust" },
      { name: "description", content: "Every negotiated order with escrow, shipment, settlement and refund state." },
      { property: "og:title", content: "Orders — OmniTrust" },
      { property: "og:description", content: "Negotiated orders with escrow and settlement state." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Orders,
});

function Orders() {
  const load = useServerFn(fetchOrders);
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => load() });

  return (
    <AppShell title="Orders" subtitle="Escrow, custody and settlement, one row per negotiated deal.">
      {orders.isLoading ? <ApiState loading /> : null}
      {orders.isError ? <ApiState error={orders.error} onRetry={() => orders.refetch()} /> : null}

      <Panel title="All orders" dense>
        {(orders.data ?? []).length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">
              No orders yet. Negotiate a catalog line item to create your first one.
            </p>
            <Link to="/catalog" className="label-mono mt-4 inline-block border border-primary px-3 py-2 text-primary">
              Go to catalog →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Order", "Created", "Product", "Qty", "Unit", "Total", "Escrow", "Status", ""].map((h) => (
                    <th key={h} className="label-mono px-3 py-2 text-left text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(orders.data ?? []).map((o) => (
                  <tr key={o.id} className="border-b border-border hover:bg-muted">
                    <td className="mono-id px-3 py-2">{shortId(o.id)}</td>
                    <td className="mono-id px-3 py-2 text-muted-foreground">{timeOf(o.created_at)}</td>
                    <td className="px-3 py-2">{o.product_name}</td>
                    <td className="mono-id px-3 py-2">{o.quantity}</td>
                    <td className="mono-id px-3 py-2">{inr(o.unit_price)}</td>
                    <td className="mono-id px-3 py-2">{inr(o.total_amount)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={o.escrow_status} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="label-mono text-primary underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
