import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error" | "neutral";

const toneClass: Record<Tone, string> = {
  info: "border-info/40 bg-info/12 text-info",
  success: "border-success/40 bg-success/12 text-success",
  warning: "border-warning/40 bg-warning/12 text-warning",
  error: "border-destructive/45 bg-destructive/12 text-destructive",
  neutral: "border-border bg-muted/60 text-muted-foreground",
};

export function toneFor(value: string): Tone {
  switch (value) {
    case "IN_TRANSIT":
    case "PENDING":
      return "info";
    case "DELIVERED":
    case "SENT":
    case "INTACT":
    case "OK":
      return "success";
    case "DAMAGED":
      return "warning";
    case "FAILED":
      return "error";
    default:
      return "neutral";
  }
}

export function StatusBadge({
  value,
  tone,
  className,
}: {
  value: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] tracking-[0.12em] uppercase",
        toneClass[tone ?? toneFor(value)],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value.replace(/_/g, " ")}
    </span>
  );
}
