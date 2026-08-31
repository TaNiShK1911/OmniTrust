from fastapi import APIRouter
from app.config import settings

router = APIRouter(tags=["health"])

@router.get("/")
@router.head("/")
@router.get("/health")
@router.head("/health")
def health_check():
    return {
        "status": "ok",
        "service": "mock-logistics",
        "version": "2.0.0",
        "port": settings.logistics_port,
    }
