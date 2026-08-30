"""OmniTrust Backend — Metrics Endpoints"""
from fastapi import APIRouter

from app.db import queries
from app.dependencies import AuthUser, DB

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


@router.get("/kpi")
def get_kpis(db: DB, user: AuthUser):
    # In a real system, you would check role-based access here (e.g. user.role == "admin").
    # For OmniTrust MVP, we allow any authenticated user to view the dashboard metrics.
    metrics = queries.get_kpi_metrics(db)
    return {"success": True, "data": metrics, "error": None}
