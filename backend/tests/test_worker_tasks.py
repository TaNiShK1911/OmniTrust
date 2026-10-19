"""
Unit tests for OmniTrust Celery Background Worker Tasks
"""
from unittest.mock import MagicMock, patch
from app.worker.tasks import (
    ping_worker_task,
    dispatch_audit_telemetry_task,
    process_settlement_capture_task,
)


def test_ping_worker_task():
    """Verify worker health ping task executes deterministically."""
    result = ping_worker_task.apply()
    assert result.successful()
    data = result.result
    assert data["status"] == "healthy"
    assert "timestamp" in data


def test_dispatch_audit_telemetry_task_sanitization():
    """Verify background telemetry task strips sensitive credential keys."""
    details = {
        "score": 95.4,
        "api_key": "secret-token-should-be-stripped",
        "client_secret": "paypal-secret-value",
        "buyer_bid": 450.0,
    }
    result = dispatch_audit_telemetry_task.apply(
        args=["order-123", "consensus_reached", "buyer_agent", details]
    )
    assert result.successful()
    data = result.result
    assert data["success"] is True
    assert data["order_id"] == "order-123"
    assert "score" in data["details_keys"]
    assert "buyer_bid" in data["details_keys"]
    # Secrets stripped from details keys
    assert "api_key" not in data["details_keys"]
    assert "client_secret" not in data["details_keys"]


@patch("app.db.supabase.get_supabase_admin")
@patch("app.services.payment_service.get_payment_status")
def test_process_settlement_capture_idempotent_when_already_settled(mock_get_status, mock_get_admin):
    """Verify settlement task does not re-execute if already CAPTURED_AND_SETTLED."""
    mock_get_admin.return_value = MagicMock()
    mock_get_status.return_value = {
        "order_id": "order-already-settled",
        "state": "CAPTURED_AND_SETTLED",
        "amount": "500.00",
        "currency": "USD",
    }

    result = process_settlement_capture_task.apply(args=["order-already-settled"])
    assert result.successful()
    data = result.result
    assert data["already_settled"] is True
    assert data["state"] == "CAPTURED_AND_SETTLED"


@patch("app.db.supabase.get_supabase_admin")
@patch("app.services.settlement_service.settle_order")
@patch("app.services.payment_service.get_payment_status")
def test_process_settlement_capture_invokes_release_gate(mock_get_status, mock_settle, mock_get_admin):
    """Verify settlement task delegates to deterministic settle_order gatekeeper."""
    mock_get_admin.return_value = MagicMock()
    mock_get_status.return_value = {
        "order_id": "order-needs-settlement",
        "state": "FUNDS_AUTHORIZED",
        "amount": "500.00",
        "currency": "USD",
    }
    mock_settle.return_value = {
        "ok": True,
        "state": "CAPTURED_AND_SETTLED",
        "message": "Settlement completed via PayPal capture",
    }

    result = process_settlement_capture_task.apply(args=["order-needs-settlement"])
    assert result.successful()
    data = result.result
    assert data["settled"] is True
    assert data["state"] == "CAPTURED_AND_SETTLED"
