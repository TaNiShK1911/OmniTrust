"""
OmniTrust & Mock Logistics — Full End-to-End Integration Verification Script
Tests the complete lifecycle:
  Product -> Negotiation -> Gatekeeper -> Order -> Escrow ->
  Mock Logistics Dispatch -> Webhook Delivery -> Signature Verification ->
  Settlement -> Audit Trail
"""
import uuid
import httpx
import pytest

from app.db.supabase import get_supabase_admin
from app.db import queries
from app.services import negotiation_service, escrow_service, shipment_service
from app.services.gatekeeper import run_negotiation_checks, run_settlement_checks, run_refund_checks
from app.integrations.razorpay_client import payment_provider


def _create_test_auth_user(db, role="buyer"):
    email = f"e2e_{role}_{uuid.uuid4().hex[:8]}@omnitrust.local"
    user_res = db.auth.admin.create_user({
        "email": email,
        "password": "Password123!",
        "email_confirm": True,
        "user_metadata": {
            "full_name": f"E2E {role.capitalize()}",
            "company": "Omni Corp",
            "role": role,
        }
    })
    return str(user_res.user.id)


def test_end_to_end_delivery_lifecycle():
    db = get_supabase_admin()
    test_user_id = _create_test_auth_user(db, "buyer")
    
    # 2. Get a product
    products = queries.list_products(db, limit=1)
    assert len(products) > 0
    product = products[0]
    
    # 3. Start Negotiation
    quantity = 10
    buyer_target = float(product["list_price"]) * 0.95
    if buyer_target < float(product["price_floor"]):
        buyer_target = float(product["price_floor"])
        
    session = negotiation_service.create_session(
        db,
        user_id=test_user_id,
        product_id=product["id"],
        quantity=quantity,
        buyer_message="Can we get 5% bulk discount?",
    )
    assert session["status"] == "active"
    
    # 4. Negotiate via service & gatekeeper
    session_id = session["id"]
    agreed_price = float(product["list_price"]) * 0.98
    
    # Verify gatekeeper rules directly
    gk_res = run_negotiation_checks(
        action="PROPOSE",
        unit_price=agreed_price,
        quantity=quantity,
        turn=1,
        session_status="active",
        price_floor=float(product["price_floor"]),
        list_price=float(product["list_price"]),
        stock=int(product["stock"]),
        max_turns=4,
        max_order_inr=500_000,
    )
    assert gk_res.passed is True
    
    # Update negotiation to agreed
    queries.update_negotiation(db, session_id, {
        "status": "agreed",
        "agreed_unit_price": agreed_price,
        "turn_count": 2,
    })
    
    # 5. Create Order
    total_amount = agreed_price * quantity
    order = queries.create_order(db, {
        "user_id": test_user_id,
        "negotiation_id": session_id,
        "product_id": product["id"],
        "product_name": product["name"],
        "quantity": quantity,
        "unit_price": agreed_price,
        "total_amount": total_amount,
        "currency": "INR",
        "status": "escrow_pending",
        "escrow_status": "none",
    })
    order_id = order["id"]
    assert order["status"] == "escrow_pending"
    
    # 6. Fund Escrow (Razorpay Test Mode abstraction)
    funded_order = escrow_service.create_escrow(db, order_id=order_id, user_id=test_user_id)
    assert funded_order["escrow_status"] == "held"
    assert funded_order["status"] == "escrow_held"
    
    # 7. Dispatch Shipment to Mock Logistics (:5001)
    shipment = shipment_service.register_shipment(db, order_id=order_id, user_id=test_user_id)
    tracking_id = shipment["tracking_id"]
    assert tracking_id.startswith("OMNI-TRK-")
    assert shipment["status"] == "in_transit"
    
    # 8. Verify shipment exists at Mock Logistics (:5001)
    with httpx.Client(timeout=20.0) as client:
        logistics_res = client.get(f"http://localhost:5001/api/v1/shipments/{tracking_id}")
        assert logistics_res.status_code == 200
        assert logistics_res.json()["carrier_status"] == "IN_TRANSIT"
        
        # 9. Trigger Delivery at Mock Logistics -> Emits HMAC signed webhook to :8000/api/webhooks/logistics
        deliver_res = client.post(f"http://localhost:5001/api/v1/shipments/{tracking_id}/deliver")
        assert deliver_res.status_code == 200
        assert deliver_res.json()["carrier_status"] == "DELIVERED"
        
        # Check webhook events in Mock Logistics
        events_res = client.get(f"http://localhost:5001/api/v1/shipments/{tracking_id}/events")
        assert events_res.status_code == 200
        events = events_res.json()
        assert len(events) >= 1
        assert events[0]["delivery_status"] == "SENT"
        assert events[0]["response_code"] == 200
        
    # 10. Verify OmniTrust State after Webhook Execution
    updated_order = queries.get_order(db, order_id)
    assert updated_order["status"] in ("delivered", "settled")
    assert updated_order["escrow_status"] == "released"
    assert updated_order["settlement_ref"] is not None
    
    updated_shipment = queries.get_shipment_by_tracking(db, tracking_id)
    assert updated_shipment["status"] == "delivered"
    assert updated_shipment["condition"] == "intact"
    
    # 11. Verify Audit Trail is populated
    audit_events = queries.list_audit_events(db, order_id=order_id)
    assert len(audit_events) >= 3
    event_types = [e["event_type"] for e in audit_events]
    assert "webhook.verified" in event_types or "shipment.delivered" in event_types
    assert "settlement.completed" in event_types


