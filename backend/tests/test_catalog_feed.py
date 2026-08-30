"""
OmniTrust Backend — Unit Tests: Catalog Agent Feed
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.supabase import get_supabase_admin
from app.db import queries

client = TestClient(app)

def test_catalog_manifest():
    response = client.get("/api/v1/catalog/agent-feed/manifest")
    assert response.status_code == 200
    data = response.json()
    assert data["@type"] == "WebAPI"
    assert "endpoints" in data


def test_catalog_feed_format_and_privacy():
    db = get_supabase_admin()
    
    # Create a couple of mock products just to be sure there's data
    try:
        queries.create_product(db, {
            "sku": "TEST-SKU-AGENT-1",
            "name": "Agent Test Product 1",
            "list_price": 1000,
            "price_floor": 800,
            "stock": 10,
        })
        queries.create_product(db, {
            "sku": "TEST-SKU-AGENT-2",
            "name": "Agent Test Product 2",
            "list_price": 2000,
            "price_floor": 1500,
            "stock": 0,
        })
    except Exception:
        pass # Ignore if they exist

    response = client.get("/api/v1/catalog/agent-feed")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    feed = data["data"]
    assert len(feed) > 0
    
    for item in feed:
        assert item["@type"] == "Product"
        assert "sku" in item
        assert "offers" in item
        
        offer = item["offers"]
        assert offer["@type"] == "Offer"
        assert "price" in offer
        assert "price_floor" not in offer
        assert "price_floor" not in item
        assert offer["negotiable"] is True
        
        if item["sku"] == "TEST-SKU-AGENT-1":
            assert offer["availability"] == "https://schema.org/InStock"
        if item["sku"] == "TEST-SKU-AGENT-2":
            assert offer["availability"] == "https://schema.org/OutOfStock"
