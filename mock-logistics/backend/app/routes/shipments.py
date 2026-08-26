from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.shipment import CreateShipmentRequest, ShipmentResponse, DamageShipmentRequest
from app.services import shipment_service

router = APIRouter(prefix="/api/v1", tags=["shipments"])

@router.post("/create_shipment", response_model=ShipmentResponse, status_code=201)
def create_shipment(body: CreateShipmentRequest, db: Session = Depends(get_db)):
    return shipment_service.create_shipment(db, body.order_id, body.item_count)

@router.get("/shipments", response_model=list[ShipmentResponse])
def list_shipments(
    status: str | None = Query(None),
    order_id: str | None = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    query = db.query(shipment_service.Shipment)
    if status:
        query = query.filter(shipment_service.Shipment.carrier_status == status)
    if order_id:
        query = query.filter(shipment_service.Shipment.omnitrust_order_id == order_id)
    return query.offset(offset).limit(limit).all()

@router.get("/shipments/{tracking_id}", response_model=ShipmentResponse)
def get_shipment(tracking_id: str, db: Session = Depends(get_db)):
    return shipment_service.get_shipment(db, tracking_id)

@router.post("/shipments/{tracking_id}/transit", response_model=ShipmentResponse)
def transit_shipment(tracking_id: str, db: Session = Depends(get_db)):
    return shipment_service.mark_transit(db, tracking_id)

@router.post("/shipments/{tracking_id}/deliver", response_model=ShipmentResponse)
def deliver_shipment(tracking_id: str, db: Session = Depends(get_db)):
    return shipment_service.deliver_shipment(db, tracking_id)

@router.post("/shipments/{tracking_id}/damage", response_model=ShipmentResponse)
def damage_shipment(tracking_id: str, body: DamageShipmentRequest, db: Session = Depends(get_db)):
    return shipment_service.damage_shipment(db, tracking_id, body.damage_reason)

@router.post("/shipments/{tracking_id}/reset", response_model=ShipmentResponse)
def reset_shipment(tracking_id: str, db: Session = Depends(get_db)):
    # Demo only
    return shipment_service.reset_shipment(db, tracking_id)
