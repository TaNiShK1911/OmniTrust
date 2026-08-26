/**
 * Simulated Mock Logistics 3PL backend.
 * Mirrors the REST contract of the FastAPI service on :5001, but runs
 * entirely in-memory so the operator UI is demo-able standalone.
 */

export type ShipmentStatus = "CREATED" | "IN_TRANSIT" | "DELIVERED";
export type GoodsCondition = "INTACT" | "DAMAGED";
export type WebhookStatus = "PENDING" | "SENT" | "RETRYING" | "FAILED";

export interface Shipment {
  tracking_id: string;
  order_id: string;
  item_count: number;
  status: ShipmentStatus;
  condition: GoodsCondition;
  damage_reason?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface ShipmentEvent {
  id: string;
  tracking_id: string;
  type: string;
  detail: string;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  tracking_id: string;
  event: string;
  status: WebhookStatus;
  http_status: number | null;
  http_text: string;
  attempt: number;
  max_attempts: number;
  signature: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Stats {
  in_transit: number;
  delivered: number;
  damaged: number;
  webhook_success_rate: number;
}

const LATENCY = 220;

function delay<T>(value: T, ms = LATENCY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function now() {
  return new Date().toISOString();
}

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function hex(len: number) {
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

let seq = 9280;
function nextTracking() {
  seq += Math.floor(Math.random() * 7) + 1;
  return `OMNI-TRK-${seq}`;
}

interface Db {
  shipments: Shipment[];
  events: ShipmentEvent[];
  webhooks: WebhookEvent[];
  serviceUp: boolean;
}

function seedDb(): Db {
  const db: Db = { shipments: [], events: [], webhooks: [], serviceUp: true };
  const seeds: Array<[string, number, ShipmentStatus, GoodsCondition, number]> = [
    ["ORD-12345", 500, "IN_TRANSIT", "INTACT", 42],
    ["ORD-12346", 120, "IN_TRANSIT", "INTACT", 31],
    ["ORD-12347", 1400, "IN_TRANSIT", "INTACT", 18],
    ["ORD-12348", 60, "CREATED", "INTACT", 9],
    ["ORD-12331", 220, "DELIVERED", "INTACT", 180],
    ["ORD-12329", 75, "DELIVERED", "DAMAGED", 320],
  ];
  for (const [order, items, status, condition, age] of seeds) {
    const tracking = nextTracking();
    db.shipments.push({
      tracking_id: tracking,
      order_id: order,
      item_count: items,
      status,
      condition,
      damage_reason: condition === "DAMAGED" ? "Package crushed during transit" : undefined,
      created_at: minutesAgo(age),
      updated_at: minutesAgo(Math.max(1, Math.floor(age / 3))),
    });
    db.events.push({
      id: hex(8),
      tracking_id: tracking,
      type: "SHIPMENT_CREATED",
      detail: `Shipment registered for ${order}`,
      created_at: minutesAgo(age),
    });
    db.webhooks.push({
      id: hex(8),
      tracking_id: tracking,
      event: "CREATE_SHIPMENT",
      status: "SENT",
      http_status: 201,
      http_text: "201 Created",
      attempt: 1,
      max_attempts: 3,
      signature: `${hex(4)}...${hex(4)}`,
      payload: { tracking_id: tracking, order_id: order, status: "CREATED" },
      created_at: minutesAgo(age),
    });
    if (status !== "CREATED") {
      db.events.push({
        id: hex(8),
        tracking_id: tracking,
        type: "SCANNED_INTO_TRANSIT",
        detail: "Scanned at origin hub",
        created_at: minutesAgo(age - 2),
      });
    }
    if (status === "DELIVERED") {
      db.events.push({
        id: hex(8),
        tracking_id: tracking,
        type: condition === "DAMAGED" ? "DAMAGE_REPORTED" : "DELIVERED",
        detail: condition === "DAMAGED" ? "Damage reported by operator" : "Delivered to consignee",
        created_at: minutesAgo(Math.floor(age / 3)),
      });
      db.webhooks.push({
        id: hex(8),
        tracking_id: tracking,
        event: condition === "DAMAGED" ? "DAMAGE_EVENT" : "DELIVERY_EVENT",
        status: "SENT",
        http_status: 200,
        http_text: "200 OK",
        attempt: 1,
        max_attempts: 3,
        signature: `${hex(4)}...${hex(4)}`,
        payload: {
          tracking_id: tracking,
          status: condition === "DAMAGED" ? "DAMAGED" : "DELIVERED",
        },
        created_at: minutesAgo(Math.floor(age / 3)),
      });
    }
  }
  return db;
}

const g = globalThis as unknown as { __mockLogisticsDb?: Db };
const db: Db = (g.__mockLogisticsDb ??= seedDb());

function assertUp() {
  if (!db.serviceUp) throw new Error("Mock Logistics API unavailable on :5001");
}

function pushEvent(tracking_id: string, type: string, detail: string) {
  db.events.unshift({ id: hex(8), tracking_id, type, detail, created_at: now() });
}

function pushWebhook(shipment: Shipment, event: string, payload: Record<string, unknown>) {
  // ~15% of deliveries hit a transient endpoint failure, then retry to success.
  const flaky = Math.random() < 0.15;
  const wh: WebhookEvent = {
    id: hex(8),
    tracking_id: shipment.tracking_id,
    event,
    status: flaky ? "RETRYING" : "SENT",
    http_status: flaky ? null : 200,
    http_text: flaky ? "Connection Error" : "200 OK",
    attempt: 1,
    max_attempts: 3,
    signature: `${hex(4)}...${hex(4)}`,
    payload,
    created_at: now(),
  };
  db.webhooks.unshift(wh);

  if (flaky) {
    setTimeout(() => {
      wh.attempt = 2;
      const recovered = Math.random() < 0.7;
      if (recovered) {
        wh.status = "SENT";
        wh.http_status = 200;
        wh.http_text = "200 OK";
        db.webhooks.unshift({
          ...wh,
          id: hex(8),
          event: "WEBHOOK_ACK",
          payload: { ack: true, tracking_id: wh.tracking_id },
          created_at: now(),
        });
      } else {
        wh.attempt = 3;
        wh.status = "FAILED";
        wh.http_status = 401;
        wh.http_text = "401 Unauthorized";
      }
    }, 2600);
  } else {
    setTimeout(() => {
      db.webhooks.unshift({
        ...wh,
        id: hex(8),
        event: "WEBHOOK_ACK",
        status: "SENT",
        http_text: "OK",
        payload: { ack: true, tracking_id: wh.tracking_id },
        created_at: now(),
      });
    }, 900);
  }
  return wh;
}

function find(trackingId: string): Shipment {
  const s = db.shipments.find((x) => x.tracking_id === trackingId);
  if (!s) throw new Error(`Shipment ${trackingId} not found`);
  return s;
}

export const api = {
  health: () =>
    delay(
      db.serviceUp
        ? { status: "ok" as const, service: "mock-logistics", port: 5001, version: "1.0.0" }
        : (() => {
            throw new Error("Mock Logistics API unavailable on :5001");
          })(),
      120,
    ),

  listShipments: async () => {
    assertUp();
    return delay([...db.shipments]);
  },

  getShipment: async (trackingId: string) => {
    assertUp();
    return delay({ ...find(trackingId) });
  },

  listShipmentEvents: async (trackingId: string) => {
    assertUp();
    return delay(db.events.filter((e) => e.tracking_id === trackingId));
  },

  listWebhookEvents: async () => {
    assertUp();
    return delay(db.webhooks.slice(0, 80), 100);
  },

  stats: async (): Promise<Stats> => {
    assertUp();
    const in_transit = db.shipments.filter((s) => s.status === "IN_TRANSIT").length;
    const delivered = db.shipments.filter((s) => s.status === "DELIVERED").length;
    const damaged = db.shipments.filter((s) => s.condition === "DAMAGED").length;
    const total = db.webhooks.length || 1;
    const ok = db.webhooks.filter((w) => w.status === "SENT").length;
    return delay({
      in_transit,
      delivered,
      damaged,
      webhook_success_rate: Math.round((ok / total) * 100),
    });
  },

  transit: async (trackingId: string) => {
    assertUp();
    const s = find(trackingId);
    if (s.status !== "CREATED") throw new Error(`Shipment is already ${s.status}`);
    s.status = "IN_TRANSIT";
    s.updated_at = now();
    pushEvent(trackingId, "SCANNED_INTO_TRANSIT", "Scanned at origin hub");
    const wh = pushWebhook(s, "TRANSIT_EVENT", {
      tracking_id: trackingId,
      status: "IN_TRANSIT",
    });
    return delay({ shipment: { ...s }, webhook: { ...wh } });
  },

  deliver: async (trackingId: string) => {
    assertUp();
    const s = find(trackingId);
    if (s.status === "DELIVERED") throw new Error("Shipment already delivered");
    s.status = "DELIVERED";
    s.updated_at = now();
    pushEvent(trackingId, "DELIVERED", "Delivered to consignee");
    const wh = pushWebhook(s, "DELIVERY_EVENT", {
      tracking_id: trackingId,
      order_id: s.order_id,
      status: "DELIVERED",
      condition: s.condition,
    });
    return delay({ shipment: { ...s }, webhook: { ...wh } });
  },

  damage: async (trackingId: string, reason: string) => {
    assertUp();
    const s = find(trackingId);
    s.condition = "DAMAGED";
    s.damage_reason = reason;
    s.updated_at = now();
    pushEvent(trackingId, "DAMAGE_REPORTED", reason);
    const wh = pushWebhook(s, "DAMAGE_EVENT", {
      tracking_id: trackingId,
      order_id: s.order_id,
      status: "DAMAGED",
      reason,
    });
    return delay({ shipment: { ...s }, webhook: { ...wh } });
  },

  retryWebhook: async (eventId: string) => {
    assertUp();
    const wh = db.webhooks.find((w) => w.id === eventId);
    if (!wh) throw new Error("Webhook event not found");
    wh.attempt = 1;
    wh.status = "SENT";
    wh.http_status = 200;
    wh.http_text = "200 OK";
    return delay({ ...wh });
  },

  resetShipment: async (trackingId: string) => {
    assertUp();
    const s = find(trackingId);
    s.status = "CREATED";
    s.condition = "INTACT";
    s.damage_reason = undefined;
    s.updated_at = now();
    pushEvent(trackingId, "DEMO_RESET", "Shipment reset by demo control");
    return delay({ ...s });
  },

  createSampleShipment: async () => {
    assertUp();
    const tracking = nextTracking();
    const s: Shipment = {
      tracking_id: tracking,
      order_id: `ORD-${Math.floor(10000 + Math.random() * 89999)}`,
      item_count: [60, 120, 250, 500, 900][Math.floor(Math.random() * 5)]!,
      status: "CREATED",
      condition: "INTACT",
      created_at: now(),
      updated_at: now(),
    };
    db.shipments.unshift(s);
    pushEvent(tracking, "SHIPMENT_CREATED", `Shipment registered for ${s.order_id}`);
    pushWebhook(s, "CREATE_SHIPMENT", {
      tracking_id: tracking,
      order_id: s.order_id,
      status: "CREATED",
    });
    return delay({ ...s });
  },

  setServiceUp: async (up: boolean) => {
    db.serviceUp = up;
    return delay(up, 60);
  },
  isServiceUp: () => db.serviceUp,
};
