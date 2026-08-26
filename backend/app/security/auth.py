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
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": True},
        )
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise ValueError("JWT missing sub claim")
        return payload
    except ExpiredSignatureError:
        raise ValueError("Token has expired")
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc


def extract_user_id(token: str) -> str:
    """Convenience wrapper — returns only the user UUID from the JWT."""
    payload = verify_supabase_jwt(token)
    return payload["sub"]
