import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as api from "./omni-db.server";

export type Profile = {
  full_name: string;
  company: string;
  role: "buyer" | "seller";
  demo_scenario: string;
  onboarding_completed: boolean;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  base_price: number;
  currency: string;
  min_quantity: number;
  current_stock: number;
  sku: string;
  list_price: number;
  stock: number;
};

export type NegotiationSession = {
  id: string;
  product_id: string;
  quantity: number;
  target_discount_pct: number;
  status: string;
  created_at: string;
  turns: any[];
  orderId?: string;
  order_id: string;
  product?: Product;
  max_turns?: number;
  buyer_target?: number;
  turn_count?: number;
  agreed_unit_price?: number;
  negotiation?: NegotiationSession; // some components expect it nested
};

export type Shipment = {
  id?: string;
  tracking_id: string;
  order_id: string;
  carrier: string;
  status: string;
  condition: string;
  created_at: string;
  orders?: any;
};

export type Dispute = {
  id: string;
  order_id: string;
  reason: string;
  status: string;
  resolution?: string;
  created_at: string;
  orders?: any;
  checks?: any[];
  refund_amount?: number;
  penalty_pct?: number;
  decision?: string;
  confidence?: number;
  ok?: boolean;
};

export type AuditLog = {
  id: string;
  event_type: string;
  order_id?: string;
  details: any;
  created_at: string;
  category?: string;
  actor?: string;
  latency_ms?: number;
  decision?: string;
  entity?: string;
  request_id?: string;
  payload?: any;
  status: string;
};

export type Order = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: string;
  escrow_status: string;
  escrow_ref?: string;
  settlement_ref?: string;
  refund_ref?: string;
  refund_amount?: number;
  idempotency_key?: string;
  created_at: string;
  updated_at: string;
  shipments?: Shipment[];
  disputes?: Dispute[];
  checks?: any[];
  ok?: boolean;
};


const BACKEND_URL = process.env["BACKEND_URL"] ?? "http://localhost:8000";

async function backendFetch<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  
  if (res.status === 204) {
    return {} as T;
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Backend error ${res.status}: Invalid JSON response`);
  }

  if (!res.ok || json.success === false) {
    const errorMsg =
      json.error?.message ??
      (typeof json.detail === "string" ? json.detail : json.detail?.message) ??
      `Backend error ${res.status}`;
    throw new Error(errorMsg);
  }
  return (json.data !== undefined ? json.data : json) as T;
}

function getToken(): string {
  const req = getRequest();
  const authHeader = req?.headers?.get("authorization") || req?.headers?.get("Authorization");
  if (authHeader && authHeader.trim() !== "Bearer" && authHeader.trim() !== "") {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }
  return (
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    ""
  );
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return backendFetch<Profile>("GET", "/api/v1/auth/me", getToken());
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
    return backendFetch<Profile>("POST", "/api/v1/auth/profile", getToken(), data);
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return backendFetch<Product[]>("GET", "/api/v1/products", getToken());
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
    return backendFetch<NegotiationSession>("POST", "/api/v1/negotiations", getToken(), payload);
  });

export const fetchNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const negotiation = await backendFetch<NegotiationSession>("GET", `/api/v1/negotiations/${data.id}`, getToken());
    return { negotiation, aiError: null };
  });

export const advanceNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<NegotiationSession>("POST", `/api/v1/negotiations/${data.id}/next-turn`, getToken());
  });

export const approveNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<NegotiationSession>("POST", `/api/v1/negotiations/${data.id}/approve`, getToken());
  });

export const fetchOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return backendFetch<Order[]>("GET", "/api/v1/orders", getToken());
  });

export const fetchOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Order>("GET", `/api/v1/orders/${data.id}`, getToken());
  });

export const fetchDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => api.dashboardSnapshot(context.supabase));

export const createEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Order>("POST", `/api/v1/orders/${data.orderId}/escrow`, getToken());
  });

export const registerShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Order>("POST", `/api/v1/orders/${data.orderId}/shipment`, getToken());
  });

export const fetchShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tracking: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Shipment>("GET", `/api/v1/shipments/${data.tracking}`, getToken());
  });


export const settleOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Order>("POST", `/api/v1/orders/${data.orderId}/settle`, getToken());
  });

export const fetchDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Dispute>("GET", `/api/v1/disputes/${data.id}`, getToken());
  });

export const arbitrateDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Dispute>("POST", `/api/v1/disputes/${data.id}/arbitrate`, getToken());
  });

export const refundDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return backendFetch<Dispute>("POST", `/api/v1/disputes/${data.id}/refund`, getToken());
  });

export const fetchAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId?: string | null }) => input)
  .handler(async ({ data }) => {
    const path = data.orderId
      ? `/api/audit/logs?order_id=${data.orderId}&limit=200`
      : "/api/audit/logs?limit=200";
    return backendFetch<AuditLog[]>("GET", path, getToken());
  });

export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => api.resetDemo(context.supabase, context.userId));

export const fetchDependencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const res = await backendFetch<{ all_healthy: boolean; checks: any[] }>(
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
    const result = await backendFetch<NegotiationSession>("POST", `/api/v1/negotiations/${data.id}/next-turn`, getToken());
    return { result, via: "fastapi" };
  });

export const fetchBackendHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const result = await backendFetch<{ all_healthy: boolean; checks: any[] }>(
      "GET",
      "/api/health/dependencies",
      getToken(),
    );
    return { ok: true, ...result };
  });

export const fetchAuditViaBackend = fetchAudit;
