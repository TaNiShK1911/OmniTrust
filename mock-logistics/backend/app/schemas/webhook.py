from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class WebhookEventResponse(BaseModel):
    id: str
    tracking_id: str
    event_type: str
    payload: str
    signature: str
    attempt_count: int
    delivery_status: str
    response_code: Optional[int]
    created_at: datetime
    delivered_at: Optional[datetime]

    class Config:
        from_attributes = True
