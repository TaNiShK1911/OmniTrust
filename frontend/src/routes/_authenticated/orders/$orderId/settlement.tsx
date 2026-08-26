import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, GateChecks, MoneyCard, Panel, StatusBadge } from "@/components/omni/ui";
import { inr, shortId } from "@/lib/omni";
import { fetchOrder, settleOrder } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/orders/$orderId/settlement")({
  head: () => ({
    meta: [
      { title: "Settlement gate — OmniTrust" },
      {
        name: "description",
        content: "Release escrow only when every deterministic settlement precondition passes.",
      },
      { property: "og:title", content: "Settlement gate — OmniTrust" },
      { property: "og:description", content: "Deterministic settlement preconditions before escrow release." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settlement,
});

function Settlement() {
  const { orderId } = Route.useParams();
  const load = useServerFn(fetchOrder);
  const settle = useServerFn(settleOrder);

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => load({ data: { id: orderId } }),
  });

  const release = useMutation({
    mutationFn: () => settle({ data: { orderId } }),
    onSuccess: () => order.refetch(),
  });

  const o = order.data;
  const shipment = (o?.shipments as { status: string }[] | undefined)?.[0];
  const dispute = (o?.disputes as { id: string; status: string }[] | undefined)?.[0];
  const checks = release.data?.checks ?? [];

  return (
    <AppShell
      title="Settlement gate"
      subtitle={`Order ${shortId(orderId)} · escrow release requires every check to pass`}
      actions={
        <Link
          to="/orders/$orderId"
          params={{ orderId }}
          className="label-mono lift border border-border px-4 py-2.5"
        >
          ← Back to order
        </Link>
      }
    >
      {order.isLoading ? <ApiState loading /> : null}
      {order.isError ? <ApiState error={order.error} onRetry={() => order.refetch()} /> : null}

      {o ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <MoneyCard label="Held in escrow" amount={inr(o.total_amount)} reference={o.escrow_ref} tone="active" />
              <MoneyCard
                label="Delivery status"
                amount={shipment?.status ?? "no shipment"}
                reference={shipment ? "signed webhook required" : null}
                tone={shipment?.status === "delivered" ? "success" : "pending"}
              />
              <MoneyCard
                label="Settlement reference"
                amount={o.settlement_ref ? "released" : "pending"}
                reference={o.settlement_ref}
                tone={o.settlement_ref ? "success" : "neutral"}
              />
            </div>

            <Panel title="Deterministic preconditions">
              {checks.length > 0 ? (
                <GateChecks checks={checks} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run the settlement attempt to evaluate signature verification, delivery confirmation, dispute state,
                  escrow custody and double-payout protection. Failures are recorded in the audit trail with no money
                  movement.
                </p>
              )}
              {release.isError ? (
                <div className="mt-4">
                  <ApiState error={release.error} />
                </div>
              ) : null}
              {release.data && !release.data.ok ? (
                <p className="mt-4 text-sm text-warning-foreground">
                  Settlement blocked. Nothing was paid out — resolve the failing precondition and retry.
                </p>
              ) : null}
            </Panel>

            {dispute ? (
              <Panel title="Blocking dispute">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusBadge status={dispute.status} />
                  <Link
                    to="/disputes/$disputeId"
                    params={{ disputeId: dispute.id }}
                    className="label-mono border border-primary px-3 py-2 text-primary"
                  >
                    Open arbitration →
                  </Link>
                </div>
              </Panel>
            ) : null}
          </div>

          <Panel title="Release control">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="label-mono text-muted-foreground">Order status</span>
                <StatusBadge status={o.status} />
              </div>
              <ActionButton
                variant="terminal"
                onClick={() => release.mutate()}
                disabled={release.isPending || o.status === "settled" || o.status === "refunded"}
                className="w-full"
              >
                {release.isPending ? "Evaluating…" : "Attempt settlement"}
              </ActionButton>
              <Link
                to="/audit/$orderId"
                params={{ orderId }}
                className="label-mono block border border-border px-3 py-2 text-center"
              >
                Inspect audit trail
              </Link>
              <p className="text-sm text-muted-foreground">
                A repeated release is refused by the double-payout check, so escrow can only leave custody once.
              </p>
            </div>
          </Panel>
        </div>
      ) : null}
    </AppShell>
  );
}
