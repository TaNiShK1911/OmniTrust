import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { healthQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  Boxes,
  LayoutDashboard,
  RefreshCw,
  Radio,
  FlaskConical,
  Truck,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/shipments", label: "Shipments", icon: Boxes },
  { to: "/webhooks", label: "Webhook Events", icon: Radio },
  { to: "/demo", label: "Simulate events", icon: FlaskConical },
] as const;

export function WarehouseLayout({ children }: { children: ReactNode }) {
  const health = useQuery(healthQuery);
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const up = health.isSuccess;
  const { operator, ready, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !operator) void navigate({ to: "/auth" });
  }, [ready, operator, navigate]);

  if (!ready || !operator) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="label-xs">Verifying operator session…</p>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            <span className="font-mono text-sm tracking-[0.2em] uppercase">Omnilogistics</span>
          </Link>
          <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Mock 3PL Simulator
          </span>

          <nav className="ml-2 flex flex-wrap gap-1">
            {nav.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] uppercase transition-colors",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] uppercase">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  up ? "animate-pulse bg-success" : "bg-destructive",
                )}
              />
              <span className={up ? "text-success" : "text-destructive"}>
                {up ? "Connected" : "Disconnected"}
              </span>
              <span className="text-muted-foreground">API</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries()}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <div className="hidden text-right sm:block">
              <div className="font-mono text-[11px] tracking-[0.1em] uppercase">
                {operator.name}
              </div>
              <div className="label-xs">{operator.role}</div>
            </div>
            <Button size="sm" variant="outline" onClick={signOut}>
              <LogOut className="size-3.5" /> Sign out
            </Button>

          </div>
        </div>
      </header>

      {!up && !health.isLoading ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-5 py-3">
          <div className="mx-auto flex max-w-[1600px] items-center gap-4 font-mono text-xs text-destructive">
            Mock Logistics API unavailable
            <Button size="sm" variant="outline" onClick={() => health.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1600px] px-5 py-6">{children}</main>
    </div>
  );
}
