"""
OmniTrust Backend — Payment & Escrow Endpoints

Provides REST endpoints for PayPal Orders v2 and Payments v2:
- create PayPal order (intent=AUTHORIZE)
- authorize approved order
- query canonical payment status
- capture authorized funds (gated)
- void authorization
- backward compatible escrow routes
"""
from typing import Any
from fastapi import APIRouter, Body, HTTPException, status
from pydantic import BaseModel

from app.dependencies import AuthUser, DB
from app.integrations.paypal_client import PayPalError
from app.services import escrow_service, payment_service

router = APIRouter(prefix="/api/v1/orders", tags=["payments"])


class AuthorizeRequest(BaseModel):
    paypal_order_id: str


@router.post("/{order_id}/paypal-order")
async def create_paypal_order(order_id: str, db: DB, user: AuthUser):
    """
    Step 1: Initiate PayPal order with intent=AUTHORIZE.
    Returns the PayPal Order ID and buyer approval URL.
    """
    try:
        result = await payment_service.create_payment_order(
            db, order_id=order_id, user_id=user.user_id
        )
        return {"success": True, "data": result, "error": None}
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except (ValueError, PayPalError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PAYPAL_ORDER_ERROR", "message": str(exc)},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "PAYMENT_PROVIDER_ERROR", "message": str(exc)},
        )


@router.post("/{order_id}/authorize")
async def authorize_paypal_order(
    order_id: str,
    payload: AuthorizeRequest,
    db: DB,
    user: AuthUser,
):
    """
    Step 2: Authorize funds for an order after buyer approval.
    """
    try:
        result = await payment_service.authorize_payment(
            db,
            order_id=order_id,
            paypal_order_id=payload.paypal_order_id,
            user_id=user.user_id,
        )
        return {"success": True, "data": result, "error": None}
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except (ValueError, PayPalError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "AUTHORIZATION_ERROR", "message": str(exc)},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "PAYMENT_PROVIDER_ERROR", "message": str(exc)},
        )


@router.get("/{order_id}/payment")
def get_payment_status(order_id: str, db: DB, user: AuthUser):
    """
    Retrieve canonical payment state and authorization/capture references.
    """
    status_data = payment_service.get_payment_status(db, order_id=order_id)
    return {"success": True, "data": status_data, "error": None}


@router.post("/{order_id}/capture")
async def capture_payment(order_id: str, db: DB, user: AuthUser):
    """
    Capture authorized payment after settlement checks pass.
    """
    try:
        result = await payment_service.capture_order(
            db, order_id=order_id, user_id=user.user_id
        )
        if not result["ok"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "SETTLEMENT_BLOCKED",
                    "message": "Settlement gate checks failed",
                    "checks": result.get("checks"),
                },
            )
        return {"success": True, "data": result, "error": None}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "CAPTURE_ERROR", "message": str(exc)},
        )


@router.post("/{order_id}/void")
async def void_payment(order_id: str, db: DB, user: AuthUser):
    """
    Void uncaptured authorization (all-or-nothing).
    """
    try:
        result = await payment_service.void_order(
            db, order_id=order_id, user_id=user.user_id
        )
        return {"success": True, "data": result, "error": None}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "VOID_ERROR", "message": str(exc)},
        )


# ── Backward-compatibility routes ─────────────────────────────────────────────

@router.post("/{order_id}/escrow", deprecated=True)
async def create_escrow_compat(order_id: str, db: DB, user: AuthUser):
    """Deprecated compatibility route: creates PayPal order."""
    try:
        result = await payment_service.create_payment_order(
            db, order_id=order_id, user_id=user.user_id
        )
        return {"success": True, "data": result, "error": None}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "ESCROW_ERROR", "message": str(exc)},
        )


@router.get("/{order_id}/escrow", deprecated=True)
def get_escrow_compat(order_id: str, db: DB, user: AuthUser):
    """Deprecated compatibility route: returns payment status."""
    result = payment_service.get_payment_status(db, order_id=order_id)
    return {"success": True, "data": result, "error": None}
