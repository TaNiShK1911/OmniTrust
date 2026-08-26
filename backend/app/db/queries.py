"""
OmniTrust Backend — Database Query Helpers

Typed wrappers around the Supabase service-role client for all OmniTrust
tables. All functions raise RuntimeError on unexpected DB errors so callers
get a clear failure path without scattered try/except blocks.
"""
from typing import Any

from supabase import Client


# ── Generic helpers ───────────────────────────────────────────────────────────


def _must(data: Any, msg: str) -> Any:
    if data is None:
        raise RuntimeError(msg)
    return data


def _check(error: Any, context: str) -> None:
    if error:
        raise RuntimeError(f"{context}: {error.message}")


# ── Profiles ──────────────────────────────────────────────────────────────────


def get_profile(db: Client, user_id: str) -> dict | None:
    res = db.table("profiles").select("*").eq("id", user_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def upsert_profile(db: Client, user_id: str, fields: dict) -> dict:
    res = db.table("profiles").upsert({"id": user_id, **fields}, on_conflict="id").execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": user_id, **fields}


# ── Products ──────────────────────────────────────────────────────────────────


def list_products(
    db: Client,
    *,
    search: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> list[dict]:
    q = db.table("products").select("*")
    if search:
        q = q.ilike("name", f"%{search}%")
    offset = (page - 1) * limit
    res = q.range(offset, offset + limit - 1).order("list_price").execute()
    return res.data or []


def get_product(db: Client, product_id: str) -> dict:
    res = db.table("products").select("*").eq("id", product_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError(f"Product {product_id} not found")


def create_product(db: Client, fields: dict) -> dict:
    res = db.table("products").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError("Product creation returned no data")


def update_product(db: Client, product_id: str, fields: dict) -> dict:
    res = db.table("products").update(fields).eq("id", product_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": product_id, **fields}


# ── Negotiations ──────────────────────────────────────────────────────────────


def create_negotiation(db: Client, fields: dict) -> dict:
    res = db.table("negotiations").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError("Negotiation creation returned no data")


def get_negotiation(db: Client, session_id: str) -> dict:
    res = (
        db.table("negotiations")
        .select("*, product:products(*)")
        .eq("id", session_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError(f"Negotiation {session_id} not found")


def update_negotiation(db: Client, session_id: str, fields: dict) -> dict:
    res = db.table("negotiations").update(fields).eq("id", session_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": session_id, **fields}


def list_negotiations(db: Client, user_id: str, limit: int = 20) -> list[dict]:
    res = (
        db.table("negotiations")
        .select("*, product:products(name, sku)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


# ── Orders ────────────────────────────────────────────────────────────────────


def create_order(db: Client, fields: dict) -> dict:
    res = db.table("orders").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError("Order creation returned no data")


def get_order(db: Client, order_id: str) -> dict:
    res = (
        db.table("orders")
        .select("*, shipments(*), disputes(*), negotiations(*)")
        .eq("id", order_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError(f"Order {order_id} not found")


def update_order(db: Client, order_id: str, fields: dict) -> dict:
    res = db.table("orders").update(fields).eq("id", order_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": order_id, **fields}


def list_orders(
    db: Client,
    *,
    user_id: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> list[dict]:
    q = db.table("orders").select("*, shipments(*), disputes(*)")
    if user_id:
        q = q.eq("user_id", user_id)
    if status:
        q = q.eq("status", status)
    offset = (page - 1) * limit
    res = q.range(offset, offset + limit - 1).order("created_at", desc=True).execute()
    return res.data or []


def get_order_by_negotiation(db: Client, negotiation_id: str) -> dict | None:
    res = (
        db.table("orders")
        .select("id")
        .eq("negotiation_id", negotiation_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


# ── Shipments ─────────────────────────────────────────────────────────────────


def create_shipment(db: Client, fields: dict) -> dict:
    res = db.table("shipments").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError("Shipment creation returned no data")


def get_shipment_by_tracking(db: Client, tracking_id: str) -> dict | None:
    res = (
        db.table("shipments")
        .select("*, orders(*)")
        .eq("tracking_id", tracking_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def update_shipment(db: Client, shipment_id: str, fields: dict) -> dict:
    res = db.table("shipments").update(fields).eq("id", shipment_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": shipment_id, **fields}


def list_shipments(db: Client, user_id: str | None = None) -> list[dict]:
    q = db.table("shipments").select("*, orders(id, status, total_amount)")
    if user_id:
        q = q.eq("user_id", user_id)
    res = q.order("created_at", desc=True).execute()
    return res.data or []


# ── Disputes ──────────────────────────────────────────────────────────────────


def create_dispute(db: Client, fields: dict) -> dict:
    res = db.table("disputes").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError("Dispute creation returned no data")


def get_dispute(db: Client, dispute_id: str) -> dict:
    res = (
        db.table("disputes")
        .select("*, orders(*)")
        .eq("id", dispute_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError(f"Dispute {dispute_id} not found")


def update_dispute(db: Client, dispute_id: str, fields: dict) -> dict:
    res = db.table("disputes").update(fields).eq("id", dispute_id).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": dispute_id, **fields}


def list_disputes_for_order(db: Client, order_id: str) -> list[dict]:
    res = (
        db.table("disputes")
        .select("*")
        .eq("order_id", order_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


# ── Audit Events ──────────────────────────────────────────────────────────────


def insert_audit_event(db: Client, fields: dict) -> dict | None:
    res = db.table("audit_events").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def list_audit_events(
    db: Client,
    *,
    order_id: str | None = None,
    negotiation_id: str | None = None,
    event_type: str | None = None,
    user_id: str | None = None,
    limit: int = 200,
    cursor: str | None = None,
) -> list[dict]:
    q = db.table("audit_events").select("*")
    if order_id:
        q = q.eq("order_id", order_id)
    if negotiation_id:
        q = q.eq("negotiation_id", negotiation_id)
    if event_type:
        q = q.eq("event_type", event_type)
    if user_id:
        q = q.eq("user_id", user_id)
    if cursor:
        q = q.gt("created_at", cursor)
    res = q.order("created_at").limit(limit).execute()
    return res.data or []


def get_audit_event(db: Client, event_id: str) -> dict:
    res = (
        db.table("audit_events")
        .select("*")
        .eq("id", event_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    raise RuntimeError(f"Audit event {event_id} not found")


def check_audit_event_exists(
    db: Client, request_id: str, event_type: str
) -> bool:
    """Used for webhook idempotency checks."""
    if not request_id:
        return False
    res = (
        db.table("audit_events")
        .select("id")
        .eq("request_id", request_id)
        .eq("event_type", event_type)
        .execute()
    )
    return bool(res and res.data and len(res.data) > 0)


