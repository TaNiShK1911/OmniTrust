import { createFileRoute, Link } from "@tanstack/react-router";

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
              Start demo →
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
          <h2 className="headline-lg">Architecture</h2>
          <p className="mt-4 max-w-2xl text-sm text-navy-muted">
            The browser never touches a provider. Every model call, policy decision, payment action and webhook
            verification happens server-side and is written to an append-only audit table.
          </p>
          <pre className="mono-id mt-10 overflow-x-auto border border-navy-border p-6 text-[13px] leading-7">{`Browser
   |  typed server functions (session bearer)
   v
OmniTrust server  ->  AI gateway        (proposals only, never final price)
                  ->  Policy gatekeeper (deterministic, code-enforced)
                  ->  Escrow provider   (test mode, idempotent)
                  ->  Audit log         (append-only)
   ^
   |  signed webhook  (HMAC-SHA256)
Mock 3PL / warehouse portal`}</pre>
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
              Catalog → negotiation → gatekeeper → escrow → shipment → signed webhook → settlement or refund → audit
              trail. No developer tools required.
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
            Demo environment. Payments run in test mode; no real funds ever move.
          </p>
        </div>
      </footer>
    </div>
  );
}
