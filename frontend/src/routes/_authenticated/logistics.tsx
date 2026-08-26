import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, Panel, StatusBadge } from "@/components/omni/ui";
import { shortId } from "@/lib/omni";
import { emitLogisticsEvent, fetchOrders } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/logistics")({
  head: () => ({
    meta: [
      { title: "Warehouse portal — OmniTrust" },
      {
        name: "description",
        content: "Send signed, tampered or replayed 3PL webhooks and watch the verifier decide.",
      },
      { property: "og:title", content: "Warehouse portal — OmniTrust" },
      { property: "og:description", content: "Signed, tampered and replayed 3PL webhook simulation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Logistics,
});

type Shipment = { id: string; tracking_id: string; status: string; condition: string };
type Mode = "valid" | "tampered" | "replay";

function Logistics() {
  const loadOrders = useServerFn(fetchOrders);
  const emit = useServerFn(emitLogisticsEvent);

  const orders = useQuery({ queryKey: ["orders"], queryFn: () => loadOrders(), refetchInterval: 5000 });
  const [event, setEvent] = useState<"delivered" | "damaged">("delivered");
  const [mode, setMode] = useState<Mode>("valid");

  const send = useMutation({
    mutationFn: (tracking: string) => emit({ data: { tracking, event, mode } }),
    onSuccess: () => orders.refetch(),
  });

  const shipments = (orders.data ?? []).flatMap((o) =>
    ((o.shipments as Shipment[] | null) ?? []).map((s) => ({ order: o, shipment: s })),
  );

  return (
    <AppShell
      title="Warehouse portal"
      subtitle="A mock third-party logistics console that signs its callbacks with a shared HMAC secret."
    >
      {orders.isLoading ? <ApiState loading /> : null}
      {orders.isError ? <ApiState error={orders.error} onRetry={() => orders.refetch()} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Callback configuration" className="lg:col-span-1">
          <div className="space-y-5">
            <div>
              <span className="label-mono text-muted-foreground">Event</span>
              <div className="mt-1 flex gap-px bg-border">
                {(["delivered", "damaged"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEvent(e)}
                    className={`label-mono flex-1 px-3 py-2.5 ${
                      event === e ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="label-mono text-muted-foreground">Signature mode</span>
              <div className="mt-1 flex flex-col gap-px bg-border">
                {(
                  [
                    { key: "valid", label: "Valid signature", hint: "Processed and applied" },
                    { key: "tampered", label: "Tampered signature", hint: "Rejected · no money moves" },
                    { key: "replay", label: "Replayed event id", hint: "Suppressed as duplicate" },
                  ] as { key: Mode; label: string; hint: string }[]
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    className={`px-3 py-2.5 text-left ${
                      mode === m.key ? "bg-navy text-navy-foreground" : "bg-background"
                    }`}
                  >
                    <span className="label-mono block">{m.label}</span>
                    <span className="mono-id block opacity-80">{m.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {send.isError ? <ApiState error={send.error} /> : null}
            {send.data ? (
              <div className="border border-border p-3">
                <p className="label-mono text-muted-foreground">Verifier response</p>
                <p className="mono-id mt-2">HTTP {send.data.status}</p>
                <p className="mono-id">
                  {send.data.error
                    ? `rejected · ${send.data.error}`
                    : send.data.duplicate
                      ? "duplicate suppressed"
                      : send.data.delivered
                        ? "delivery recorded"
                        : "damage recorded · dispute opened"}
                </p>
                {send.data.disputeId ? (
                  <Link
                    to="/disputes/$disputeId"
                    params={{ disputeId: send.data.disputeId }}
                    className="label-mono mt-3 inline-block border border-primary px-3 py-2 text-primary"
                  >
                    Open dispute →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Registered shipments" className="lg:col-span-2" dense>
          {shipments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No shipments registered yet. Hold escrow on an order and register a parcel first.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shipments.map(({ order, shipment }) => (
                <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <LabelValue label="Tracking" value={shipment.tracking_id} mono />
                    <LabelValue label="Order" value={shortId(order.id)} mono />
                    <div>
                      <span className="label-mono text-muted-foreground">Shipment</span>
                      <div className="mt-1">
                        <StatusBadge status={shipment.status} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to="/shipments/$trackingId"
                      params={{ trackingId: shipment.tracking_id }}
                      className="label-mono border border-border px-3 py-2"
                    >
                      Inspect
                    </Link>
                    <ActionButton
                      onClick={() => send.mutate(shipment.tracking_id)}
                      disabled={send.isPending}
                      variant={mode === "valid" ? "primary" : "danger"}
                    >
                      {send.isPending ? "Sending…" : "Send callback →"}
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
