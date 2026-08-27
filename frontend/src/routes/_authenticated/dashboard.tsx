import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, Panel, StatusBadge } from "@/components/omni/ui";
import { CATEGORY_LABEL, inr, shortId, timeOf } from "@/lib/omni";
import { fetchDashboard, fetchDependencies } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — OmniTrust settlement console" },
      {
        name: "description",
        content: "Live view of negotiations, escrow, shipments, settlements and disputes across the demo.",
      },
      { property: "og:title", content: "Dashboard — OmniTrust settlement console" },
      { property: "og:description", content: "Live view of negotiations, escrow, shipments and settlements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const load = useServerFn(fetchDashboard);
  const deps = useServerFn(fetchDependencies);

  const snapshot = useQuery({ queryKey: ["dashboard"], queryFn: () => load(), refetchInterval: 4000 });
  const dependencies = useQuery({ queryKey: ["dependencies"], queryFn: () => deps() });

  const orders = snapshot.data?.orders ?? [];
  const negotiations = snapshot.data?.negotiations ?? [];
  const events = snapshot.data?.events ?? [];

  const kpis = [
    { label: "Active negotiations", value: negotiations.filter((n) => n.status === "active").length },
    { label: "Orders in escrow", value: orders.filter((o) => o.escrow_status === "held").length },
    {
      label: "In-transit shipments",
      value: orders.filter((o) => (o.shipments as { status: string }[])?.[0]?.status === "registered").length,
    },
    { label: "Settled orders", value: orders.filter((o) => o.status === "settled").length },
    {
      label: "Open disputes",
      value: orders.filter((o) =>
        (o.disputes as { status: string }[])?.some((d) => d.status !== "resolved"),
      ).length,
    },
  ];

  const latest = orders[0];

  return (
    <AppShell
      title="Settlement console"
      subtitle="Everything the deterministic backend allowed, in order."
      actions={
        <>
          <Link to="/catalog" className="label-mono lift bg-primary px-4 py-2.5 text-primary-foreground">
            Start new negotiation →
          </Link>
          {latest ? (
            <Link
              to="/orders/$orderId"
              params={{ orderId: latest.id }}
              className="label-mono lift border border-primary px-4 py-2.5 text-primary"
            >
              Open latest order
            </Link>
          ) : null}
          {latest ? (
            <Link
              to="/audit/$orderId"
              params={{ orderId: latest.id }}
              className="label-mono lift border border-border px-4 py-2.5"
            >
              View audit trail
            </Link>
          ) : null}
          <Link to="/logistics" className="label-mono lift border border-border px-4 py-2.5">
            Warehouse portal
          </Link>
        </>
      }
    >
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card p-4">
            <p className="label-mono text-muted-foreground">{k.label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {snapshot.isError ? (
        <div className="mt-6">
          <ApiState error={snapshot.error} onRetry={() => snapshot.refetch()} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Recent orders" className="lg:col-span-2" dense>
          {orders.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No orders yet. Start a negotiation from the catalog to generate one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Order", "Product", "Qty", "Total", "Escrow", "Shipment", "Status"].map((h) => (
                      <th key={h} className="label-mono px-3 py-2 text-left text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const shipment = (o.shipments as { status: string; tracking_id: string }[])?.[0];
                    return (
                      <tr key={o.id} className="border-b border-border hover:bg-muted">
                        <td className="px-3 py-2">
                          <Link
                            to="/orders/$orderId"
                            params={{ orderId: o.id }}
                            className="mono-id text-primary underline"
                          >
                            {shortId(o.id)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{o.product_name}</td>
                        <td className="mono-id px-3 py-2">{o.quantity}</td>
                        <td className="mono-id px-3 py-2">{inr(o.total_amount)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={o.escrow_status} />
                        </td>
                        <td className="px-3 py-2">
                          {shipment ? (
                            <Link
                              to="/shipments/$trackingId"
                              params={{ trackingId: shipment.tracking_id }}
                              className="mono-id text-primary underline"
                            >
                              {shipment.tracking_id}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={o.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Agent + system activity" dense>
            <ul className="divide-y divide-border">
              {events.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">No events recorded yet.</li>
              ) : (
                events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mono-id shrink-0 text-muted-foreground">{timeOf(e.created_at)}</span>
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{e.actor}</span>{" "}
                        <span className="text-muted-foreground">{e.event_type}</span>
                      </p>
                      <p className="label-mono mt-1 text-muted-foreground">
                        {CATEGORY_LABEL[e.category] ?? e.category}
                        {e.decision ? ` · ${e.decision}` : ""}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Panel>

          <Panel title="Dependencies">
            <div className="space-y-3">
              {(dependencies.data?.checks ?? []).map((d: any) => (
                <div key={d.name} className="flex items-center justify-between gap-3">
                  <LabelValue label={d.name} value={d.detail} />
                  <StatusBadge status={d.ok ? "healthy" : "failed"} tone={d.ok ? "success" : "failed"} />
                </div>
              ))}
              <ActionButton variant="ghost" onClick={() => dependencies.refetch()} className="w-full">
                Re-check dependencies
              </ActionButton>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
