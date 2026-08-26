"""
OmniTrust Backend — Shipment Service

Calls the Mock 3PL to register a shipment and creates the DB record.
Falls back to an in-process simulation if the 3PL is unreachable.
"""
import random

from supabase import Client

from app.db import queries
from app.integrations.logistics_client import LogisticsUnavailableError, create_shipment as call_3pl
from app.services.audit_service import log_event


def _fallback_tracking_id() -> str:
    return f"OMNI-TRK-{random.randint(1000, 9999)}"


def register_shipment(db: Client, *, order_id: str, user_id: str) -> dict:
    """
    Register a shipment for a funded order.
    Requires order.escrow_status == 'held'.
    Idempotent: returns existing shipment if already registered.
    """
    order = queries.get_order(db, order_id)

    if order["escrow_status"] != "held":
        raise ValueError("Escrow must be held before creating a shipment")

    existing_shipments = order.get("shipments") or []
    if existing_shipments:
        return existing_shipments[0]

    quantity = int(order["quantity"])
    tracking_id: str
    carrier = "OmniTrust Mock 3PL"
    logistics_ok = True

    try:
        result = call_3pl(order_id, quantity)
        tracking_id = result["tracking_id"]
    except LogisticsUnavailableError as exc:
        # Degrade gracefully for the demo: generate a local tracking ID
        tracking_id = _fallback_tracking_id()
        logistics_ok = False
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="logistics",
            event_type="shipment.3pl_unavailable",
            actor="Logistics Adapter",
            status="warning",
            decision="SIMULATED",
            payload={"error": str(exc), "tracking_id": tracking_id},
        )

    shipment = queries.create_shipment(
        db,
        {
            "user_id": user_id,
            "order_id": order_id,
            "tracking_id": tracking_id,
            "carrier": carrier,
            "status": "in_transit",
            "condition": "intact",
        },
    )

    queries.update_order(db, order_id, {"status": "in_transit"})

    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="logistics",
        event_type="shipment.registered",
        actor="Mock 3PL" if logistics_ok else "Local Simulator",
        entity=tracking_id,
        decision="REGISTERED",
        payload={
            "tracking_id": tracking_id,
            "carrier": carrier,
            "quantity": quantity,
            "condition": "intact",
            "3pl_called": logistics_ok,
        },
    )
    return shipment
