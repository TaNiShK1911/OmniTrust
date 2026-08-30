"""OmniTrust Backend — Order Endpoints"""
from fastapi import APIRouter, HTTPException, Query

from app.db import queries
from app.dependencies import AuthUser, DB
from app.services import negotiation_service
from app.services.audit_service import log_event

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


@router.post("/from-negotiation/{session_id}", status_code=201)
def create_from_negotiation(session_id: str, db: DB, user: AuthUser):
    try:
        result = negotiation_service.approve_session(
            db,
            session_id=session_id,
            user_id=user.user_id,
            is_external_agent=(user.role == "agent-buyer"),
            spending_cap=getattr(user, "spending_cap", None),
        )
        order = queries.get_order(db, result["order_id"])
        return {"success": True, "data": order, "error": None}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "ORDER_CREATE_ERROR", "message": str(exc)})


@router.get("")
def list_orders(
    db: DB,
    user: AuthUser,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    orders = queries.list_orders(db, user_id=user.user_id, status=status, page=page, limit=limit)
    return {"success": True, "data": orders, "error": None}


@router.get("/{order_id}")
def get_order(order_id: str, db: DB, user: AuthUser):
    order = queries.get_order(db, order_id)
    return {"success": True, "data": order, "error": None}


@router.post("/{order_id}/cancel")
def cancel_order(order_id: str, db: DB, user: AuthUser):
    order = queries.get_order(db, order_id)
    non_cancellable = {"escrow_held", "in_transit", "delivered", "settled", "refunded"}
    if order["status"] in non_cancellable:
        raise HTTPException(
            status_code=409,
            detail={"code": "ORDER_NOT_CANCELLABLE", "message": f"Cannot cancel order in status '{order['status']}'"},
        )
    updated = queries.update_order(db, order_id, {"status": "cancelled"})
    log_event(
        db,
        user_id=user.user_id,
        order_id=order_id,
        category="guardrail",
        event_type="order.cancelled",
        actor="User",
        decision="CANCELLED",
        payload={},
    )
    return {"success": True, "data": updated, "error": None}


@router.get("/{order_id}/timeline")
def get_timeline(order_id: str, db: DB, user: AuthUser):
    """Frontend-optimised chronological audit trail for one order."""
    events = queries.list_audit_events(db, order_id=order_id)
    order = queries.get_order(db, order_id)
    return {
        "success": True,
        "data": {"order": order, "timeline": events},
        "error": None,
    }
