"""
OmniTrust Backend — FastAPI Request Dependencies

Provides injectable FastAPI dependencies for:
  - Supabase admin client (service role)
  - Current authenticated user (from Supabase JWT)
"""
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from supabase import Client

from app.db.supabase import get_supabase_admin
from app.security.auth import verify_supabase_jwt


# ── Supabase admin DB ─────────────────────────────────────────────────────────


def db_dep() -> Client:
    """Inject the service-role Supabase client."""
    return get_supabase_admin()


DB = Annotated[Client, Depends(db_dep)]


# ── Authenticated user ────────────────────────────────────────────────────────


class CurrentUser:
    __slots__ = ("user_id", "email", "role")

    def __init__(self, user_id: str, email: str, role: str) -> None:
        self.user_id = user_id
        self.email = email
        self.role = role


def get_current_user(
    authorization: Annotated[str | None, Header(alias="authorization")] = None,
) -> CurrentUser:
    """
    Extract and validate the Supabase Bearer token from the Authorization header.
    Raises 401 on any verification failure.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_TOKEN", "message": "Authorization header required"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = verify_supabase_jwt(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": str(exc)},
        ) from exc

    return CurrentUser(
        user_id=payload["sub"],
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
    )


AuthUser = Annotated[CurrentUser, Depends(get_current_user)]


def get_optional_current_user(
    authorization: Annotated[str | None, Header(alias="authorization")] = None,
) -> CurrentUser | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = verify_supabase_jwt(token)
        return CurrentUser(
            user_id=payload["sub"],
            email=payload.get("email", ""),
            role=payload.get("role", "authenticated"),
        )
    except Exception:
        return None


OptionalAuthUser = Annotated[CurrentUser | None, Depends(get_optional_current_user)]
