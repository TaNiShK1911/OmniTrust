import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/catalog", label: "Catalog" },
  { to: "/orders", label: "Orders" },
  { to: "/logistics", label: "Logistics" },
  { to: "/settings", label: "Demo control" },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="panel-dark sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-4 py-3 md:px-6">
          <Link to="/dashboard" className="font-display text-lg font-bold tracking-tight">
            Omni<span className="text-terminal">Trust</span>
          </Link>
          <span className="label-mono border border-terminal px-2 py-1 text-terminal">Razorpay test mode</span>
          <nav className="order-3 flex w-full flex-wrap gap-1 md:order-none md:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="label-mono px-3 py-2 text-navy-muted transition-colors hover:text-navy-foreground"
                activeProps={{ className: "text-terminal border-b-2 border-terminal" }}
                activeOptions={{ exact: item.to === "/dashboard" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={signOut} className="label-mono border border-navy-border px-3 py-2 hover:bg-white/5">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="headline-lg">{title}</h1>
            {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost" | "danger" | "terminal";
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "label-mono lift inline-flex items-center justify-center gap-2 px-4 py-2.5 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "outline" && "border border-primary text-primary hover:bg-primary/5",
        variant === "ghost" && "border border-border text-foreground hover:bg-muted",
        variant === "danger" && "border border-destructive text-destructive hover:bg-destructive/5",
        variant === "terminal" && "bg-terminal text-terminal-contrast hover:brightness-95",
        className,
      )}
    >
      {children}
    </button>
  );
}
