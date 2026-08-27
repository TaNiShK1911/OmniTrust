import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { ActionButton, AppShell } from "@/components/omni/AppShell";
import { ApiState, LabelValue, Panel, StatusBadge } from "@/components/omni/ui";
import { MAX_TURNS, POLICY_REFUND_CAP_PCT } from "@/lib/omni";
import { fetchDependencies, getMyProfile, resetDemoData, saveMyProfile } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Demo control — OmniTrust" },
      { name: "description", content: "Profile, policy constants, dependency health and a one-click demo reset." },
      { property: "og:title", content: "Demo control — OmniTrust" },
      { property: "og:description", content: "Profile, policy constants and demo reset." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

const inputClass =
  "mt-1 w-full border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-2 focus:border-primary";

function Settings() {
  const navigate = useNavigate();
  const loadProfile = useServerFn(getMyProfile);
  const save = useServerFn(saveMyProfile);
  const reset = useServerFn(resetDemoData);
  const deps = useServerFn(fetchDependencies);

  const profile = useQuery({ queryKey: ["profile"], queryFn: () => loadProfile() });
  const dependencies = useQuery({ queryKey: ["dependencies"], queryFn: () => deps() });

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.full_name);
    setCompany(profile.data.company);
    setRole(profile.data.role);
  }, [profile.data]);

  const saveProfile = useMutation({
    mutationFn: () =>
      save({
        data: {
          full_name: fullName,
          company,
          role,
          demo_scenario: profile.data?.demo_scenario ?? "delivered",
          onboarding_completed: true,
        },
      }),
    onSuccess: () => profile.refetch(),
  });

  const resetDemo = useMutation({
    mutationFn: () => reset(),
    onSuccess: () => navigate({ to: "/dashboard" }),
  });

  return (
    <AppShell title="Demo control" subtitle="Profile, policy constants, dependency health and reset.">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Profile">
            {profile.isLoading ? (
              <ApiState loading />
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label-mono text-muted-foreground" htmlFor="name">
                    Full name
                  </label>
                  <input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="label-mono text-muted-foreground" htmlFor="co">
                    Company
                  </label>
                  <input
                    id="co"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={inputClass}
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
                {saveProfile.isError ? <ApiState error={saveProfile.error} /> : null}
                <ActionButton onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? "Saving…" : "Save profile"}
                </ActionButton>
              </div>
            )}
          </Panel>

          <Panel title="Policy constants (server-enforced)">
            <div className="grid gap-4 sm:grid-cols-3">
              <LabelValue label="Negotiation turn cap" value={`${MAX_TURNS} turns`} mono />
              <LabelValue label="Refund cap" value={`${POLICY_REFUND_CAP_PCT}% of order total`} mono />
              <LabelValue label="Price floor visibility" value="Hidden from both agents" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              These constants live in server code, not in the browser, so editing anything client-side cannot widen a
              guardrail.
            </p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Dependency health">
            <div className="space-y-3">
              {(dependencies.data?.checks ?? []).map((d: any) => (
                <div key={d.name} className="flex items-center justify-between gap-3">
                  <LabelValue label={d.name} value={d.detail} />
                  <StatusBadge status={d.ok ? "healthy" : "failed"} tone={d.ok ? "success" : "failed"} />
                </div>
              ))}
              <ActionButton variant="ghost" onClick={() => dependencies.refetch()} className="w-full">
                Re-check
              </ActionButton>
            </div>
          </Panel>

          <Panel title="Reset demo data">
            <p className="text-sm text-muted-foreground">
              Deletes your negotiations, orders, shipments, disputes and audit events. The shared product catalog is
              untouched.
            </p>
            {resetDemo.isError ? (
              <div className="mt-3">
                <ApiState error={resetDemo.error} />
              </div>
            ) : null}
            <ActionButton
              variant="danger"
              onClick={() => resetDemo.mutate()}
              disabled={resetDemo.isPending}
              className="mt-4 w-full"
            >
              {resetDemo.isPending ? "Resetting…" : "Reset my demo data"}
            </ActionButton>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
