import random
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks
from fastapi.responses import JSONResponse
from app.models.shipment import Shipment
from app.services.webhook_service import create_and_send_webhook

logger = logging.getLogger("mock-logistics.shipment")


def _generate_tracking_id() -> str:
    return f"OMNI-TRK-{random.randint(1000, 9999)}"


def _error_response(status_code: int, error: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": error, "message": message}
    )


def create_shipment(
    db: Session,
    order_id: str,
    item_count: int,
    background_tasks: BackgroundTasks | None = None,
) -> Shipment | JSONResponse:
    # Check for duplicate active shipment
    existing = db.query(Shipment).filter(
        Shipment.omnitrust_order_id == order_id,
        Shipment.carrier_status == "IN_TRANSIT"
    ).first()
    if existing:
        return _error_response(
            409,
            "SHIPMENT_ALREADY_EXISTS",
            f"An active shipment already exists for order {order_id}"
        )

    shipment = Shipment(
        tracking_id=_generate_tracking_id(),
        omnitrust_order_id=order_id,
        item_count=item_count,
        carrier_status="IN_TRANSIT",
        goods_condition="INTACT"
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)
    logger.info(f"Shipment created: {shipment.tracking_id} for order {order_id}")
    return shipment


def get_shipment(db: Session, tracking_id: str) -> Shipment | JSONResponse:
    shipment = db.query(Shipment).filter(Shipment.tracking_id == tracking_id).first()
    if not shipment:
        return _error_response(404, "SHIPMENT_NOT_FOUND", f"Shipment {tracking_id} not found")
    return shipment


def list_shipments(db: Session, status: str | None = None, limit: int = 50, offset: int = 0):
    query = db.query(Shipment)
    if status:
        query = query.filter(Shipment.carrier_status == status)
    return query.offset(offset).limit(limit).all()


def mark_transit(db: Session, tracking_id: str) -> Shipment | JSONResponse:
    result = get_shipment(db, tracking_id)
    if isinstance(result, JSONResponse):
        return result
    shipment = result
    if shipment.carrier_status != "CREATED" and shipment.carrier_status != "IN_TRANSIT":
        return _error_response(
            409,
            "INVALID_STATE_TRANSITION",
            f"Cannot transition to IN_TRANSIT from {shipment.carrier_status}"
        )
    shipment.carrier_status = "IN_TRANSIT"
    shipment.goods_condition = "INTACT"
    shipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shipment)
    return shipment


def deliver_shipment(
    db: Session,
    tracking_id: str,
    idempotency_key: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> Shipment | JSONResponse:
    result = get_shipment(db, tracking_id)
    if isinstance(result, JSONResponse):
        return result
    shipment = result

    if shipment.carrier_status == "DELIVERED":
        # Idempotent: already delivered, return existing state
        return shipment
    
    if shipment.carrier_status != "IN_TRANSIT":
        return _error_response(
            409,
            "INVALID_STATE_TRANSITION",
            f"Shipment is already {shipment.carrier_status}"
        )
    
    shipment.carrier_status = "DELIVERED"
    shipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shipment)
    
    idem_key = idempotency_key or f"deliver-{tracking_id}"
    
    create_and_send_webhook(
        db=db,
        tracking_id=shipment.tracking_id,
        order_id=shipment.omnitrust_order_id,
        status="DELIVERED",
        goods_condition=shipment.goods_condition,
        idempotency_key=idem_key,
    )
    logger.info(f"Shipment delivered: {tracking_id}")
    return shipment


def damage_shipment(
    db: Session,
    tracking_id: str,
    damage_reason: str | None,
    idempotency_key: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> Shipment | JSONResponse:
    result = get_shipment(db, tracking_id)
    if isinstance(result, JSONResponse):
        return result
    shipment = result

    if shipment.carrier_status == "DAMAGED":
        # Idempotent: already damaged, return existing state
        return shipment

    if shipment.carrier_status != "IN_TRANSIT":
        return _error_response(
            409,
            "INVALID_STATE_TRANSITION",
            f"Shipment is already {shipment.carrier_status}"
        )
    
    shipment.carrier_status = "DAMAGED"
    shipment.goods_condition = "DAMAGED"
    shipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shipment)
    
    idem_key = idempotency_key or f"damage-{tracking_id}"
    
    create_and_send_webhook(
        db=db,
        tracking_id=shipment.tracking_id,
        order_id=shipment.omnitrust_order_id,
        status="DAMAGED",
        goods_condition="DAMAGED",
        damage_reason=damage_reason,
        idempotency_key=idem_key,
    )
    logger.info(f"Shipment damaged: {tracking_id}")
    return shipment


def reset_shipment(db: Session, tracking_id: str) -> Shipment | JSONResponse:
    result = get_shipment(db, tracking_id)
    if isinstance(result, JSONResponse):
        return result
    shipment = result
    shipment.carrier_status = "IN_TRANSIT"
    shipment.goods_condition = "INTACT"
    shipment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shipment)
    logger.info(f"Shipment reset: {tracking_id}")
    return shipment
