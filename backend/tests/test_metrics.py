"""
OmniTrust Backend — Unit Tests: Metrics
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_get_kpis():
    from app.security.auth import create_agent_token
    token = create_agent_token("TestMetricsUser", 1000)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = client.get("/api/v1/metrics/kpi", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    
    assert "total_gmv" in data
    assert "units_sold" in data
    assert "total_negotiations" in data
    assert "ai_win_rate_pct" in data
