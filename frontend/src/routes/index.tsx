import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Globe,
  Server,
  Bot,
  ShieldCheck,
  CreditCard,
  FileText,
  Truck,
  ArrowRight,
  ArrowDown,
  Lock,
} from "lucide-react";

const TITLE = "OmniTrust — AI agents that negotiate, transact and settle with guardrails";
const DESC =
  "A transparent AI settlement console: bounded agent negotiation, deterministic policy gates, test-mode escrow, signed logistics webhooks and an immutable audit trail.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STORY = [
  {
    step: "01",
    name: "Negotiate",
    body: "Buyer and Seller agents reach bounded consensus inside a hard four-turn budget.",
  },
  {
    step: "02",
    name: "Gate",
    body: "Deterministic policy checks block unsafe proposals before any money moves.",
  },
  {
    step: "03",
    name: "Transact",
    body: "Test-mode escrow contains the financial action with an idempotent request id.",
  },
  {
    step: "04",
    name: "Verify & settle",
    body: "Signed logistics events trigger settlement, or dispute handling and refund.",
  },
];

const GUARANTEES = [
  "Maximum 4 negotiation turns, enforced server-side",
  "Price floor enforced in code, never by the model",
  "Provider secrets remain server-side, always",
  "HMAC-SHA256 verification on every logistics webhook",
  "Idempotent money actions — replays are no-ops",
  "Complete, append-only audit trail per order",
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-4 py-4 md:px-6">
          <span className="font-display text-lg font-bold tracking-tight">
            Omni<span className="text-terminal-foreground">Trust</span>
          </span>
          <nav className="hidden gap-1 md:flex">
            <a href="#how-it-works" className="label-mono px-3 py-2 text-muted-foreground hover:text-foreground">
              How it works
            </a>
            <a href="#architecture" className="label-mono px-3 py-2 text-muted-foreground hover:text-foreground">
              Architecture
            </a>
            <a href="#guarantees" className="label-mono px-3 py-2 text-muted-foreground hover:text-foreground">
              Guarantees
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/auth" className="label-mono px-3 py-2 text-foreground hover:text-primary">
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup", next: "/dashboard" }}
              className="label-mono lift bg-primary px-4 py-2.5 text-primary-foreground"
            >
              Enter console →
            </Link>
          </div>
        </div>
      </header>

      <section className="grid-backdrop border-b border-border">
        <div className="mx-auto max-w-[1280px] px-4 py-20 md:px-6 md:py-28">
          <span className="label-mono inline-flex border border-terminal bg-terminal-soft px-2 py-1 text-terminal-foreground">
            Razorpay test mode · glass-box console
          </span>
          <h1 className="display-lg mt-6 max-w-4xl">
            AI agents that negotiate, transact, and settle{" "}
            <span className="text-terminal-foreground">with guardrails.</span>
          </h1>
          <p className="body-lg mt-6 max-w-2xl text-muted-foreground">
            OmniTrust runs a full commercial settlement — agent negotiation, deterministic policy gating, escrow,
            physical shipment verification and refund — while showing you exactly what the model suggested versus what
            the code actually allowed.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup", next: "/dashboard" }}
              className="label-mono lift bg-primary px-6 py-3.5 text-primary-foreground"
            >
              Enter OmniTrust →
            </Link>
            <a href="#architecture" className="label-mono lift border border-primary px-6 py-3.5 text-primary">
              View architecture
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section-pad border-b border-border">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <h2 className="headline-lg">The settlement journey</h2>
          <div className="mt-10 grid gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
            {STORY.map((s) => (
              <article key={s.step} className="lift bg-card p-6">
                <span className="label-mono text-terminal-foreground">{s.step}</span>
                <h3 className="headline-md mt-3">{s.name}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="architecture" className="panel-dark section-pad border-b-0">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label-mono text-terminal">System Topology</span>
              <h2 className="headline-lg mt-2">Server-Authoritative Architecture</h2>
            </div>
            <span className="label-mono border border-navy-border px-3 py-1.5 text-navy-muted">
              Zero client-side secrets
            </span>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-navy-muted">
            The browser never touches LLM credentials or settlement keys. Every model interaction, policy decision,
            escrow transition, and webhook verification is executed server-side and recorded to an immutable ledger.
          </p>

          <div className="mt-10 space-y-4">
            {/* Tier 1: Client Application */}
            <div className="rounded border border-navy-border bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded border border-navy-border bg-white/5 text-terminal">
                    <Globe className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-navy-foreground">Client Console (Browser)</h3>
                    <p className="text-xs text-navy-muted">Operator UI & real-time negotiation views</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="label-mono rounded border border-terminal/40 bg-terminal/10 px-2.5 py-1 text-xs text-terminal">
                    Session Bearer Token
                  </span>
                  <span className="label-mono rounded border border-navy-border px-2.5 py-1 text-xs text-navy-muted">
                    Typed Server Functions
                  </span>
                </div>
              </div>
            </div>

            {/* Connector Down */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full border border-navy-border bg-navy-muted/10 px-3 py-1 text-xs text-navy-muted">
                <ArrowDown className="size-3 text-terminal animate-pulse" />
                <span className="font-mono text-[11px]">Authenticated RPC Requests</span>
              </div>
            </div>

            {/* Tier 2: OmniTrust Core Backend Engine */}
            <div className="rounded border border-terminal/40 bg-white/[0.03] p-6 shadow-xl ring-1 ring-terminal/10">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded border border-terminal bg-terminal/10 text-terminal">
                    <Server className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-semibold text-navy-foreground">
                      OmniTrust Core Settlement Engine
                    </h3>
                    <p className="text-xs text-navy-muted">Server-side policy enforcement & state machine</p>
                  </div>
                </div>
                <span className="label-mono rounded border border-terminal bg-terminal px-2.5 py-1 text-xs font-semibold text-navy">
                  Authoritative Core
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-navy-border bg-white/[0.02] p-4 transition-colors hover:border-terminal/50">
                  <div className="flex items-center gap-2 text-terminal">
                    <Bot className="size-4" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider">AI Gateway</span>
                  </div>
                  <h4 className="mt-2 text-sm font-medium text-navy-foreground">Bounded LLM Agent</h4>
                  <p className="mt-1 text-xs text-navy-muted">
                    Proposals only — agent recommendations never unilaterally commit price.
                  </p>
                </div>

                <div className="rounded border border-navy-border bg-white/[0.02] p-4 transition-colors hover:border-terminal/50">
                  <div className="flex items-center gap-2 text-terminal">
                    <ShieldCheck className="size-4" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider">Gatekeeper</span>
                  </div>
                  <h4 className="mt-2 text-sm font-medium text-navy-foreground">Policy Guardrails</h4>
                  <p className="mt-1 text-xs text-navy-muted">
                    Deterministic code checks: turn budget (≤4) & server-side price floors.
                  </p>
                </div>

                <div className="rounded border border-navy-border bg-white/[0.02] p-4 transition-colors hover:border-terminal/50">
                  <div className="flex items-center gap-2 text-terminal">
                    <CreditCard className="size-4" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider">Escrow Flow</span>
                  </div>
                  <h4 className="mt-2 text-sm font-medium text-navy-foreground">Payment Subsystem</h4>
                  <p className="mt-1 text-xs text-navy-muted">
                    Razorpay Test Mode with idempotent money actions and automatic releases.
                  </p>
                </div>

                <div className="rounded border border-navy-border bg-white/[0.02] p-4 transition-colors hover:border-terminal/50">
                  <div className="flex items-center gap-2 text-terminal">
                    <FileText className="size-4" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider">Audit Ledger</span>
                  </div>
                  <h4 className="mt-2 text-sm font-medium text-navy-foreground">Immutable Trail</h4>
                  <p className="mt-1 text-xs text-navy-muted">
                    Append-only cryptographic record of all turns, policy checks, and webhooks.
                  </p>
                </div>
              </div>
            </div>

            {/* Connector Up/Down */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full border border-navy-border bg-navy-muted/10 px-3 py-1 text-xs text-navy-muted">
                <Lock className="size-3 text-terminal" />
                <span className="font-mono text-[11px]">HMAC-SHA256 Webhook Ingestion</span>
              </div>
            </div>

            {/* Tier 3: External 3PL Network */}
            <div className="rounded border border-navy-border bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded border border-navy-border bg-white/5 text-terminal">
                    <Truck className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-navy-foreground">
                      Mock 3PL / Logistics Warehouse
                    </h3>
                    <p className="text-xs text-navy-muted">
                      Physical parcel scans, delivery proofs & automated damage reports
                    </p>
                  </div>
                </div>
                <span className="label-mono rounded border border-terminal/40 bg-terminal/10 px-2.5 py-1 text-xs text-terminal">
                  Signed Webhooks (HMAC-SHA256)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="guarantees" className="section-pad border-y border-border bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <h2 className="headline-lg">Explicit guarantees</h2>
          <ul className="mt-8 grid gap-px bg-border md:grid-cols-2">
            {GUARANTEES.map((g) => (
              <li key={g} className="flex items-start gap-3 bg-card p-5">
                <span className="label-mono mt-0.5 text-terminal-foreground">✓</span>
                <span className="text-sm">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-pad">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-6 px-4 md:px-6">
          <div>
            <h2 className="headline-lg">Follow the whole story in one sitting.</h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Catalog · Negotiation · Gatekeeper · Escrow · Shipment · Signed Webhook · Settlement / Refund · Audit Trail. No developer tools required.
            </p>
          </div>
          <Link
            to="/auth"
            search={{ mode: "signup", next: "/dashboard" }}
            className="label-mono lift bg-primary px-6 py-3.5 text-primary-foreground"
          >
            Enter OmniTrust →
          </Link>
        </div>
      </section>

      <footer className="panel-dark border-t">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-6">
          <p className="label-mono text-navy-muted">OmniTrust · buildathon track: agentic commerce</p>
          <p className="mono-id text-navy-muted">
            Running in Razorpay Test Mode — no real funds ever move.
          </p>
        </div>
      </footer>
    </div>
  );
}

