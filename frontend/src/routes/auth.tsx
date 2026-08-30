import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import { ensureDemoUser } from "@/lib/demo.functions";
import { safePath } from "@/lib/omni";

type Search = { mode?: "signin" | "signup"; next?: string | undefined };

const TITLE = "Sign in — OmniTrust settlement console";
const DESC = "Access the OmniTrust console: bounded agent negotiation, escrow, shipment verification and audit.";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    mode: search["mode"] === "signup" ? "signup" : "signin",
    next: typeof search["next"] === "string" ? search["next"] : undefined,
  }),
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
  component: AuthPage,
});

function AuthPage() {
  const { mode, next } = Route.useSearch();
  const navigate = useNavigate();
  const isSignup = mode === "signup";

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dest = safePath(next);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("omnitrust.next", dest);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: dest });
    });
  }, [dest, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignup) {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords do not match.");
      if (!accepted) return setError("Please accept the terms to proceed.");
    }

    setBusy(true);
    try {
      if (isSignup) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: fullName, company, role },
          },
        });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError("Account created. Confirm your email address, then sign in.");
          return;
        }
        await navigate({ to: "/onboarding" });
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await navigate({ to: dest });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin() {
    setError(null);
    setBusy(true);
    try {
      await ensureDemoUser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (signInError) throw signInError;
      await navigate({ to: dest });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setBusy(true);
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (result.error) {
      setError("Google sign-in failed. Try email and password.");
      setBusy(false);
      return;
    }
    await navigate({ to: dest });
  }

  const inputClass =
    "w-full border border-input bg-background px-3 py-2.5 text-sm outline-none transition-[border] focus:border-2 focus:border-primary";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="panel-dark hidden flex-col justify-between p-10 lg:flex">
        <Link to="/" className="font-display text-lg font-bold">
          Omni<span className="text-terminal">Trust</span>
        </Link>
        <div>
          <h2 className="headline-lg max-w-md">
            The console shows what the model suggested — and what the code allowed.
          </h2>
          <pre className="mono-id mt-8 border border-navy-border p-4 text-[12px] leading-6">{`Buyer Agent proposed  2,250
Gatekeeper            ACCEPTED
Escrow                FUNDS_HELD
Webhook               SIGNATURE_VALID
Settlement            SELLER_PAID`}</pre>
        </div>
        <p className="mono-id text-navy-muted">Test mode only. No real funds move.</p>
      </div>

      <div className="flex items-center justify-center bg-surface px-4 py-12">
        <div className="panel w-full max-w-md p-8">
          <Link to="/" className="label-mono text-muted-foreground hover:text-foreground">
            ← Back to OmniTrust
          </Link>
          <h1 className="headline-lg mt-6">{isSignup ? "Create account" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignup ? "Set up an operator account." : "Continue to the settlement console."}
          </p>

          <div className="mt-6 border border-border bg-card p-4">
            <button
              type="button"
              onClick={demoLogin}
              disabled={busy}
              className="label-mono lift w-full bg-primary px-4 py-2.5 text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Working…" : "Continue as judge / reviewer →"}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              No account needed — this signs you in with a shared evaluation account.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {isSignup ? (
              <>
                <div>
                  <label className="label-mono text-muted-foreground" htmlFor="fullName">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <label className="label-mono text-muted-foreground" htmlFor="company">
                    Company / merchant (optional)
                  </label>
                  <input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <span className="label-mono text-muted-foreground">Role</span>
                  <div className="mt-1 flex gap-px bg-border">
                    {(["buyer", "seller"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`label-mono flex-1 px-3 py-2.5 ${
                          role === r ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            <div>
              <label className="label-mono text-muted-foreground" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="label-mono text-muted-foreground" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`mt-1 ${inputClass}`}
              />
            </div>
            {isSignup ? (
              <>
                <div>
                  <label className="label-mono text-muted-foreground" htmlFor="confirm">
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-1 size-4 accent-[oklch(0.577_0.235_267)]"
                  />
                  Running in Razorpay Test Mode — no real funds ever move.
                </label>
              </>
            ) : null}

            {error ? (
              <p className="border border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="label-mono lift w-full bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Working…" : isSignup ? "Create account →" : "Sign in →"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="label-mono text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="label-mono lift w-full border border-primary px-4 py-3 text-primary disabled:opacity-50"
          >
            Continue with Google
          </button>

          <p className="mt-6 text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : "No account yet? "}
            <Link
              to="/auth"
              search={{ mode: isSignup ? "signin" : "signup", next }}
              className="text-primary underline"
            >
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