def test_end_to_end_damage_and_dispute_lifecycle():
    db = get_supabase_admin()
    test_user_id = _create_test_auth_user(db, "buyer")
    
    # 2. Get product
    products = queries.list_products(db, limit=1)
    product = products[0]
    unit_price = float(product["list_price"])
    quantity = 5
    total_amount = unit_price * quantity
    
    # 3. Create Funded Order directly
    order = queries.create_order(db, {
        "user_id": test_user_id,
        "product_id": product["id"],
        "product_name": product["name"],
        "quantity": quantity,
        "unit_price": unit_price,
        "total_amount": total_amount,
        "currency": "INR",
        "status": "escrow_funded",
        "escrow_status": "held",
        "escrow_ref": f"pay_test_{uuid.uuid4().hex[:8]}",
    })
    order_id = order["id"]
    
    # 4. Dispatch Shipment to Mock Logistics (:5001)
    shipment = shipment_service.register_shipment(db, order_id=order_id, user_id=test_user_id)
    tracking_id = shipment["tracking_id"]
    
    # 5. Trigger Damage in Mock Logistics
    with httpx.Client(timeout=20.0) as client:
        damage_res = client.post(
            f"http://localhost:5001/api/v1/shipments/{tracking_id}/damage",
            json={"damage_reason": "Container dropped during unloader handling"}
        )
        assert damage_res.status_code == 200
        assert damage_res.json()["carrier_status"] == "DAMAGED"
        assert damage_res.json()["goods_condition"] == "DAMAGED"
        
        # Check webhook event
        events_res = client.get(f"http://localhost:5001/api/v1/shipments/{tracking_id}/events")
        assert events_res.status_code == 200
        events = events_res.json()
        assert len(events) >= 1
        assert events[0]["delivery_status"] == "SENT"
        assert events[0]["response_code"] == 200
        
    # 6. Verify Dispute Created in OmniTrust
    updated_order = queries.get_order(db, order_id)
    assert updated_order["status"] == "disputed"
    
    disputes = queries.list_disputes_for_order(db, order_id)
    assert len(disputes) >= 1
    dispute = disputes[0]
    assert dispute["status"] == "open"
    assert dispute["reason"] == "DAMAGED_GOODS"
    
    # 7. Adjudicate via Dispute Service (Arbitrator Agent + Refund Gatekeeper)
    from app.services import dispute_service
    arbitrated_dispute = dispute_service.run_arbitration(
        db,
        dispute_id=dispute["id"],
        user_id=test_user_id,
    )
    assert arbitrated_dispute["status"] == "arbitrated"
    assert arbitrated_dispute["refund_amount"] > 0
    
    refund_res = dispute_service.execute_refund(
        db,
        dispute_id=dispute["id"],
        user_id=test_user_id,
    )
    assert refund_res["ok"] is True
    resolved_dispute = refund_res["dispute"]
    assert resolved_dispute["refund_ref"] is not None
    
    # 8. Check refund status on order
    final_order = queries.get_order(db, order_id)
    assert final_order["status"] in ("refunded", "disputed")
    assert final_order["refund_ref"] is not None

