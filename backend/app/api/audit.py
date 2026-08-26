"""OmniTrust Backend — Audit Log Endpoints"""
from fastapi import APIRouter, Query

from app.db import queries
from app.dependencies import AuthUser, DB

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/logs")
def list_audit_logs(
    db: DB,
    user: AuthUser,
    order_id: str | None = Query(None),
    negotiation_id: str | None = Query(None),
    event_type: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    cursor: str | None = Query(None),
):
    events = queries.list_audit_events(
        db,
        order_id=order_id,
        negotiation_id=negotiation_id,
        event_type=event_type,
        user_id=user.user_id,
        limit=limit,
        cursor=cursor,
    )
    return {"success": True, "data": events, "error": None}


@router.get("/logs/{event_id}")
def get_audit_log(event_id: str, db: DB, user: AuthUser):
    event = queries.get_audit_event(db, event_id)
    return {"success": True, "data": event, "error": None}
