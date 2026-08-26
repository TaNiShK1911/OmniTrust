def test_create_shipment(client):
    response = client.post(
        "/api/v1/create_shipment",
        json={"order_id": "ORD-123", "item_count": 5}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["omnitrust_order_id"] == "ORD-123"
    assert data["item_count"] == 5
    assert data["carrier_status"] == "IN_TRANSIT"
    assert data["goods_condition"] == "INTACT"
    assert "tracking_id" in data

def test_list_shipments(client):
    client.post("/api/v1/create_shipment", json={"order_id": "ORD-1", "item_count": 1})
    client.post("/api/v1/create_shipment", json={"order_id": "ORD-2", "item_count": 2})

    response = client.get("/api/v1/shipments")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

def test_get_shipment(client):
    create_res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-3", "item_count": 3})
    tracking_id = create_res.json()["tracking_id"]

    response = client.get(f"/api/v1/shipments/{tracking_id}")
    assert response.status_code == 200
    assert response.json()["tracking_id"] == tracking_id

def test_get_nonexistent_shipment(client):
    response = client.get("/api/v1/shipments/NOT-REAL")
    assert response.status_code == 404
    assert response.json()["error"] == "SHIPMENT_NOT_FOUND"
