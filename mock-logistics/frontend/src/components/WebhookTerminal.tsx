import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { webhookEventsQuery, useRetryWebhook } from "@/lib/queries";
import type { WebhookEvent } from "@/lib/types";
import { clockTime, fullTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "./StatusBadge";
import { toast } from "sonner";

function codeClass(w: WebhookEvent) {
  if (w.delivery_status === "FAILED") return "text-destructive";
  if (w.delivery_status === "PENDING") return "text-warning";
  return "text-success";
}

function httpLabel(w: WebhookEvent): string {
  if (w.response_code) return `HTTP ${w.response_code}`;
  if (w.last_error) return w.last_error.slice(0, 30);
  return w.delivery_status;
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
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
              <span className="text-terminal-foreground">{w.event_type}</span>
              <span className="truncate text-muted-foreground">{w.tracking_id}</span>
              <span className={cn("ml-auto", codeClass(w))}>
                {httpLabel(w)}
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
                <SheetTitle className="font-mono text-sm">{selected.event_type}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 font-mono text-xs">
                <dl className="space-y-2">
                  {[
                    ["Event", selected.event_type],
                    ["Tracking", selected.tracking_id],
                    ["HTTP", selected.response_code ? `HTTP ${selected.response_code}` : "—"],
                    ["Attempts", `${selected.attempt_count} / 3`],
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
                      <StatusBadge value={selected.delivery_status} />
                    </dd>
                  </div>
                </dl>

                {selected.last_error ? (
                  <div className="rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    {selected.last_error}
                  </div>
                ) : null}

                {selected.delivery_status === "FAILED" ? (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate(selected.id, {
                          onSuccess: (w) => {
                            setSelected(w);
                            if (w.delivery_status === "SENT") {
                              toast.success("Webhook re-delivered", { description: `HTTP ${w.response_code}` });
                            } else {
                              toast.error("Retry failed", { description: w.last_error ?? "Unknown error" });
                            }
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
                    {JSON.stringify(parsePayload(selected.payload), null, 2)}
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
