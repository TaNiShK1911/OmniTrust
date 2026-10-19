/**
 * OmniTrust — Agent Developer Hub
 *
 * Route: /developer-hub
 * Guides autonomous AI agent builders to integrate against OmniTrust's versioned
 * OpenAPI specification and APIMatic-generated SDKs.
 */
import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Terminal, Code2, Download, ShieldCheck, Key, RefreshCw, Cpu } from "lucide-react";

import { AppShell } from "@/components/omni/AppShell";
import { Panel } from "@/components/omni/ui";
import { CodeSnippet } from "@/components/developer/CodeSnippet";
import { PYTHON_SDK_EXAMPLE, TYPESCRIPT_SDK_EXAMPLE, IDEMPOTENCY_EXAMPLE } from "@/lib/sdk-examples";

export const Route = createFileRoute("/_authenticated/developer-hub")({
  head: () => ({
    meta: [
      { title: "Agent Developer Hub — OmniTrust" },
      {
        name: "description",
        content: "Integrate autonomous buyer and seller agents with APIMatic SDKs and OpenAPI specs.",
      },
      { property: "og:title", content: "Agent Developer Hub — OmniTrust" },
      { property: "og:description", content: "SDKs, code snippets, and API specs for agentic commerce." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: DeveloperHub,
});

function DeveloperHub() {
  const [activeTab, setActiveTab] = useState<"python" | "typescript" | "idempotency">("python");

  return (
    <AppShell
      title="Agent Developer Hub"
      subtitle="APIMatic SDKs, versioned OpenAPI specs, and autonomous agent integration guides."
      actions={
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          className="label-mono lift border border-border px-4 py-2.5 inline-flex items-center gap-1.5"
        >
          <Terminal className="h-4 w-4 text-primary" />
          Interactive Swagger Docs
        </a>
      }
    >
      <div className="space-y-6">
        {/* Architecture Overview Banner */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs mb-1">
              <Cpu className="h-4 w-4" />
              <span>APIMatic SDK Generation</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              OpenAPI 3.0 specs generate strongly-typed Python and TypeScript SDKs with built-in retry and telemetry.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-emerald-500 font-semibold text-xs mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span>PayPal Authorization Hold</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Agents recommend pricing; PayPal holds authorized funds; release is gated by verified delivery evidence.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs mb-1">
              <Key className="h-4 w-4" />
              <span>Zero Credential Leakage</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Agents authenticate via OmniTrust scoped JWTs; PayPal client secrets never reach external code.
            </p>
          </div>
        </div>

        {/* SDK Language Tabs */}
        <Panel title="Code Samples & Integration Guides">
          <div className="space-y-4">
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab("python")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "python"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="h-4 w-4" />
                Python SDK
              </button>
              <button
                onClick={() => setActiveTab("typescript")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "typescript"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="h-4 w-4" />
                TypeScript SDK
              </button>
              <button
                onClick={() => setActiveTab("idempotency")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "idempotency"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <RefreshCw className="h-4 w-4" />
                Idempotency & Safety
              </button>
            </div>

            {activeTab === "python" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  The Python client enables external LLM agents (LangChain, CrewAI, AutoGen) to conduct negotiation within policy caps and track PayPal escrow holds.
                </p>
                <CodeSnippet code={PYTHON_SDK_EXAMPLE} language="python" title="omnitrust_agent.py" />
              </div>
            )}

            {activeTab === "typescript" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  The TypeScript SDK provides end-to-end typed promises for frontend or Node.js agent runners.
                </p>
                <CodeSnippet code={TYPESCRIPT_SDK_EXAMPLE} language="typescript" title="agent-runner.ts" />
              </div>
            )}

            {activeTab === "idempotency" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Pass an <code>Idempotency-Key</code> header with every mutating request. Duplicate network calls will safely return existing transactions without creating double holds.
                </p>
                <CodeSnippet code={IDEMPOTENCY_EXAMPLE} language="typescript" title="idempotent-request.ts" />
              </div>
            )}
          </div>
        </Panel>

        {/* API Specification & Download */}
        <div className="grid gap-6 sm:grid-cols-2">
          <Panel title="OpenAPI 3.0 Specification">
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              OmniTrust publishes a versioned OpenAPI 3.0 specification covering Negotiations, Orders, PayPal Payments, Webhooks, and Audit Telemetry.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="http://localhost:8000/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                Download openapi.json
              </a>
              <a
                href="https://docs.apimatic.io/generate-sdks/overview-sdks/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                APIMatic SDK Docs →
              </a>
            </div>
          </Panel>

          <Panel title="Agent Spending Guardrails">
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong>Max Turns:</strong> Negotiations automatically terminate after 4 turns to avoid infinite loops.
              </p>
              <p>
                <strong>Order Cap:</strong> No order may exceed the configured account spend ceiling.
              </p>
              <p>
                <strong>Settlement Gate:</strong> Release to seller strictly requires cryptographic delivery proof from mock logistics.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
