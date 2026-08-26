import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, GateChecks, LabelValue, Panel, StatusBadge } from "@/components/omni/ui";
import { inr, shortId, timeOf, type NegotiationTurn } from "@/lib/omni";
import { advanceNegotiation, approveNegotiation, fetchNegotiation } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/negotiate/$sessionId")({
  head: () => ({
    meta: [
      { title: "Agent negotiation — OmniTrust" },
      {
        name: "description",
        content: "Watch the buyer agent propose, the deterministic gatekeeper rule, and the seller agent counter.",
      },
      { property: "og:title", content: "Agent negotiation — OmniTrust" },
      { property: "og:description", content: "Bounded, four-turn agent negotiation with a deterministic gatekeeper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Negotiate,
});

function Negotiate() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const load = useServerFn(fetchNegotiation);
  const advance = useServerFn(advanceNegotiation);
  const approve = useServerFn(approveNegotiation);

  const session = useQuery({
    queryKey: ["negotiation", sessionId],
    queryFn: () => load({ data: { id: sessionId } }),
  });

  const nextTurn = useMutation({
    mutationFn: () => advance({ data: { id: sessionId } }),
    onSuccess: () => session.refetch(),
  });

  const accept = useMutation({
    mutationFn: () => approve({ data: { id: sessionId } }),
    onSuccess: (res) => navigate({ to: "/orders/$orderId", params: { orderId: res.orderId } }),
  });

  const n = session.data?.negotiation;
  const product = n?.product as { name: string; sku: string; list_price: number } | undefined;
  const turns = (n?.turns as unknown as NegotiationTurn[]) ?? [];
  const aiError = session.data?.aiError ?? null;

  return (
    <AppShell
      title="Agent negotiation"
      subtitle={`Session ${shortId(sessionId)} · hard cap of ${n?.max_turns ?? 4} turns`}
    >
      {session.isLoading ? <ApiState loading /> : null}
      {session.isError ? <ApiState error={session.error} onRetry={() => session.refetch()} /> : null}

      {n ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel
              title="Turn transcript"
              action={<StatusBadge status={n.status} />}
              dense
            >
              <ul className="divide-y divide-border">
                {turns.length === 0 ? (
                  <li className="p-6 text-sm text-muted-foreground">
                    No turns yet. Run the first turn to see the buyer agent propose a price.
                  </li>
                ) : (
                  turns.map((t, i) => (
                    <li key={`${t.turn}-${t.actor}-${i}`} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="label-mono text-muted-foreground">
                          Turn {t.turn} · {t.actor.replace(/_/g, " ")}
                        </p>
                        <span className="mono-id text-muted-foreground">{timeOf(t.at)}</span>
                      </div>
                      <p className="mt-2 text-sm">{t.message}</p>
                      {t.proposed_unit_price ? (
                        <p className="mono-id mt-2">Unit price {inr(t.proposed_unit_price)}</p>
                      ) : null}
                      {t.checks ? (
                        <div className="mt-3">
                          <GateChecks checks={t.checks} />
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </Panel>

            {aiError ? (
              <Panel title="AI provider notice">
                <p className="text-sm text-muted-foreground">
                  The model call failed ({aiError}). The deterministic fallback proposer was used instead, so the
                  negotiation still completes with the same policy checks.
                </p>
              </Panel>
            ) : null}
          </div>

          <div className="space-y-6">
            <Panel title="Session parameters">
              <div className="grid gap-4">
                <LabelValue label="Product" value={product?.name ?? "—"} />
                <LabelValue label="SKU" value={product?.sku ?? "—"} mono />
                <LabelValue label="Quantity" value={`${n.quantity} units`} mono />
                <LabelValue label="List price" value={inr(Number(product?.list_price ?? 0))} mono />
                <LabelValue label="Buyer target" value={inr(Number(n.buyer_target))} mono />
                <LabelValue label="Turns used" value={`${n.turn_count} / ${n.max_turns}`} mono />
                <LabelValue
                  label="Agreed unit price"
                  value={n.agreed_unit_price ? inr(Number(n.agreed_unit_price)) : "—"}
                  mono
                />
                <LabelValue label="Price floor" value="Hidden from both agents" />
              </div>
            </Panel>

            <Panel title="Controls">
              <div className="space-y-3">
                {nextTurn.isError ? <ApiState error={nextTurn.error} /> : null}
                {accept.isError ? <ApiState error={accept.error} /> : null}

                <ActionButton
                  onClick={() => nextTurn.mutate()}
                  disabled={n.status !== "active" || nextTurn.isPending}
                  className="w-full"
                >
                  {nextTurn.isPending ? "Running turn…" : "Run next turn →"}
                </ActionButton>

                <ActionButton
                  variant="terminal"
                  onClick={() => accept.mutate()}
                  disabled={n.status !== "agreed" || accept.isPending}
                  className="w-full"
                >
                  {accept.isPending ? "Creating order…" : "Approve consensus & create order"}
                </ActionButton>

                {n.status === "expired" ? (
                  <p className="text-sm text-muted-foreground">
                    Turn budget exhausted with no agreement. No order was created — that is the intended guardrail.
                  </p>
                ) : null}
                {n.status === "approved" ? (
                  <p className="text-sm text-muted-foreground">
                    This session already produced an order. Open Orders to continue the workflow.
                  </p>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
