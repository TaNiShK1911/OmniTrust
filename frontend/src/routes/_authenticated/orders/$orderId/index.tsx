import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, MoneyCard, Panel, StatusBadge, Timeline } from "@/components/omni/ui";
import { inr, shortId, timeOf } from "@/lib/omni";
import { createEscrow, fetchOrder, registerShipment } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/orders/$orderId/")({
  head: () => ({
    meta: [
      { title: "Order detail — OmniTrust" },
      { name: "description", content: "Escrow, shipment custody and settlement controls for a negotiated order." },
      { property: "og:title", content: "Order detail — OmniTrust" },
      { property: "og:description", content: "Escrow, custody and settlement controls for one order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderDetail,
});

type Shipment = { id: string; tracking_id: string; status: string; carrier: string; condition: string };
type Dispute = { id: string; status: string; decision: string | null };

function OrderDetail() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const load = useServerFn(fetchOrder);
  const escrow = useServerFn(createEscrow);
  const ship = useServerFn(registerShipment);

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => load({ data: { id: orderId } }),
    refetchInterval: 5000,
  });

  const holdFunds = useMutation({
    mutationFn: () => escrow({ data: { orderId } }),
    onSuccess: () => order.refetch(),
  });
  const registerParcel = useMutation({
    mutationFn: () => ship({ data: { orderId } }),
    onSuccess: () => order.refetch(),
  });

  const o = order.data;
  const shipment = (o?.shipments as Shipment[] | undefined)?.[0];
  const dispute = (o?.disputes as Dispute[] | undefined)?.[0];

  const steps: { label: string; state: "done" | "current" | "todo" | "failed"; detail?: string | undefined }[] = [
    { label: "Consensus approved", state: "done", detail: o ? `Unit ${inr(o.unit_price)}` : undefined },
    {
      label: "Escrow held",
      state: o?.escrow_status === "held" || o?.settlement_ref ? "done" : "current",
      detail: o?.escrow_ref ?? "Funds not yet held",
    },
    {
      label: "Shipment registered",
      state: shipment ? "done" : o?.escrow_status === "held" ? "current" : "todo",
      detail: shipment?.tracking_id ?? "No tracking ID",
    },
    {
      label: "Delivery verified",
      state:
        shipment?.status === "delivered"
          ? "done"
          : shipment?.status === "damaged"
            ? "failed"
            : shipment
              ? "current"
              : "todo",
      detail: shipment ? `Condition ${shipment.condition}` : undefined,
    },
    {
      label: o?.status === "refunded" ? "Refund executed" : "Settlement released",
      state:
        o?.status === "settled"
          ? "done"
          : o?.status === "refunded"
            ? "failed"
            : shipment?.status === "delivered"
              ? "current"
              : "todo",
      detail: o?.settlement_ref ?? o?.refund_ref ?? undefined,
    },
  ];

  return (
    <AppShell
      title="Order detail"
      subtitle={`Order ${shortId(orderId)}${o ? ` · created ${timeOf(o.created_at)}` : ""}`}
      actions={
        <>
          <Link
            to="/audit/$orderId"
            params={{ orderId }}
            className="label-mono lift border border-border px-4 py-2.5"
          >
            Audit trail
          </Link>
          {shipment ? (
            <Link
              to="/shipments/$trackingId"
              params={{ trackingId: shipment.tracking_id }}
              className="label-mono lift border border-border px-4 py-2.5"
            >
              Shipment
            </Link>
          ) : null}
        </>
      }
    >
      {order.isLoading ? <ApiState loading /> : null}
      {order.isError ? <ApiState error={order.error} onRetry={() => order.refetch()} /> : null}

      {o ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <MoneyCard label="Order total" amount={inr(o.total_amount)} reference={o.idempotency_key} />
              <MoneyCard
                label="Escrow"
                amount={o.escrow_status === "held" ? inr(o.total_amount) : inr(0)}
                reference={o.escrow_ref}
                tone={o.escrow_status === "held" ? "active" : "neutral"}
              />
              <MoneyCard
                label={o.status === "refunded" ? "Refunded" : "Settled to seller"}
                amount={
                  o.status === "refunded"
                    ? inr(Number(o.refund_amount ?? 0))
                    : o.settlement_ref
                      ? inr(o.total_amount)
                      : inr(0)
                }
                reference={o.settlement_ref ?? o.refund_ref}
                tone={o.settlement_ref ? "success" : o.refund_ref ? "warning" : "neutral"}
              />
            </div>

            <Panel title="Line item">
              <div className="grid gap-4 sm:grid-cols-4">
                <LabelValue label="Product" value={o.product_name} />
                <LabelValue label="Quantity" value={`${o.quantity}`} mono />
                <LabelValue label="Unit price" value={inr(o.unit_price)} mono />
                <LabelValue label="Currency" value={o.currency} mono />
              </div>
            </Panel>

            <Panel title="Custody">
              {shipment ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  <LabelValue label="Tracking ID" value={shipment.tracking_id} mono />
                  <LabelValue label="Carrier" value={shipment.carrier} />
                  <LabelValue label="Condition" value={shipment.condition} />
                  <div>
                    <span className="label-mono text-muted-foreground">Status</span>
                    <div className="mt-1">
                      <StatusBadge status={shipment.status} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No shipment yet. Escrow must be held before a parcel can be registered.
                </p>
              )}
            </Panel>

            {dispute ? (
              <Panel title="Dispute">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <LabelValue label="Dispute ID" value={shortId(dispute.id)} mono />
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

          <div className="space-y-6">
            <Panel title="Workflow">
              <Timeline steps={steps} />
            </Panel>

            <Panel title="Actions">
              <div className="space-y-3">
                {holdFunds.isError ? <ApiState error={holdFunds.error} /> : null}
                {registerParcel.isError ? <ApiState error={registerParcel.error} /> : null}

                <ActionButton
                  onClick={() => holdFunds.mutate()}
                  disabled={holdFunds.isPending || o.escrow_status !== "none"}
                  className="w-full"
                >
                  {holdFunds.isPending ? "Holding funds…" : "Hold funds in escrow"}
                </ActionButton>
                <ActionButton
                  variant="outline"
                  onClick={() => registerParcel.mutate()}
                  disabled={registerParcel.isPending || o.escrow_status !== "held" || Boolean(shipment)}
                  className="w-full"
                >
                  {registerParcel.isPending ? "Registering…" : "Register shipment"}
                </ActionButton>
                <ActionButton
                  variant="terminal"
                  onClick={() => navigate({ to: "/orders/$orderId/settlement", params: { orderId } })}
                  disabled={!shipment}
                  className="w-full"
                >
                  Go to settlement gate →
                </ActionButton>
                <p className="text-sm text-muted-foreground">
                  Escrow is idempotent: a repeated hold is recorded as a suppressed duplicate, never a second charge.
                </p>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
