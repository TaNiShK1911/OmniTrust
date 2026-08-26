import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as api from "./omni-db.server";

const BACKEND_URL = process.env["BACKEND_URL"] ?? "http://localhost:8000";

async function backendFetch<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  
  if (res.status === 204) {
    return {} as T;
  }

  const json = (await res.json()) as { success: boolean; data: T; error: { message: string } | null };
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `Backend error ${res.status}`);
  }
  return json.data;
}

function getToken(): string {
  return getRequest().headers.get("authorization")?.replace("Bearer ", "") ?? "";
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return backendFetch("GET", "/api/v1/auth/me", getToken());
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      full_name?: string;
      company?: string;
      role?: "buyer" | "seller";
      demo_scenario?: string;
      onboarding_completed?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    return backendFetch("POST", "/api/v1/auth/profile", getToken(), data);
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return backendFetch("GET", "/api/v1/products", getToken());
  });

export const startNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; quantity: number; targetDiscountPct: number }) => input)
  .handler(async ({ data }) => {
    // Map frontend names to backend expected names
    const payload = {
        product_id: data.productId,
        quantity: data.quantity,
        target_discount_pct: data.targetDiscountPct
    };
    return backendFetch("POST", "/api/v1/negotiations", getToken(), payload);
  });

export const fetchNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const negotiation = await backendFetch("GET", `/api/v1/negotiations/${data.id}`, getToken());
    return { negotiation, aiError: null };
  });

export const advanceNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/negotiations/${data.id}/next-turn`, getToken());
  });

export const approveNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/negotiations/${data.id}/approve`, getToken());
  });

export const fetchOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return backendFetch("GET", "/api/v1/orders", getToken());
  });

export const fetchOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("GET", `/api/v1/orders/${data.id}`, getToken());
  });

export const fetchDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => api.dashboardSnapshot(context.supabase));

export const createEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/orders/${data.orderId}/escrow`, getToken());
  });

export const registerShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/orders/${data.orderId}/shipment`, getToken());
  });

export const fetchShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tracking: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("GET", `/api/v1/shipments/${data.tracking}`, getToken());
  });


export const settleOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/orders/${data.orderId}/settle`, getToken());
  });

export const fetchDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("GET", `/api/v1/disputes/${data.id}`, getToken());
  });

export const arbitrateDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/disputes/${data.id}/arbitrate`, getToken());
  });

export const refundDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch("POST", `/api/v1/disputes/${data.id}/refund`, getToken());
  });

export const fetchAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId?: string | null }) => input)
  .handler(async ({ data }) => {
    const path = data.orderId
      ? `/api/audit/logs?order_id=${data.orderId}&limit=200`
      : "/api/audit/logs?limit=200";
    return backendFetch("GET", path, getToken());
  });

export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => api.resetDemo(context.supabase, context.userId));

export const fetchDependencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const res = await backendFetch<{ all_healthy: boolean; checks: unknown[] }>(
        "GET",
        "/api/health/dependencies",
        getToken(),
    );
    return { ok: true, ...res };
  });

// Keep for backward compatibility while testing, though advanceNegotiation does the same now
export const advanceNegotiationViaBackend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const result = await backendFetch("POST", `/api/v1/negotiations/${data.id}/next-turn`, getToken());
    return { result, via: "fastapi" };
  });

export const fetchBackendHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const result = await backendFetch<{ all_healthy: boolean; checks: unknown[] }>(
      "GET",
      "/api/health/dependencies",
      getToken(),
    );
    return { ok: true, ...result };
  });

export const fetchAuditViaBackend = fetchAudit;
