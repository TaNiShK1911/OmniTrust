def test_validation_empty_order_id(client):
    response = client.post(
        "/api/v1/create_shipment",
        json={"order_id": "", "item_count": 5}
    )
    assert response.status_code == 422

def test_validation_zero_items(client):
    response = client.post(
        "/api/v1/create_shipment",
        json={"order_id": "ORD-123", "item_count": 0}
    )
    assert response.status_code == 422

def test_validation_negative_items(client):
    response = client.post(
        "/api/v1/create_shipment",
        json={"order_id": "ORD-123", "item_count": -5}
    )
    assert response.status_code == 422
