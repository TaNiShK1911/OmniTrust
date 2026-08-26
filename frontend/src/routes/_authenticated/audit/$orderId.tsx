import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell } from "@/components/omni/AppShell";
import { ApiState, JsonBlock, Panel, StatusBadge } from "@/components/omni/ui";
import { CATEGORY_LABEL, shortId, timeOf, type AuditCategory } from "@/lib/omni";
import { fetchAudit } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/audit/$orderId")({
  head: () => ({
    meta: [
      { title: "Audit trail — OmniTrust" },
      {
        name: "description",
        content: "Append-only evidence for every agent proposal, guardrail decision, payment and webhook.",
      },
      { property: "og:title", content: "Audit trail — OmniTrust" },
      { property: "og:description", content: "Append-only evidence for the whole settlement workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Audit,
});

const FILTERS: ("all" | AuditCategory)[] = [
  "all",
  "ai",
  "guardrail",
  "payment",
  "logistics",
  "webhook",
  "settlement",
  "dispute",
  "refund",
];

function Audit() {
  const { orderId } = Route.useParams();
  const load = useServerFn(fetchAudit);
  const [filter, setFilter] = useState<"all" | AuditCategory>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ["audit", orderId],
    queryFn: () => load({ data: { orderId } }),
    refetchInterval: 5000,
  });

  const rows = (events.data ?? []).filter((e) => filter === "all" || e.category === filter);

  return (
    <AppShell
      title="Audit trail"
      subtitle={`Order ${shortId(orderId)} · append-only, chronological, secrets redacted`}
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
      {events.isLoading ? <ApiState loading /> : null}
      {events.isError ? <ApiState error={events.error} onRetry={() => events.refetch()} /> : null}

      <div className="mb-6 flex flex-wrap gap-px bg-border">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`label-mono px-3 py-2 ${
              filter === f ? "bg-navy text-navy-foreground" : "bg-background text-muted-foreground"
            }`}
          >
            {f === "all" ? "all" : (CATEGORY_LABEL[f] ?? f)}
          </button>
        ))}
      </div>

      <Panel title={`${rows.length} events`} dense>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No events for this filter.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="mono-id text-muted-foreground">{timeOf(e.created_at)}</span>
                    <span className="text-sm font-medium">{e.event_type}</span>
                    <span className="label-mono text-muted-foreground">{e.actor}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {e.latency_ms ? <span className="mono-id text-muted-foreground">{e.latency_ms}ms</span> : null}
                    {e.decision ? <span className="mono-id">{e.decision}</span> : null}
                    <StatusBadge status={e.status} />
                  </span>
                </button>
                {openId === e.id ? (
                  <div className="space-y-3 px-4 pb-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <p className="label-mono text-muted-foreground">
                        Category · {CATEGORY_LABEL[e.category as AuditCategory] ?? e.category}
                      </p>
                      <p className="label-mono text-muted-foreground">Entity · {e.entity ?? "—"}</p>
                      <p className="label-mono text-muted-foreground">Request · {e.request_id ?? "—"}</p>
                    </div>
                    <JsonBlock value={e.payload} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AppShell>
  );
}
