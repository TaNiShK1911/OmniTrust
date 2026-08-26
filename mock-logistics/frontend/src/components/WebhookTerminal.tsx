import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { webhookEventsQuery, useRetryWebhook } from "@/lib/queries";
import type { WebhookEvent } from "@/lib/mock-backend";
import { clockTime, fullTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "./StatusBadge";
import { toast } from "sonner";

function codeClass(w: WebhookEvent) {
  if (w.status === "FAILED") return "text-destructive";
  if (w.status === "RETRYING") return "text-warning";
  return "text-success";
}

export function WebhookTerminal({
  trackingId,
  limit = 200,
  className,
}: {
  trackingId?: string;
  limit?: number;
  className?: string;
}) {
  const { data, isLoading } = useQuery(webhookEventsQuery);
  const [selected, setSelected] = useState<WebhookEvent | null>(null);
  const retry = useRetryWebhook();

  const rows = (data ?? [])
    .filter((w) => (trackingId ? w.tracking_id === trackingId : true))
    .slice(0, limit);

  return (
    <div className={cn("panel flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border bg-panel px-3 py-2">
        <span className="label-xs">Outbound Event Feed</span>
        <span className="font-mono text-[10px] text-muted-foreground">{rows.length} events</span>
      </div>
      <div className="max-h-[420px] flex-1 overflow-y-auto bg-terminal p-2 font-mono text-xs">
        {isLoading ? (
          <div className="p-3 text-muted-foreground">Loading events…</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-muted-foreground">No outbound events yet.</div>
        ) : (
          rows.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className="flex w-full items-center gap-3 rounded-sm px-2 py-1 text-left hover:bg-primary/10"
            >
              <span className="text-muted-foreground">{clockTime(w.created_at)}</span>
              <span className="text-terminal-foreground">{w.event}</span>
              <span className="truncate text-muted-foreground">{w.tracking_id}</span>
              <span className={cn("ml-auto", codeClass(w))}>
                {w.status === "RETRYING"
                  ? `RETRY ${w.attempt}/${w.max_attempts}`
                  : (w.http_status ?? w.http_text)}
              </span>
            </button>
          ))
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{selected.event}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 font-mono text-xs">
                <dl className="space-y-2">
                  {[
                    ["Event", selected.event],
                    ["Tracking", selected.tracking_id],
                    ["HTTP", selected.http_status ? selected.http_text : selected.http_text],
                    ["Attempt", `${selected.attempt} / ${selected.max_attempts}`],
                    ["Signature", selected.signature],
                    ["Timestamp", fullTime(selected.created_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-border pb-1">
                      <dt className="text-muted-foreground uppercase">{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 pt-1">
                    <dt className="text-muted-foreground uppercase">Status</dt>
                    <dd>
                      <StatusBadge value={selected.status} />
                    </dd>
                  </div>
                </dl>

                {selected.status === "RETRYING" ? (
                  <div className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-warning">
                    WEBHOOK DELIVERY FAILED
                    <br />
                    Attempt {selected.attempt}/{selected.max_attempts} — {selected.http_text}
                    <br />
                    Retrying…
                  </div>
                ) : null}

                {selected.status === "FAILED" ? (
                  <div className="space-y-2 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    <div>WEBHOOK DELIVERY FAILED — {selected.max_attempts} attempts exhausted.</div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate(selected.id, {
                          onSuccess: (w) => {
                            setSelected(w);
                            toast.success("Webhook re-delivered", { description: "HTTP 200 OK" });
                          },
                          onError: () => toast.error("Retry failed."),
                        })
                      }
                    >
                      Retry Now
                    </Button>
                  </div>
                ) : null}

                <div>
                  <div className="label-xs mb-1">Payload</div>
                  <pre className="overflow-x-auto rounded-sm bg-terminal p-3 text-terminal-foreground">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Signature shown for verification only. The shared secret is never exposed to the
                  browser.
                </p>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
