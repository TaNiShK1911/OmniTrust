from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Integer, DateTime
from app.database import Base

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tracking_id = Column(String, unique=True, index=True, nullable=False)
    omnitrust_order_id = Column(String, nullable=False)
    item_count = Column(Integer, nullable=False)
    carrier_status = Column(String, nullable=False)  # IN_TRANSIT, DELIVERED, DAMAGED
    goods_condition = Column(String, nullable=False) # INTACT, DAMAGED
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
