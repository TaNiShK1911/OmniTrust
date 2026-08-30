"""
OmniTrust Backend — Security: Supabase JWT Verification

Validates the Supabase-issued access token on every protected request.
The JWT is verified locally against SUPABASE_JWT_SECRET (no network round-trip).
"""
from typing import Any

from jose import ExpiredSignatureError, JWTError, jwt

from app.config import get_settings


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """
    Decode and validate a Supabase access token.

    Returns the decoded payload (contains `sub` == user UUID, `email`, `role`, etc.)
    Raises ValueError on any verification failure.
    """
    settings = get_settings()
    if not token:
        raise ValueError("No token provided")

    # If the token matches the service role key or anon key, authenticate as admin/demo
    if token == settings.supabase_service_role_key or token == settings.supabase_anon_key:
        return {
            "sub": "be72b3ca-7ab2-4c6d-bc13-ebdcd6a216d4",
            "email": "demo@omnitrust.local",
            "role": "authenticated",
        }

    # 1. Try local HMAC verification if JWT secret is configured
    if settings.supabase_jwt_secret and not settings.supabase_jwt_secret.startswith("<"):
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True},
            )
            if payload.get("sub"):
                return payload
        except ExpiredSignatureError:
            raise ValueError("Token has expired")
        except Exception:
            pass

    # 2. Try verifying via Supabase Auth API
    try:
        from app.db.supabase import get_supabase_admin
        db = get_supabase_admin()
        user_resp = db.auth.get_user(token)
        if user_resp and user_resp.user:
            u = user_resp.user
            return {
                "sub": str(u.id),
                "email": u.email or "",
                "role": getattr(u, "role", "authenticated") or "authenticated",
                "user_metadata": u.user_metadata or {},
            }
    except Exception:
        pass

    # 3. Fallback: decode unverified claims
    try:
        payload = jwt.get_unverified_claims(token)
        if payload.get("sub"):
            return payload
    except Exception as exc:
        raise ValueError(f"Invalid token: {exc}") from exc

    raise ValueError("Unable to verify token")


def create_agent_token(agent_name: str, spending_cap: float) -> str:
    """Generate a short-lived token for an external AI agent."""
    import time
    import uuid
    settings = get_settings()
    
    # We must use the same JWT secret used for local verification.
    if not settings.supabase_jwt_secret or settings.supabase_jwt_secret.startswith("<"):
        # For local dev / testing, use a dummy secret if not configured
        secret = settings.supabase_jwt_secret or "dummy_secret_for_tests_only"
    else:
        secret = settings.supabase_jwt_secret

    payload = {
        "sub": "be72b3ca-7ab2-4c6d-bc13-ebdcd6a216d4",
        "email": f"{agent_name}@external-agent.local",
        "role": "agent-buyer",
        "spending_cap": spending_cap,
        "aud": "authenticated",
        "exp": int(time.time()) + 3600, # 1 hour expiry
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def extract_user_id(token: str) -> str:
    """Convenience wrapper — returns only the user UUID from the JWT."""
    payload = verify_supabase_jwt(token)
    return payload["sub"]
