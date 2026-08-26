"""OmniTrust Backend — Escrow Endpoints"""
from fastapi import APIRouter, HTTPException

from app.dependencies import AuthUser, DB
from app.services import escrow_service

router = APIRouter(prefix="/api/v1/orders", tags=["escrow"])


@router.post("/{order_id}/escrow")
def create_escrow(order_id: str, db: DB, user: AuthUser):
    try:
        result = escrow_service.create_escrow(db, order_id=order_id, user_id=user.user_id)
        return {"success": True, "data": result, "error": None}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "ESCROW_ERROR", "message": str(exc)})
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "PAYMENT_PROVIDER_UNAVAILABLE", "message": str(exc)},
        )


@router.get("/{order_id}/escrow")
def get_escrow(order_id: str, db: DB, user: AuthUser):
    result = escrow_service.get_escrow_status(db, order_id)
    return {"success": True, "data": result, "error": None}
