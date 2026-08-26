from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class CreateShipmentRequest(BaseModel):
    order_id: str = Field(..., min_length=1, description="OmniTrust order ID")
    item_count: int = Field(..., gt=0, description="Number of items in shipment")

class ShipmentResponse(BaseModel):
    id: str
    tracking_id: str
    omnitrust_order_id: str
    item_count: int
    carrier_status: str
    goods_condition: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DamageShipmentRequest(BaseModel):
    damage_reason: Optional[str] = None
