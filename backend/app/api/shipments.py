"""OmniTrust Backend — Shipment Endpoints"""
from fastapi import APIRouter, HTTPException

from app.db import queries
from app.dependencies import AuthUser, DB
from app.services import shipment_service

router = APIRouter(tags=["shipments"])


@router.post("/api/v1/orders/{order_id}/shipment", status_code=201)
def create_shipment(order_id: str, db: DB, user: AuthUser):
    try:
        shipment = shipment_service.register_shipment(
            db, order_id=order_id, user_id=user.user_id
        )
        return {"success": True, "data": shipment, "error": None}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "SHIPMENT_ERROR", "message": str(exc)})
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "LOGISTICS_UNAVAILABLE", "message": str(exc)},
        )


@router.get("/api/v1/shipments")
def list_shipments(db: DB, user: AuthUser):
    shipments = queries.list_shipments(db, user_id=user.user_id)
    return {"success": True, "data": shipments, "error": None}


@router.get("/api/v1/shipments/{tracking_id}")
def get_shipment(tracking_id: str, db: DB, user: AuthUser):
    shipment = queries.get_shipment_by_tracking(db, tracking_id)
    if not shipment:
        raise HTTPException(
            status_code=404,
            detail={"code": "SHIPMENT_NOT_FOUND", "message": f"Tracking ID {tracking_id} not found"},
        )
    return {"success": True, "data": shipment, "error": None}
