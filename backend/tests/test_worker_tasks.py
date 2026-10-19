"""
Unit tests for OmniTrust Celery Background Worker Tasks
"""
from unittest.mock import MagicMock, patch
import pytest
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


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.check_audit_event_exists")
@patch("app.db.queries.insert_audit_event")
def test_dispatch_audit_telemetry_task_persistence(mock_insert, mock_exists, mock_get_admin):
    """Verify background telemetry task actually persists sanitized record to database."""
    mock_get_admin.return_value = MagicMock()
    mock_exists.return_value = False
    mock_insert.return_value = {"id": "audit-row-123"}

    details = {
        "score": 98.2,
        "buyer_bid": 120.0,
        "seller_counteroffer": 130.0,
        "api_key": "sensitive-token-secret",
        "client_secret": "paypal-secret-value",
    }
    result = dispatch_audit_telemetry_task.apply(
        args=["order-123", "agent_consensus.telemetry", "Seller Agent", details],
        kwargs={"request_id": "req-telemetry-001", "user_id": "user-456"}
    )
    assert result.successful()
    data = result.result
    assert data["success"] is True
    assert data["persisted_id"] == "audit-row-123"
    assert "score" in data["details_keys"]
    assert "buyer_bid" in data["details_keys"]
    # Verify sensitive keys are stripped
    assert "api_key" not in data["details_keys"]
    assert "client_secret" not in data["details_keys"]

    # Verify queries.insert_audit_event was invoked with correct sanitized payload
    mock_insert.assert_called_once()
    called_record = mock_insert.call_args[0][1]
    assert called_record["order_id"] == "order-123"
    assert called_record["actor"] == "Seller Agent"
    assert called_record["event_type"] == "agent_consensus.telemetry"
    assert "api_key" not in called_record["payload"]
    assert "client_secret" not in called_record["payload"]
    assert called_record["payload"]["score"] == 98.2


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.check_audit_event_exists")
@patch("app.db.queries.insert_audit_event")
def test_dispatch_audit_telemetry_task_idempotency_duplicate_suppressed(mock_insert, mock_exists, mock_get_admin):
    """Verify duplicate task delivery does not insert duplicate audit records."""
    mock_get_admin.return_value = MagicMock()
    mock_exists.return_value = True  # Already seen!

    result = dispatch_audit_telemetry_task.apply(
        args=["order-123", "agent_consensus.telemetry", "Seller Agent", {"score": 90.0}],
        kwargs={"request_id": "req-duplicate-001"}
    )
    assert result.successful()
    data = result.result
    assert data["success"] is True
    assert data["deduplicated"] is True
    assert data["request_id"] == "req-duplicate-001"
    # Ensure insert was NOT called on duplicate
    mock_insert.assert_not_called()


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.check_audit_event_exists")
@patch("app.db.queries.insert_audit_event")
def test_dispatch_audit_telemetry_task_persistence_failure_retries(mock_insert, mock_exists, mock_get_admin):
    """Verify DB insertion failure triggers Celery task retry failure."""
    mock_get_admin.return_value = MagicMock()
    mock_exists.return_value = False
    mock_insert.return_value = None  # DB write failed

    result = dispatch_audit_telemetry_task.apply(
        args=["order-123", "agent_consensus.telemetry", "Seller Agent", {"score": 90.0}],
        kwargs={"request_id": "req-fail-001"}
    )
    assert result.failed()
    assert isinstance(result.result, RuntimeError)
    assert "Database write returned no data" in str(result.result)


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.get_order")
@patch("app.db.payment_queries.get_payment_transaction_by_order_id")
def test_process_settlement_capture_idempotent_when_already_settled(mock_get_tx, mock_get_order, mock_get_admin):
    """Verify settlement task does not re-execute if already CAPTURED_AND_SETTLED."""
    mock_get_admin.return_value = MagicMock()
    mock_get_order.return_value = {
        "id": "order-already-settled",
        "user_id": "user-1",
        "status": "settled",
        "escrow_status": "released",
    }
    mock_get_tx.return_value = {
        "order_id": "order-already-settled",
        "state": "CAPTURED_AND_SETTLED",
    }

    result = process_settlement_capture_task.apply(args=["order-already-settled"])
    assert result.successful()
    data = result.result
    assert data["already_settled"] is True
    assert data["state"] == "CAPTURED_AND_SETTLED"


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.get_order")
@patch("app.db.payment_queries.get_payment_transaction_by_order_id")
@patch("app.services.settlement_service.settle_order")
def test_process_settlement_capture_invokes_release_gate(mock_settle, mock_get_tx, mock_get_order, mock_get_admin):
    """Verify settlement task validates authorization and delegates to settle_order gatekeeper."""
    mock_get_admin.return_value = MagicMock()
    mock_get_order.return_value = {
        "id": "order-needs-settlement",
        "user_id": "user-2",
        "status": "delivered",
        "escrow_status": "held",
        "escrow_ref": "AUTH-123456",
        "shipments": [{"status": "delivered"}],
    }
    mock_get_tx.return_value = {
        "order_id": "order-needs-settlement",
        "authorization_id": "AUTH-123456",
        "state": "FUNDS_AUTHORIZED",
    }
    mock_settle.return_value = {
        "ok": True,
        "state": "CAPTURED_AND_SETTLED",
        "capture_id": "CAP-789012",
        "message": "Settlement completed via PayPal capture",
    }

    result = process_settlement_capture_task.apply(args=["order-needs-settlement"])
    assert result.successful()
    data = result.result
    assert data["settled"] is True
    assert data["state"] == "CAPTURED_AND_SETTLED"
    assert data["capture_id"] == "CAP-789012"
    mock_settle.assert_called_once_with(mock_get_admin.return_value, order_id="order-needs-settlement", user_id="user-2")


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.get_order")
def test_process_settlement_capture_missing_order_fails(mock_get_order, mock_get_admin):
    """Verify settlement fails when order is not found."""
    mock_get_admin.return_value = MagicMock()
    mock_get_order.return_value = None

    result = process_settlement_capture_task.apply(args=["order-does-not-exist"])
    assert result.failed()
    assert isinstance(result.result, ValueError)
    assert "not found in database" in str(result.result)


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.get_order")
@patch("app.db.payment_queries.get_payment_transaction_by_order_id")
def test_process_settlement_capture_missing_auth_fails(mock_get_tx, mock_get_order, mock_get_admin):
    """Verify settlement fails when no uncaptured authorization exists."""
    mock_get_admin.return_value = MagicMock()
    mock_get_order.return_value = {
        "id": "order-no-auth",
        "user_id": "user-3",
        "status": "pending",
        "escrow_status": "none",
        "escrow_ref": None,
    }
    mock_get_tx.return_value = None

    result = process_settlement_capture_task.apply(args=["order-no-auth"])
    assert result.failed()
    assert isinstance(result.result, ValueError)
    assert "No authorization ID found" in str(result.result)


