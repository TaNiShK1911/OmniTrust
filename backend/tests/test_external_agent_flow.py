"""
OmniTrust Backend — Unit Tests: External Agent Flow
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.supabase import get_supabase_admin
from app.db import queries

client = TestClient(app)

def test_external_agent_flow(mocker):
    # Mock DB client fetching
    mock_db = mocker.MagicMock()
    mocker.patch("app.db.supabase.get_supabase_admin", return_value=mock_db)
    mocker.patch("app.dependencies.db_dep", return_value=mock_db)

    # Mock queries
    mocker.patch(
        "app.db.queries.list_products",
        return_value=[{"id": "prod-1", "sku": "TEST-SKU", "list_price": 1000, "stock": 10}]
    )
    mocker.patch(
        "app.db.queries.get_product",
        return_value={"id": "prod-1", "sku": "TEST-SKU", "name": "Test", "list_price": 1000, "stock": 10}
    )
    mocker.patch(
        "app.db.queries.create_negotiation",
        return_value={"id": "neg-1"}
    )
    
    # We need to capture what is logged to assert on it
    log_events = []
    def mock_insert_audit_event(db, fields):
        log_events.append(fields)
        return fields
    mocker.patch("app.services.audit_service.queries.insert_audit_event", side_effect=mock_insert_audit_event)
    
    mocker.patch(
        "app.db.queries.list_audit_events",
        side_effect=lambda db, **kwargs: log_events
    )

    db = mock_db
    
    # Override AuthUser dependency so we get our agent-buyer
    from app.dependencies import get_current_user, CurrentUser
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id="test-agent-1", email="agent@test.local", role="agent-buyer", spending_cap=50000.0
    )
    
    # 1. Ensure we have a product
    products = queries.list_products(db, limit=1)
    assert len(products) > 0
    product = products[0]

    # 2. Register
    reg_resp = client.post("/api/v1/agents/register", json={
        "agent_name": "TestExternalBot",
        "spending_cap": 50000.0
    })
    assert reg_resp.status_code == 200
    token = reg_resp.json()["data"]["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Create Negotiation
    neg_resp = client.post("/api/v1/negotiations", headers=headers, json={
        "product_id": product["id"],
        "quantity": 2,
        "buyer_message": "Hello"
    })
    assert neg_resp.status_code == 201
    session_id = neg_resp.json()["data"]["id"]

    # 4. Check audit log for correct actor and spending cap
    events = queries.list_audit_events(db, negotiation_id=session_id)
    open_events = [e for e in events if e["event_type"] == "negotiation.opened"]
    assert len(open_events) == 1
    
    event = open_events[0]
    assert event["actor"] == "External AI Agent"
    assert "spending_cap" in event["payload"]
    assert event["payload"]["spending_cap"] == 50000.0

    app.dependency_overrides.clear()
