/**
 * OmniTrust Frontend — Backend API Proxy Client
 *
 * Typed fetch helper that attaches the Supabase JWT to every request
 * to the FastAPI backend at VITE_BACKEND_URL (default: http://localhost:8000).
 *
 * Usage:
 *   import { callBackend } from "@/lib/backend-client";
 *   const { data } = await callBackend("POST", "/api/v1/negotiations", { product_id, quantity });
 */
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL =
  (typeof import.meta !== "undefined" && (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_BACKEND_URL) ||
  "http://localhost:8000";

export type BackendEnvelope<T = unknown> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  request_id?: string;
};

export class BackendError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/**
 * Make a request to the FastAPI backend, automatically attaching the
 * current Supabase session token as a Bearer authorization header.
 *
 * Throws BackendError on any non-2xx response or API-level failure.
 */
export async function callBackend<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<BackendEnvelope<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let envelope: BackendEnvelope<T>;
  try {
    envelope = (await res.json()) as BackendEnvelope<T>;
  } catch {
    throw new BackendError("PARSE_ERROR", `Backend returned non-JSON (status ${res.status})`, res.status);
  }

  if (!res.ok || !envelope.success) {
    const err = envelope.error;
    const detail = (envelope as any).detail;
    const msg =
      err?.message ??
      (typeof detail === "string" ? detail : detail?.message) ??
      `Backend error (status ${res.status})`;
    throw new BackendError(
      err?.code ?? "BACKEND_ERROR",
      msg,
      res.status,
    );
  }

  return envelope;
}

/**
 * Convenience wrappers
 */
export const backend = {
  get: <T>(path: string) => callBackend<T>("GET", path),
  post: <T>(path: string, body?: unknown) => callBackend<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => callBackend<T>("PATCH", path, body),
};
