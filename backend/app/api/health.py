"""
OmniTrust Backend — Health & Dependency Check Endpoints
"""
import httpx
from fastapi import APIRouter

from app.config import get_settings
from app.db.supabase import check_supabase_health
from app.integrations.logistics_client import check_logistics_health

router = APIRouter(tags=["health"])


@router.get("/")
@router.head("/")
@router.get("/health")
@router.head("/health")
@router.get("/api/health")
@router.head("/api/health")
async def health():
    settings = get_settings()
    return {
        "success": True,
        "data": {
            "service": "OmniTrust API",
            "status": "ok",
            "version": "1.0.0",
            "environment": settings.app_env,
        },
        "error": None,
    }


@router.get("/api/health/dependencies")
async def dependency_health():
    settings = get_settings()
    checks = []

    # Supabase
    sb = await check_supabase_health()
    checks.append({"name": "supabase", **sb})

    # Groq
    groq_ok = settings.groq_configured
    checks.append({
        "name": "groq",
        "ok": groq_ok,
        "detail": f"Model: {settings.groq_model}" if groq_ok else "GROQ_API_KEY missing — deterministic fallback active",
    })

    # Razorpay
    rz_ok = settings.razorpay_configured
    checks.append({
        "name": "razorpay",
        "ok": rz_ok,
        "detail": "Test mode credentials present" if rz_ok else "Credentials missing — simulation mode",
    })

    # Mock Logistics
    logi = check_logistics_health()
    checks.append({"name": "mock_logistics", **logi})

    # Webhook secret
    wh_ok = bool(settings.logistics_webhook_secret)
    checks.append({
        "name": "webhook_signing",
        "ok": wh_ok,
        "detail": "HMAC-SHA256 configured" if wh_ok else "Webhook secret missing",
    })

    all_ok = all(c["ok"] for c in checks)
    return {
        "success": True,
        "data": {"all_healthy": all_ok, "checks": checks},
        "error": None,
    }
