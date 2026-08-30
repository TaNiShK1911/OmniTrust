"""
OmniTrust Backend — Unit Tests: External Agent Flow
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.supabase import get_supabase_admin
from app.db import queries

client = TestClient(app)

def test_external_agent_flow():
    db = get_supabase_admin()
    
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
