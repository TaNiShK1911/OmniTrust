"""OmniTrust Backend — Negotiation Endpoints"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db import queries
from app.dependencies import AuthUser, DB
from app.services import negotiation_service

router = APIRouter(prefix="/api/v1/negotiations", tags=["negotiations"])


class StartNegotiationBody(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    buyer_message: str = ""


@router.post("", status_code=201)
def create_negotiation(body: StartNegotiationBody, db: DB, user: AuthUser):
    try:
        neg = negotiation_service.create_session(
            db,
            user_id=user.user_id,
            product_id=body.product_id,
            quantity=body.quantity,
            buyer_message=body.buyer_message,
            is_external_agent=(user.role == "agent-buyer"),
            spending_cap=getattr(user, "spending_cap", None),
        )
        return {"success": True, "data": neg, "error": None}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": str(exc)})


@router.get("/{session_id}")
def get_negotiation(session_id: str, db: DB, user: AuthUser):
    neg = queries.get_negotiation(db, session_id)
    return {"success": True, "data": neg, "error": None}


@router.get("/{session_id}/turns")
def get_turns(session_id: str, db: DB, user: AuthUser):
    neg = queries.get_negotiation(db, session_id)
    turns = neg.get("turns") or []
    return {"success": True, "data": {"session_id": session_id, "turns": turns}, "error": None}


@router.post("/{session_id}/next-turn")
def next_turn(session_id: str, db: DB, user: AuthUser):
    try:
        result = negotiation_service.run_next_turn(
            db,
            session_id=session_id,
            user_id=user.user_id,
            is_external_agent=(user.role == "agent-buyer"),
            spending_cap=getattr(user, "spending_cap", None),
        )
        return {"success": True, "data": result, "error": None}
    except ValueError as exc:
        code = "NEGOTIATION_LIMIT_REACHED" if "budget" in str(exc) else "NEGOTIATION_ERROR"
        raise HTTPException(
            status_code=409 if "budget" in str(exc) else 422,
            detail={"code": code, "message": str(exc)},
        )


@router.post("/{session_id}/approve")
def approve_negotiation(session_id: str, db: DB, user: AuthUser):
    try:
        result = negotiation_service.approve_session(
            db,
            session_id=session_id,
            user_id=user.user_id,
            is_external_agent=(user.role == "agent-buyer"),
            spending_cap=getattr(user, "spending_cap", None),
        )
        return {"success": True, "data": result, "error": None}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "APPROVAL_ERROR", "message": str(exc)})


@router.post("/{session_id}/cancel")
def cancel_negotiation(session_id: str, db: DB, user: AuthUser):
    try:
        result = negotiation_service.cancel_session(
            db, session_id=session_id, user_id=user.user_id
        )
        return {"success": True, "data": result, "error": None}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "CANCEL_ERROR", "message": str(exc)})
