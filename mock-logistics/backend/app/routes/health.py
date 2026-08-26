from fastapi import APIRouter
from app.config import settings

router = APIRouter(tags=["health"])

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "mock-logistics", "port": settings.logistics_port}
