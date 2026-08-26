import random
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.shipment import Shipment
from app.services.webhook_service import create_and_send_webhook

def _generate_tracking_id() -> str:
    return f"OMNI-TRK-{random.randint(1000, 9999)}"

def create_shipment(db: Session, order_id: str, item_count: int) -> Shipment:
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
    return shipment

def get_shipment(db: Session, tracking_id: str) -> Shipment:
    shipment = db.query(Shipment).filter(Shipment.tracking_id == tracking_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment

def list_shipments(db: Session, status: str | None = None, limit: int = 50, offset: int = 0):
    query = db.query(Shipment)
    if status:
        query = query.filter(Shipment.carrier_status == status)
    return query.offset(offset).limit(limit).all()

def mark_transit(db: Session, tracking_id: str) -> Shipment:
    shipment = get_shipment(db, tracking_id)
    if shipment.carrier_status != "CREATED" and shipment.carrier_status != "IN_TRANSIT":
        raise HTTPException(status_code=409, detail="Invalid transition to IN_TRANSIT")
    shipment.carrier_status = "IN_TRANSIT"
    shipment.goods_condition = "INTACT"
    db.commit()
    db.refresh(shipment)
    return shipment

def deliver_shipment(db: Session, tracking_id: str) -> Shipment:
    shipment = get_shipment(db, tracking_id)
    if shipment.carrier_status != "IN_TRANSIT":
        raise HTTPException(status_code=409, detail="Only IN_TRANSIT shipments can be delivered")
    
    shipment.carrier_status = "DELIVERED"
    db.commit()
    db.refresh(shipment)
    
    create_and_send_webhook(
        db=db,
        tracking_id=shipment.tracking_id,
        order_id=shipment.omnitrust_order_id,
        status="DELIVERED",
        goods_condition=shipment.goods_condition
    )
    return shipment

def damage_shipment(db: Session, tracking_id: str, damage_reason: str | None) -> Shipment:
    shipment = get_shipment(db, tracking_id)
    if shipment.carrier_status != "IN_TRANSIT":
        raise HTTPException(status_code=409, detail="Only IN_TRANSIT shipments can be damaged")
    
    shipment.carrier_status = "DAMAGED"
    shipment.goods_condition = "DAMAGED"
    db.commit()
    db.refresh(shipment)
    
    create_and_send_webhook(
        db=db,
        tracking_id=shipment.tracking_id,
        order_id=shipment.omnitrust_order_id,
        status="DAMAGED",
        goods_condition="DAMAGED",
        damage_reason=damage_reason
    )
    return shipment

def reset_shipment(db: Session, tracking_id: str) -> Shipment:
    shipment = get_shipment(db, tracking_id)
    shipment.carrier_status = "IN_TRANSIT"
    shipment.goods_condition = "INTACT"
    db.commit()
    db.refresh(shipment)
    return shipment
