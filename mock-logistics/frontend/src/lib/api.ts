/**
 * Real HTTP API client for Mock Logistics FastAPI backend.
 * Replaces the in-memory simulated backend (mock-backend.ts).
 */

import type { Shipment, WebhookEvent, HealthResponse, ApiError } from "./types";

const BASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_LOGISTICS_API_URL) ||
  "http://localhost:5001";

class LogisticsApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = "LogisticsApiError";
    this.code = body.error;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: ApiError;
    try {
      body = await res.json();
    } catch {
      body = { error: "INTERNAL_ERROR", message: `HTTP ${res.status}` };
    }
    throw new LogisticsApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Health
  health: () => request<HealthResponse>("/health"),

  // Shipments
  listShipments: () => request<Shipment[]>("/api/v1/shipments"),

  getShipment: (trackingId: string) =>
    request<Shipment>(`/api/v1/shipments/${encodeURIComponent(trackingId)}`),

  createShipment: (orderId: string, itemCount: number) =>
    request<Shipment>("/api/v1/create_shipment", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId, item_count: itemCount }),
    }),

  // State transitions
  markTransit: (trackingId: string) =>
    request<Shipment>(`/api/v1/shipments/${encodeURIComponent(trackingId)}/transit`, {
      method: "POST",
    }),

  markDelivered: (trackingId: string) =>
    request<Shipment>(`/api/v1/shipments/${encodeURIComponent(trackingId)}/deliver`, {
      method: "POST",
    }),

  reportDamage: (trackingId: string, damageReason: string) =>
    request<Shipment>(`/api/v1/shipments/${encodeURIComponent(trackingId)}/damage`, {
      method: "POST",
      body: JSON.stringify({ damage_reason: damageReason }),
    }),

  resetShipment: (trackingId: string) =>
    request<Shipment>(`/api/v1/shipments/${encodeURIComponent(trackingId)}/reset`, {
      method: "POST",
    }),

  // Events
  listShipmentEvents: (trackingId: string) =>
    request<WebhookEvent[]>(
      `/api/v1/shipments/${encodeURIComponent(trackingId)}/events`,
    ),

  listWebhookEvents: () => request<WebhookEvent[]>("/api/v1/webhook-events"),

  retryWebhook: (eventId: string) =>
    request<WebhookEvent>(`/api/v1/webhook-events/${encodeURIComponent(eventId)}/retry`, {
      method: "POST",
    }),
};

export { LogisticsApiError };
