import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_CREDENTIALS, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Operator Sign In — OmniLogistics Warehouse Console" },
      {
        name: "description",
        content:
          "Sign in or create an operator account to access the OmniLogistics 3PL warehouse console. Demo credentials provided for instant access.",
      },
      { property: "og:title", content: "Operator Sign In — OmniLogistics" },
      {
        property: "og:description",
        content: "Access the warehouse console with one-click demo credentials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { operator, ready, signIn, signUp, signInAsDemo } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && operator) void navigate({ to: "/dashboard" });
  }, [ready, operator, navigate]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scanline grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between border-r border-border bg-panel p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <Truck className="size-5 text-primary" />
          <span className="font-mono text-sm tracking-[0.2em] uppercase">Omnilogistics</span>
        </Link>
        <div>
          <h2 className="max-w-md text-3xl leading-tight font-semibold">
            The operator console for third-party logistics simulation.
          </h2>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            Scan shipments into transit, confirm deliveries, report damage, and watch signed
            webhooks stream to downstream systems in real time.
          </p>
          <ul className="mt-8 space-y-3 font-mono text-xs tracking-[0.08em] uppercase">
            <li className="flex items-center gap-3 text-muted-foreground">
              <Zap className="size-4 text-primary" /> Live outbound webhook terminal
            </li>
            <li className="flex items-center gap-3 text-muted-foreground">
              <ShieldCheck className="size-4 text-success" /> HMAC-signed delivery events
            </li>
          </ul>
        </div>
        <p className="label-xs">Mock 3PL / Demo Environment</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-14">
        <div className="panel w-full max-w-md p-7">
          <h1 className="font-mono text-lg tracking-[0.18em] uppercase">Operator Access</h1>
          <p className="label-xs mt-1">Authenticate to enter the warehouse console</p>

          <div className="mt-5 rounded-sm border border-primary/30 bg-primary/8 p-4">
            <div className="label-xs text-primary">Demo credentials</div>
            <dl className="mt-2 space-y-1 font-mono text-xs text-foreground">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">email</dt>
                <dd>{DEMO_CREDENTIALS.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">password</dt>
                <dd>{DEMO_CREDENTIALS.password}</dd>
              </div>
            </dl>
            <Button
              className="mt-3 w-full"
              disabled={busy}
              onClick={() => void run(signInAsDemo, "Signed in as demo operator")}
            >
              Quick access as demo operator
            </Button>
          </div>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form
                className="space-y-4 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    () => signIn(String(f.get("email")), String(f.get("password"))),
                    "Welcome back, operator",
                  );
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input
                    id="si-email"
                    name="email"
                    type="email"
                    required
                    defaultValue={DEMO_CREDENTIALS.email}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-password">Password</Label>
                  <Input
                    id="si-password"
                    name="password"
                    type="password"
                    required
                    defaultValue={DEMO_CREDENTIALS.password}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Authenticating…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form
                className="space-y-4 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    () =>
                      signUp(
                        String(f.get("name")),
                        String(f.get("email")),
                        String(f.get("password")),
                      ),
                    "Operator account created",
                  );
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" name="name" required autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input
                    id="su-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creating account…" : "Create operator account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Demo environment — accounts are stored locally in this browser only.
          </p>
        </div>
      </main>
    </div>
  );
}
