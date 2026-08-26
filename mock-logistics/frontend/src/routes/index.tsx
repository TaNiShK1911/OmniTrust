import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { healthQuery, shipmentsQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  Truck,
  Radio,
  ShieldCheck,
  PackageCheck,
  AlertTriangle,
  Terminal,
  ArrowRight,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OmniLogistics — 3PL Warehouse Operations Console" },
      {
        name: "description",
        content:
          "OmniLogistics is a mock 3PL warehouse console: scan shipments into transit, confirm deliveries, report damage, and watch signed webhooks stream live. Demo credentials included.",
      },
      { property: "og:title", content: "OmniLogistics — 3PL Warehouse Operations Console" },
      {
        property: "og:description",
        content:
          "Operate shipments and inspect signed outbound webhooks in a live 3PL simulator. Instant demo access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: PackageCheck,
    title: "Shipment lifecycle",
    body: "Scan parcels into transit, confirm proof of delivery, and file damage reports from one operator surface.",
  },
  {
    icon: Radio,
    title: "Live webhook terminal",
    body: "Every state change emits an outbound event. Inspect payloads, HTTP status, attempts, and retries as they happen.",
  },
  {
    icon: ShieldCheck,
    title: "Signed deliveries",
    body: "Events carry HMAC signatures so downstream systems can verify authenticity — the secret never leaves the server.",
  },
  {
    icon: AlertTriangle,
    title: "Failure simulation",
    body: "Force webhook failures, retry storms, and full API outages to rehearse how your integrations degrade.",
  },
];

function Landing() {
  const health = useQuery(healthQuery);
  const shipments = useQuery(shipmentsQuery);
  const { operator } = useAuth();
  const up = health.isSuccess;
  
  const allShipments = shipments.data ?? [];
  const inTransit = allShipments.filter(s => s.carrier_status === "IN_TRANSIT").length;
  const delivered = allShipments.filter(s => s.carrier_status === "DELIVERED").length;
  const damaged = allShipments.filter(s => s.carrier_status === "DAMAGED").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <Truck className="size-5 text-primary" />
          <span className="font-mono text-sm tracking-[0.2em] uppercase">Omnilogistics</span>
          <span className="hidden rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase sm:inline">
            Mock 3PL / Demo Environment
          </span>
          <div className="ml-auto flex items-center gap-2">
            {operator ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Open console</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">Get demo access</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="scanline border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase">
              <span
                className={`h-2 w-2 rounded-full ${up ? "animate-pulse bg-success" : "bg-destructive"}`}
              />
              <span className={up ? "text-success" : "text-destructive"}>
                {health.isLoading ? "Checking service…" : up ? "Service online" : "Service down"}
              </span>
              <span className="text-muted-foreground">/ API :5001</span>
            </div>

            <h1 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
              Run a 3PL warehouse
              <span className="block text-primary">without the warehouse.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground">
              OmniLogistics simulates a third-party logistics provider end to end — shipment
              scanning, delivery confirmation, damage reporting, and signed outbound webhooks —
              so you can build and test integrations against realistic operational traffic.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Start with demo credentials <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Create operator account</Link>
              </Button>
            </div>
            <p className="label-xs mt-3">
              operator@mocklogistics.io / warehouse123 — one click, no signup required
            </p>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Terminal className="size-4 text-primary" />
              <span className="label-xs">Live operations snapshot</span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["In transit", shipments.isSuccess ? inTransit : "—"],
                ["Delivered", shipments.isSuccess ? delivered : "—"],
                ["Damaged", shipments.isSuccess ? damaged : "—"],
              ].map(([label, value]) => (
                <div key={label as string} className="panel p-3">
                  <dt className="label-xs">{label as string}</dt>
                  <dd className="mt-1 font-mono text-2xl">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-2 font-mono text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-success" /> POST /webhooks/shipment.delivered →
                200
              </div>
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-warning" /> POST /webhooks/shipment.damaged →
                retry 2
              </div>
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-primary" /> GET /shipments → 200
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-mono text-sm tracking-[0.18em] uppercase">What the console does</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <article key={f.title} className="panel p-6">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-14">
          <div>
            <h2 className="text-2xl font-semibold">Ready to operate?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with the demo operator and start moving freight in seconds.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to={operator ? "/dashboard" : "/auth"}>
              {operator ? "Open warehouse console" : "Enter the warehouse"}{" "}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
          <span>OmniLogistics — Mock 3PL simulator</span>
          <span>Demo environment · No real freight was harmed</span>
        </div>
      </footer>
    </div>
  );
}
