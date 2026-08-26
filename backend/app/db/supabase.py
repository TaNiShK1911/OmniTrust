"""
OmniTrust Backend — Supabase Client Initialization

Provides the service-role Supabase client (bypasses RLS for server-side
operations) and a health check helper.
"""
from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase_admin() -> Client:
    """
    Returns a singleton Supabase client authenticated with the service role key.
    This client bypasses RLS and should NEVER be exposed to frontend code.
    """
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


async def check_supabase_health() -> dict:
    """
    Probe Supabase connectivity by running a lightweight count query.
    Returns {"ok": bool, "detail": str}.
    """
    try:
        db = get_supabase_admin()
        result = db.table("products").select("id", count="exact").limit(1).execute()
        return {"ok": True, "detail": f"Reachable — {result.count} products in catalog"}
    except Exception as exc:
        return {"ok": False, "detail": str(exc)}
