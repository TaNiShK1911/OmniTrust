"""Regression tests for request authentication and service-role ownership boundaries."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.db import queries
from app.dependencies import get_current_user
from app.security import auth


def test_missing_or_invalid_bearer_token_is_rejected_in_development(mocker):
    """Development must not silently become a fixed demo user."""
    with pytest.raises(HTTPException) as missing:
        get_current_user(None)
    assert missing.value.status_code == 401

    mocker.patch("app.dependencies.verify_supabase_jwt", side_effect=ValueError("invalid"))
    with pytest.raises(HTTPException) as invalid:
        get_current_user("Bearer invalid-token")
    assert invalid.value.status_code == 401


def test_raw_supabase_keys_are_not_accepted_as_bearer_tokens(mocker):
    settings = SimpleNamespace(
        supabase_jwt_secret="test-jwt-secret-at-least-32-chars-long!!",
        supabase_anon_key="raw-anon-key",
        supabase_service_role_key="raw-service-role-key",
    )
    mocker.patch("app.security.auth.get_settings", return_value=settings)
    mocker.patch(
        "app.db.supabase.get_supabase_admin",
        return_value=SimpleNamespace(auth=SimpleNamespace(get_user=lambda _token: None)),
    )

    for raw_key in (settings.supabase_anon_key, settings.supabase_service_role_key):
        with pytest.raises(ValueError):
            auth.verify_supabase_jwt(raw_key)


def test_owner_scoped_order_lookup_rejects_another_user(mocker):
    mocker.patch("app.db.queries.get_order", return_value={"id": "order-1", "user_id": "owner"})
    assert queries.get_order_for_user(object(), "order-1", "owner")["id"] == "order-1"
    with pytest.raises(PermissionError):
        queries.get_order_for_user(object(), "order-1", "other-user")
