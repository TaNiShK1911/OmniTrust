from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.webhook import WebhookEventResponse
from app.models.webhook_event import WebhookEvent
from app.services import webhook_service

router = APIRouter(prefix="/api/v1", tags=["events"])

@router.get("/shipments/{tracking_id}/events", response_model=list[WebhookEventResponse])
def get_shipment_events(tracking_id: str, db: Session = Depends(get_db)):
    events = db.query(WebhookEvent).filter(WebhookEvent.tracking_id == tracking_id).all()
    return events

@router.get("/webhook-events", response_model=list[WebhookEventResponse])
def list_webhook_events(
    tracking_id: str | None = Query(None),
    event_type: str | None = Query(None),
    delivery_status: str | None = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    query = db.query(WebhookEvent)
    if tracking_id:
        query = query.filter(WebhookEvent.tracking_id == tracking_id)
    if event_type:
        query = query.filter(WebhookEvent.event_type == event_type)
    if delivery_status:
        query = query.filter(WebhookEvent.delivery_status == delivery_status)
    return query.offset(offset).limit(limit).all()

@router.post("/webhook-events/{event_id}/retry", response_model=WebhookEventResponse)
def retry_webhook_event(event_id: str, db: Session = Depends(get_db)):
    event = webhook_service.retry_webhook(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found or already sent")
    return event
