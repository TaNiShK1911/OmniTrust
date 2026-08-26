import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, GateChecks, LabelValue, MoneyCard, Panel, StatusBadge } from "@/components/omni/ui";
import { POLICY_REFUND_CAP_PCT, inr, shortId } from "@/lib/omni";
import { arbitrateDispute, fetchDispute, refundDispute } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/disputes/$disputeId")({
  head: () => ({
    meta: [
      { title: "Dispute arbitration — OmniTrust" },
      {
        name: "description",
        content: "Deterministic arbitration and a policy-capped refund for a damaged delivery.",
      },
      { property: "og:title", content: "Dispute arbitration — OmniTrust" },
      { property: "og:description", content: "Deterministic arbitration with a policy-capped refund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DisputeDetail,
});

function DisputeDetail() {
  const { disputeId } = Route.useParams();
  const load = useServerFn(fetchDispute);
  const arbitrate = useServerFn(arbitrateDispute);
  const refund = useServerFn(refundDispute);

  const dispute = useQuery({
    queryKey: ["dispute", disputeId],
    queryFn: () => load({ data: { id: disputeId } }),
  });

  const runArbitration = useMutation({
    mutationFn: () => arbitrate({ data: { id: disputeId } }),
    onSuccess: () => dispute.refetch(),
  });
  const runRefund = useMutation({
    mutationFn: () => refund({ data: { id: disputeId } }),
    onSuccess: () => dispute.refetch(),
  });

  const d = dispute.data;
  const order = d?.orders as
    | { id: string; product_name: string; total_amount: number; status: string; refund_ref: string | null }
    | undefined;
  const checks = runRefund.data?.checks ?? [];

  return (
    <AppShell
      title="Dispute arbitration"
      subtitle={`Dispute ${shortId(disputeId)} · refunds are capped at ${POLICY_REFUND_CAP_PCT}% of the order total`}
      actions={
        order ? (
          <Link
            to="/orders/$orderId"
            params={{ orderId: order.id }}
            className="label-mono lift border border-border px-4 py-2.5"
          >
            Open order
          </Link>
        ) : null
      }
    >
      {dispute.isLoading ? <ApiState loading /> : null}
      {dispute.isError ? <ApiState error={dispute.error} onRetry={() => dispute.refetch()} /> : null}

      {d ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <MoneyCard
                label="Order total"
                amount={inr(Number(order?.total_amount ?? 0))}
                reference={order?.product_name ?? null}
              />
              <MoneyCard
                label="Proposed refund"
                amount={d.refund_amount ? inr(Number(d.refund_amount)) : "—"}
                reference={d.penalty_pct ? `${d.penalty_pct}% partial` : null}
                tone={d.refund_amount ? "warning" : "neutral"}
              />
              <MoneyCard
                label="Refund reference"
                amount={order?.refund_ref ? "executed" : "pending"}
                reference={order?.refund_ref ?? null}
                tone={order?.refund_ref ? "success" : "neutral"}
              />
            </div>

            <Panel title="Arbitrator decision">
              {d.decision ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <LabelValue label="Decision" value={d.decision} />
                  <LabelValue label="Penalty" value={`${d.penalty_pct ?? 0}%`} mono />
                  <LabelValue
                    label="Confidence"
                    value={d.confidence ? `${Math.round(Number(d.confidence) * 100)}%` : "—"}
                    mono
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No decision yet. Arbitration is deterministic: damaged goods on a verified delivery produce a partial
                  refund, never an arbitrary payout.
                </p>
              )}
              {d.reason ? <p className="mt-4 text-sm">{d.reason}</p> : null}
            </Panel>

            <Panel title="Refund policy checks">
              {checks.length > 0 ? (
                <GateChecks checks={checks} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Executing the refund evaluates the arbitration state, the refund cap and double-refund protection
                  before any money moves.
                </p>
              )}
              {runRefund.data && !runRefund.data.ok ? (
                <p className="mt-4 text-sm text-warning-foreground">
                  Refund blocked by policy. Nothing was refunded.
                </p>
              ) : null}
            </Panel>
          </div>

          <Panel title="Controls">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="label-mono text-muted-foreground">Dispute status</span>
                <StatusBadge status={d.status} />
              </div>
              {runArbitration.isError ? <ApiState error={runArbitration.error} /> : null}
              {runRefund.isError ? <ApiState error={runRefund.error} /> : null}

              <ActionButton
                onClick={() => runArbitration.mutate()}
                disabled={runArbitration.isPending || d.status !== "open"}
                className="w-full"
              >
                {runArbitration.isPending ? "Arbitrating…" : "Run arbitration"}
              </ActionButton>
              <ActionButton
                variant="danger"
                onClick={() => runRefund.mutate()}
                disabled={runRefund.isPending || d.status !== "arbitrated"}
                className="w-full"
              >
                {runRefund.isPending ? "Refunding…" : "Execute capped refund"}
              </ActionButton>
              {order ? (
                <Link
                  to="/audit/$orderId"
                  params={{ orderId: order.id }}
                  className="label-mono block border border-border px-3 py-2 text-center"
                >
                  Inspect audit trail
                </Link>
              ) : null}
            </div>
          </Panel>
        </div>
      ) : null}
    </AppShell>
  );
}
