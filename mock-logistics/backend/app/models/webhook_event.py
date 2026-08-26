from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Integer, DateTime
from app.database import Base

class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tracking_id = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False)
    payload = Column(String, nullable=False) # JSON text
    signature = Column(String, nullable=False)
    idempotency_key = Column(String, unique=True, nullable=True, index=True)
    
    attempt_count = Column(Integer, default=0)
    delivery_status = Column(String, default="PENDING") # PENDING, SENT, FAILED
    response_code = Column(Integer, nullable=True)
    last_error = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    delivered_at = Column(DateTime, nullable=True)
