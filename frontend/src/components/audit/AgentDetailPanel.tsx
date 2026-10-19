/**
 * OmniTrust — Agent Detail Panel
 *
 * Displays structured evidence for the selected row from the AG Grid Command Center.
 * Shows consensus metrics, deterministic gate checks, model details, and PayPal references.
 * Never displays private chain-of-thought.
 */
import React from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Shield, ArrowUpRight, Copy, Check } from "lucide-react";
import { AgentAuditRow } from "@/lib/audit.types";

interface AgentDetailPanelProps {
  row: AgentAuditRow | null;
  onClose?: () => void;
}

export function AgentDetailPanel({ row, onClose }: AgentDetailPanelProps) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  if (!row) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <Shield className="mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">
          Select an order in the grid to inspect agentic decision telemetry
        </p>
      </div>
    );
  }

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/80 p-5 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Order Telemetry
          </span>
          <h3 className="font-mono text-sm font-semibold text-foreground flex items-center gap-2">
            {row.order_id}
            <button
              onClick={() => copyToClipboard(row.order_id, "order_id")}
              className="text-muted-foreground hover:text-foreground"
              title="Copy Order ID"
            >
              {copiedField === "order_id" ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </h3>
        </div>
        <Link
          to="/orders/$orderId"
          params={{ orderId: row.order_id }}
          className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/50 hover:bg-accent"
        >
          View Order <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded border border-border/50 bg-background/50 p-2.5">
          <span className="text-muted-foreground block text-[11px]">Consensus Score</span>
          <span className="text-base font-semibold text-primary">
            {row.consensus_score_pct.toFixed(1)}%
          </span>
        </div>
        <div className="rounded border border-border/50 bg-background/50 p-2.5">
          <span className="text-muted-foreground block text-[11px]">Payment State</span>
          <span className="font-mono font-medium text-foreground">{row.payment_state}</span>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between border-b border-border/40 py-1.5">
          <span className="text-muted-foreground">Product</span>
          <span className="font-medium text-foreground">{row.product_name}</span>
        </div>
        <div className="flex justify-between border-b border-border/40 py-1.5">
          <span className="text-muted-foreground">Buyer Bid vs Seller Ask</span>
          <span className="font-mono text-foreground">
            ${row.buyer_bid.toFixed(2)} / ${row.seller_counteroffer.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between border-b border-border/40 py-1.5">
          <span className="text-muted-foreground">Agreed Total</span>
          <span className="font-mono font-semibold text-foreground">
            ${row.total_amount.toFixed(2)} {row.currency}
          </span>
        </div>
        <div className="flex justify-between border-b border-border/40 py-1.5">
          <span className="text-muted-foreground">PayPal Authorization</span>
          <span className="font-mono text-foreground flex items-center gap-1">
            {row.authorization_id ? row.authorization_id : "None"}
            {row.authorization_id && (
              <button onClick={() => copyToClipboard(row.authorization_id!, "auth_id")}>
                {copiedField === "auth_id" ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            )}
          </span>
        </div>
        <div className="flex justify-between border-b border-border/40 py-1.5">
          <span className="text-muted-foreground">PayPal Capture</span>
          <span className="font-mono text-foreground flex items-center gap-1">
            {row.capture_id ? row.capture_id : "Not yet captured"}
            {row.capture_id && (
              <button onClick={() => copyToClipboard(row.capture_id!, "cap_id")}>
                {copiedField === "cap_id" ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            )}
          </span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Logistics Proof Hash</span>
          <span className="font-mono text-xs text-primary">{row.logistics_proof_hash}</span>
        </div>
      </div>

      <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Deterministic Gate Enforcement</span>
        </div>
        <p className="text-muted-foreground leading-relaxed text-[11px]">
          Agents autonomously negotiated pricing within configured spend caps. Money movement is
          strictly gated: funds remain in conditional PayPal authorization hold until delivery proof
          and non-dispute gates verify release.
        </p>
      </div>
    </div>
  );
}
