import { type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { toneForStatus, type StatusTone } from "@/lib/omni";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-terminal-soft text-terminal-foreground border-terminal",
  active: "bg-primary/10 text-primary border-primary",
  pending: "bg-muted text-muted-foreground border-border",
  warning: "bg-warning/15 text-warning-foreground border-warning",
  failed: "bg-destructive/10 text-destructive border-destructive",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string;
  tone?: StatusTone;
  className?: string;
}) {
  const t = tone ?? toneForStatus(status);
  return (
    <span className={cn("label-mono inline-flex items-center border px-2 py-1", TONE_CLASS[t], className)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  dense,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={cn("panel", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="label-mono text-muted-foreground">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={dense ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function LabelValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-mono text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", mono && "mono-id")}>{value}</span>
    </div>
  );
}

export function GateChecks({ checks }: { checks: { label: string; pass: boolean; detail: string }[] }) {
  return (
    <ul className="divide-y divide-border border border-border">
      {checks.map((c) => (
        <li key={c.label} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-sm">
            {c.label}
            <span className="mono-id ml-2 text-muted-foreground">{c.detail}</span>
          </span>
          <StatusBadge status={c.pass ? "PASS" : "FAIL"} tone={c.pass ? "success" : "failed"} />
        </li>
      ))}
    </ul>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mono-id max-h-[420px] overflow-auto border border-navy-border bg-navy p-3 text-[12px] leading-relaxed text-navy-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function MoneyCard({
  label,
  amount,
  reference,
  tone = "neutral",
}: {
  label: string;
  amount: string;
  reference?: string | null;
  tone?: StatusTone;
}) {
  return (
    <div className={cn("border p-4", TONE_CLASS[tone])}>
      <p className="label-mono">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-foreground">{amount}</p>
      {reference ? <p className="mono-id mt-1 text-muted-foreground">{reference}</p> : null}
    </div>
  );
}

export function Timeline({
  steps,
}: {
  steps: { label: string; state: "done" | "current" | "todo" | "failed"; detail?: string | undefined }[];
}) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "mt-1 size-3 border",
                s.state === "done" && "border-terminal bg-terminal",
                s.state === "current" && "border-primary bg-primary",
                s.state === "failed" && "border-destructive bg-destructive",
                s.state === "todo" && "border-border bg-background",
              )}
            />
            {i < steps.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
          </div>
          <div className="pb-5">
            <p className={cn("text-sm font-medium", s.state === "todo" && "text-muted-foreground")}>{s.label}</p>
            {s.detail ? <p className="mono-id text-muted-foreground">{s.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ApiState({
  loading,
  error,
  onRetry,
  message,
}: {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  message?: string;
}) {
  if (loading) {
    return (
      <div className="panel p-6">
        <p className="label-mono text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="panel border-destructive p-6">
        <p className="label-mono text-destructive">Request failed</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {message ?? (error instanceof Error ? error.message : "Something went wrong.")}
        </p>
        {onRetry ? (
          <button onClick={onRetry} className="label-mono mt-4 border border-primary px-3 py-2 text-primary">
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  return null;
}
