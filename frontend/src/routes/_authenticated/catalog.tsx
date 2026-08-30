import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, Panel } from "@/components/omni/ui";
import { inr } from "@/lib/omni";
import { listProducts, startNegotiation } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog — OmniTrust" },
      { name: "description", content: "B2B catalog. Open a bounded agent negotiation on any line item." },
      { property: "og:title", content: "Catalog — OmniTrust" },
      { property: "og:description", content: "B2B catalog with bounded agent negotiation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Catalog,
});

function Catalog() {
  const navigate = useNavigate();
  const load = useServerFn(listProducts);
  const start = useServerFn(startNegotiation);

  const products = useQuery({ queryKey: ["products"], queryFn: () => load() });
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(10);
  const [discount, setDiscount] = useState(20);

  const mutation = useMutation({
    mutationFn: (productId: string) =>
      start({ data: { productId, quantity, targetDiscountPct: discount } }),
    onSuccess: (res) => navigate({ to: "/negotiate/$sessionId", params: { sessionId: res.id } }),
  });

  return (
    <AppShell
      title="Catalog"
      subtitle="Each line item carries a seller price floor that the agents never see."
    >
      {products.isLoading ? <ApiState loading /> : null}
      {products.isError ? <ApiState error={products.error} onRetry={() => products.refetch()} /> : null}
      {mutation.isError ? (
        <div className="mb-6">
          <ApiState error={mutation.error} message="The negotiation could not be opened." />
        </div>
      ) : null}

      <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-3">
        {(products.data ?? []).map((p) => {
          const open = selected === p.id;
          return (
            <article key={p.id} className="flex flex-col bg-card">
              <div className="border-b border-border p-5">
                <p className="label-mono text-muted-foreground">{p.sku}</p>
                <h2 className="headline-md mt-2">{p.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5">
                <LabelValue label="List price / unit" value={inr(p.list_price)} mono />
                <LabelValue label="Stock" value={`${p.stock} units`} mono />
              </div>
              {open ? (
                <div className="space-y-4 border-t border-border p-5">
                  <div>
                    <label className="label-mono text-muted-foreground" htmlFor={`qty-${p.id}`}>
                      Quantity
                    </label>
                    <input
                      id={`qty-${p.id}`}
                      type="number"
                      min={1}
                      max={500}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-2 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="label-mono text-muted-foreground" htmlFor={`dsc-${p.id}`}>
                      Buyer target discount · {discount}%
                    </label>
                    <input
                      id={`dsc-${p.id}`}
                      type="range"
                      min={5}
                      max={45}
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="mt-2 w-full accent-[oklch(0.577_0.235_267)]"
                    />
                    <p className="mono-id mt-1 text-muted-foreground">
                      Target unit price {inr(Math.round(Number(p.list_price) * (1 - discount / 100)))}
                    </p>
                  </div>
                  <ActionButton
                    onClick={() => mutation.mutate(p.id)}
                    disabled={mutation.isPending}
                    className="w-full"
                  >
                    {mutation.isPending ? "Opening…" : "Open negotiation →"}
                  </ActionButton>
                </div>
              ) : (
                <div className="border-t border-border p-5">
                  <ActionButton variant="outline" onClick={() => setSelected(p.id)} className="w-full">
                    Negotiate
                  </ActionButton>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <Panel title="How the price floor works" className="mt-8">
        <p className="text-sm text-muted-foreground">
          The buyer agent proposes a unit price without knowledge of the floor. The deterministic gatekeeper compares
          each proposal to the floor server-side; a proposal below it is rejected and the seller agent counters at the
          midpoint. After four turns the session expires with no order.
        </p>
      </Panel>
    </AppShell>
  );
}
