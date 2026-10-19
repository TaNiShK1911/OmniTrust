/**
 * OmniTrust — AG Grid Agentic Audit Command Center
 *
 * Provides operators with real-time visibility into autonomous agent bids,
 * consensus scores, deterministic gate outcomes, logistics proofs, and
 * PayPal authorization/capture payment states.
 */
import React, { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef, RowSelectedEvent } from "ag-grid-community";
import { Shield, Search, RefreshCw, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

import { AgentAuditRow } from "@/lib/audit.types";
import { AgentDetailPanel } from "./AgentDetailPanel";

// Register Community Modules for AG Grid v36
ModuleRegistry.registerModules([AllCommunityModule]);

interface AgentAuditGridProps {
  data: AgentAuditRow[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function AgentAuditGrid({ data, isLoading, onRefresh }: AgentAuditGridProps) {
  const [selectedRow, setSelectedRow] = useState<AgentAuditRow | null>(null);
  const [quickFilter, setQuickFilter] = useState("");

  const columnDefs = useMemo<ColDef<AgentAuditRow>[]>(() => {
    return [
      {
        headerName: "Order ID",
        field: "order_id",
        minWidth: 150,
        cellRenderer: (params: any) => {
          const val = params.value || "";
          const short = val.length > 13 ? `${val.slice(0, 8)}…${val.slice(-4)}` : val;
          return <span className="font-mono text-xs font-semibold text-primary">{short}</span>;
        },
      },
      {
        headerName: "Product",
        field: "product_name",
        minWidth: 140,
        cellRenderer: (params: any) => <span className="font-medium text-xs">{params.value}</span>,
      },
      {
        headerName: "Buyer Agent Bid",
        field: "buyer_bid",
        minWidth: 130,
        valueFormatter: (p: any) => `$${Number(p.value || 0).toFixed(2)}`,
        cellClass: "font-mono text-xs",
      },
      {
        headerName: "Seller Counter",
        field: "seller_counteroffer",
        minWidth: 130,
        valueFormatter: (p: any) => `$${Number(p.value || 0).toFixed(2)}`,
        cellClass: "font-mono text-xs",
      },
      {
        headerName: "Consensus Score",
        field: "consensus_score_pct",
        minWidth: 140,
        cellRenderer: (params: any) => {
          const score = Number(params.value || 0);
          return (
            <div className="flex items-center gap-2 h-full">
              <div className="h-1.5 w-12 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(score, 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs font-semibold">{score.toFixed(1)}%</span>
            </div>
          );
        },
      },
      {
        headerName: "Payment State",
        field: "payment_state",
        minWidth: 160,
        cellRenderer: (params: any) => {
          const state = params.value || "PENDING";
          let badgeClass = "bg-muted text-muted-foreground border-border";
          let Icon = Clock;

          if (state === "FUNDS_AUTHORIZED") {
            badgeClass = "bg-primary/10 text-primary border-primary/30";
            Icon = Shield;
          } else if (state === "CAPTURED_AND_SETTLED") {
            badgeClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
            Icon = CheckCircle2;
          } else if (state === "PAYMENT_FAILED" || state === "DISPUTED") {
            badgeClass = "bg-destructive/10 text-destructive border-destructive/30";
            Icon = AlertTriangle;
          }

          return (
            <div className="flex items-center h-full">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${badgeClass}`}>
                <Icon className="h-3 w-3" />
                {state}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "PayPal Auth ID",
        field: "authorization_id",
        minWidth: 150,
        cellRenderer: (params: any) => {
          const val = params.value;
          if (!val) return <span className="text-muted-foreground text-xs italic">Unassigned</span>;
          const short = val.length > 12 ? `${val.slice(0, 7)}…${val.slice(-4)}` : val;
          return <span className="font-mono text-xs text-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/50">{short}</span>;
        },
      },
      {
        headerName: "Logistics Proof Hash",
        field: "logistics_proof_hash",
        minWidth: 160,
        cellRenderer: (params: any) => {
          const val = params.value || "PENDING";
          const isVerified = val.includes("verified");
          return (
            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${isVerified ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-muted text-muted-foreground border-border"}`}>
              {val}
            </span>
          );
        },
      },
    ];
  }, []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    flex: 1,
  }), []);

  const onRowSelected = (e: RowSelectedEvent<AgentAuditRow>) => {
    if (e.node.isSelected() && e.data) {
      setSelectedRow(e.data);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by order ID, product, state, or PayPal ID…"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="w-full rounded-md border border-border bg-card/50 py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh Telemetry
            </button>
          ) : null}
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary font-semibold">
            AG Grid Community v36
          </div>
        </div>
      </div>

      {/* Main Layout: Grid on left/top, Detail Panel on right/bottom */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div style={{ height: "460px", width: "100%" }}>
            <AgGridReact<AgentAuditRow>
              rowData={data}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowSelection="single"
              onRowSelected={onRowSelected}
              quickFilterText={quickFilter}
              animateRows={true}
              pagination={true}
              paginationPageSize={10}
              paginationPageSizeSelector={[10, 25, 50]}
            />
          </div>
        </div>

        <div className="lg:col-span-1">
          <AgentDetailPanel row={selectedRow} />
        </div>
      </div>
    </div>
  );
}
