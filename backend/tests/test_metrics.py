"""
OmniTrust Backend — Unit Tests: Metrics
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_get_kpis(mocker):
    mocker.patch(
        "app.db.queries.get_kpi_metrics",
        return_value={
            "total_gmv": 1000.0,
            "units_sold": 10,
            "total_negotiations": 5,
            "ai_win_rate_pct": 50.0,
        }
    )
    # Mock DB client to avoid any connect attempts
    mocker.patch("app.dependencies.db_dep", return_value=mocker.MagicMock())
    
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
