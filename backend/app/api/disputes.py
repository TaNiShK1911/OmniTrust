"""OmniTrust Backend — Dispute, Settlement & Refund Endpoints"""
from fastapi import APIRouter, HTTPException

from app.db import queries
from app.dependencies import AuthUser, DB
from app.services import dispute_service, settlement_service

router = APIRouter(tags=["disputes"])


# ── Settlement ────────────────────────────────────────────────────────────────

@router.post("/api/v1/orders/{order_id}/settle")
def settle_order(order_id: str, db: DB, user: AuthUser):
    try:
        result = settlement_service.settle_order(db, order_id=order_id, user_id=user.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    if not result["ok"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "SETTLEMENT_BLOCKED", "message": "Settlement gate checks failed", "checks": result.get("checks")},
        )
    return {"success": True, "data": result, "error": None}


@router.get("/api/v1/orders/{order_id}/settlement")
def get_settlement(order_id: str, db: DB, user: AuthUser):
    try:
        order = queries.get_order_for_user(db, order_id, user.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    return {
        "success": True,
        "data": {
            "order_id": order_id,
            "status": order["status"],
            "settlement_ref": order.get("settlement_ref"),
            "escrow_status": order["escrow_status"],
        },
        "error": None,
    }


# ── Disputes ──────────────────────────────────────────────────────────────────

@router.post("/api/v1/orders/{order_id}/disputes", status_code=201)
def create_dispute(order_id: str, db: DB, user: AuthUser):
    try:
        dispute = dispute_service.create_dispute(db, order_id=order_id, user_id=user.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    return {"success": True, "data": dispute, "error": None}


@router.get("/api/v1/disputes/{dispute_id}")
def get_dispute(dispute_id: str, db: DB, user: AuthUser):
    try:
        dispute = queries.get_dispute_for_user(db, dispute_id, user.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    return {"success": True, "data": dispute, "error": None}


@router.post("/api/v1/disputes/{dispute_id}/arbitrate")
def arbitrate(dispute_id: str, db: DB, user: AuthUser):
    try:
        result = dispute_service.run_arbitration(db, dispute_id=dispute_id, user_id=user.user_id)
        return {"success": True, "data": result, "error": None}
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "ARBITRATION_ERROR", "message": str(exc)})


@router.post("/api/v1/disputes/{dispute_id}/refund")
def execute_refund(dispute_id: str, db: DB, user: AuthUser):
    try:
        result = dispute_service.execute_refund(db, dispute_id=dispute_id, user_id=user.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    if not result["ok"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "REFUND_BLOCKED", "message": "Refund gate checks failed", "checks": result.get("checks")},
        )
    return {"success": True, "data": result, "error": None}


@router.get("/api/v1/orders/{order_id}/refunds")
def get_refunds(order_id: str, db: DB, user: AuthUser):
    try:
        queries.get_order_for_user(db, order_id, user.user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": str(exc)})
    disputes = queries.list_disputes_for_order(db, order_id)
    refunds = [d for d in disputes if d.get("refund_ref")]
    return {"success": True, "data": refunds, "error": None}
