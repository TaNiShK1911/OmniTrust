"""
OmniTrust Backend — Auth Endpoints

The frontend calls Supabase Auth directly for signup/login/logout.
These endpoints handle:
  - Profile lookup and creation
  - /me endpoint for the frontend's auth state
  - Demo login (dev only)
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.db import queries
from app.db.supabase import get_supabase_admin
from app.dependencies import AuthUser, DB

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class ProfileInput(BaseModel):
    full_name: str | None = None
    company: str | None = None
    role: str | None = None
    demo_scenario: str | None = None
    onboarding_completed: bool | None = None


@router.get("/me")
def get_me(user: AuthUser, db: DB):
    profile = queries.get_profile(db, user.user_id)
    return {
        "success": True,
        "data": {
            "user": {"id": user.user_id, "email": user.email},
            "profile": profile,
        },
        "error": None,
    }


@router.get("/profile")
def get_profile(user: AuthUser, db: DB):
    profile = queries.get_profile(db, user.user_id)
    return {"success": True, "data": profile, "error": None}


@router.post("/profile")
def upsert_profile(body: ProfileInput, user: AuthUser, db: DB):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    profile = queries.upsert_profile(db, user.user_id, fields)
    return {"success": True, "data": profile, "error": None}


@router.post("/logout")
def logout(user: AuthUser):
    """Server-side audit only — actual Supabase sign-out is done by the client."""
    return {"success": True, "data": {"logged_out": True}, "error": None}


@router.post("/demo-login")
def demo_login(db: DB):
    """
    Dev-only: return seeded demo credentials.
    Disabled outside development environments.
    """
    from app.config import get_settings
    settings = get_settings()
    if not settings.is_development:
        raise HTTPException(status_code=404, detail="Not found")

    admin = get_supabase_admin()
    DEMO_EMAIL = "demo@omnitrust.dev"
    DEMO_PASSWORD = "OmniTrust_Demo_2026!"

    try:
        result = admin.auth.admin.create_user({
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"full_name": "Demo Buyer", "role": "buyer"},
        })
        user_id = result.user.id if result.user else None
    except Exception:
        # Already exists — list and find
        list_result = admin.auth.admin.list_users()
        existing = next(
            (u for u in (list_result or []) if getattr(u, "email", "") == DEMO_EMAIL),
            None,
        )
        user_id = existing.id if existing else None
        if user_id:
            admin.auth.admin.update_user_by_id(
                user_id, {"password": DEMO_PASSWORD, "email_confirm": True}
            )

    return {
        "success": True,
        "data": {"email": DEMO_EMAIL, "password": DEMO_PASSWORD, "user_id": user_id},
        "error": None,
    }