@patch("app.db.supabase.get_supabase_admin")
@patch("app.db.queries.get_order")
@patch("app.db.payment_queries.get_payment_transaction_by_order_id")
@patch("app.services.settlement_service.settle_order")
def test_process_settlement_capture_blocked_by_gate(mock_settle, mock_get_tx, mock_get_order, mock_get_admin):
    """Verify that if settlement gate rejects release, settled is False without false successes."""
    mock_get_admin.return_value = MagicMock()
    mock_get_order.return_value = {
        "id": "order-dispute-open",
        "user_id": "user-4",
        "status": "delivered",
        "escrow_status": "held",
        "escrow_ref": "AUTH-OPEN-DISPUTE",
    }
    mock_get_tx.return_value = {
        "order_id": "order-dispute-open",
        "authorization_id": "AUTH-OPEN-DISPUTE",
        "state": "FUNDS_AUTHORIZED",
    }
    mock_settle.return_value = {
        "ok": False,
        "state": "FUNDS_AUTHORIZED",
        "message": "Settlement gate conditions not satisfied: open dispute exists",
        "checks": {"dispute_open": True, "shipment_delivered": True},
    }

    result = process_settlement_capture_task.apply(args=["order-dispute-open"])
    assert result.successful()
    data = result.result
    assert data["settled"] is False
    assert data["blocked"] is True
    assert "open dispute exists" in data["message"]
