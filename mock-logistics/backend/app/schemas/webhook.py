from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class WebhookEventResponse(BaseModel):
    id: str
    tracking_id: str
    event_type: str
    payload: str
    signature: str
    idempotency_key: Optional[str] = None
    attempt_count: int
    delivery_status: str
    response_code: Optional[int] = None
    last_error: Optional[str] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None

    class Config:
        from_attributes = True
