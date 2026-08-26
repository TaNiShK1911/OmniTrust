"""
OmniTrust Backend — Settlement Service

Releases escrow to the seller after a DELIVERED webhook event.
The settlement gate is the authoritative check — even if the webhook handler
calls this, it only proceeds when all conditions are met.
"""
from supabase import Client

from app.db import queries
from app.integrations.razorpay_client import payment_provider
from app.services.audit_service import log_event
from app.services.gatekeeper import run_settlement_checks
from app.services.idempotency_service import check_already_done, provider_ref


def settle_order(db: Client, *, order_id: str, user_id: str) -> dict:
    """
    Execute settlement: verify gate, call Razorpay Route, update order.
    Returns {"ok": bool, "checks": [...], "order": {...}}.
    """
    order = queries.get_order(db, order_id)
    shipments = order.get("shipments") or []
    disputes = order.get("disputes") or []

    shipment = shipments[0] if shipments else None
    dispute = disputes[0] if disputes else None

    # Idempotency: already settled
    if check_already_done(db, idempotency_key=order.get("idempotency_key", ""), event_type="settlement.route_submitted"):
        return {"ok": True, "already_settled": True, "order": order}

    gate = run_settlement_checks(
        order_status=order["status"],
        escrow_status=order["escrow_status"],
        shipment_delivered=bool(shipment and shipment.get("status") == "delivered"),
        dispute_open=bool(dispute and dispute.get("status") == "open"),
        already_settled=bool(order.get("settlement_ref")),
    )

    if not gate.passed:
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="settlement",
            event_type="settlement.blocked",
            actor="Settlement Gate",
            status="failed",
            decision="BLOCKED",
            payload=gate.to_dict(),
        )
        return {"ok": False, "checks": gate.to_dict()["checks"], "order": order}

    # Execute Razorpay Route transfer
    result = payment_provider.route_transfer(
        db, user_id, order_id, float(order["total_amount"])
    )

    updated = queries.update_order(
        db,
        order_id,
        {
            "status": "settled",
            "escrow_status": "released",
            "settlement_ref": result["provider_reference"],
        },
    )

    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="settlement",
        event_type="settlement.completed",
        actor="Payment Provider (test mode)",
        entity=result["provider_reference"],
        decision="SELLER_PAID",
        request_id=order.get("idempotency_key"),
        payload={
            "checks": gate.to_dict()["checks"],
            "provider_ref": result["provider_reference"],
            "amount": float(order["total_amount"]),
        },
    )
    return {"ok": True, "checks": gate.to_dict()["checks"], "order": updated}
