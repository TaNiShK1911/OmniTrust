import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { ActionButton } from "@/components/omni/AppShell";
import { ApiState, Panel } from "@/components/omni/ui";
import { getMyProfile, saveMyProfile } from "@/lib/omni.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Finish setup — OmniTrust" },
      { name: "description", content: "Complete your OmniTrust operator profile and preferred evaluation scenario." },
      { property: "og:title", content: "Finish setup — OmniTrust" },
      { property: "og:description", content: "Complete your OmniTrust operator profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

const inputClass =
  "w-full border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-2 focus:border-primary";

function Onboarding() {
  const navigate = useNavigate();
  const loadProfile = useServerFn(getMyProfile);
  const save = useServerFn(saveMyProfile);

  const profile = useQuery({ queryKey: ["profile"], queryFn: () => loadProfile() });

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [scenario, setScenario] = useState("delivered");

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.full_name);
    setCompany(profile.data.company);
    setRole(profile.data.role);
    setScenario(profile.data.demo_scenario);
  }, [profile.data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          full_name: fullName,
          company,
          role,
          demo_scenario: scenario,
          onboarding_completed: true,
        },
      }),
    onSuccess: () => navigate({ to: "/dashboard" }),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-xl">
        <h1 className="headline-lg">Welcome to OmniTrust</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Two fields and a scenario choice, then the console is yours.
        </p>

        {profile.isLoading ? (
          <div className="mt-6">
            <ApiState loading />
          </div>
        ) : (
          <Panel title="Operator profile" className="mt-6">
            <div className="space-y-4">
              <div>
                <label className="label-mono text-muted-foreground" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className="label-mono text-muted-foreground" htmlFor="co">
                  Company name
                </label>
                <input
                  id="co"
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
              <div>
                <span className="label-mono text-muted-foreground">Evaluation scenario</span>
                <div className="mt-1 flex gap-px bg-border">
                  {[
                    { key: "delivered", label: "Delivered → settle" },
                    { key: "damaged", label: "Damaged → refund" },
                  ].map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setScenario(s.key)}
                      className={`label-mono flex-1 px-3 py-2.5 ${
                        scenario === s.key
                          ? "bg-navy text-navy-foreground"
                          : "bg-background text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {mutation.isError ? (
                <ApiState error={mutation.error} onRetry={() => mutation.mutate()} />
              ) : null}

              <ActionButton onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
                {mutation.isPending ? "Saving…" : "Finish setup →"}
              </ActionButton>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
