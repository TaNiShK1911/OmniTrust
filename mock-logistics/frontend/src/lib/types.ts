/**
 * Canonical type definitions for Mock Logistics frontend.
 * These match the FastAPI backend response schemas exactly.
 */

export type ShipmentStatus = "IN_TRANSIT" | "DELIVERED" | "DAMAGED";
export type GoodsCondition = "INTACT" | "DAMAGED";
export type WebhookDeliveryStatus = "PENDING" | "SENT" | "FAILED";

export interface Shipment {
  id: string;
  tracking_id: string;
  omnitrust_order_id: string;
  item_count: number;
  carrier_status: ShipmentStatus;
  goods_condition: GoodsCondition;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  tracking_id: string;
  event_type: string;
  payload: string;
  signature: string;
  idempotency_key: string | null;
  attempt_count: number;
  delivery_status: WebhookDeliveryStatus;
  response_code: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface HealthResponse {
  status: string;
  service: string;
  port: number;
}

export interface ApiError {
  error: string;
  message: string;
}
