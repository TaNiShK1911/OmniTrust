"""OmniTrust Backend — External Agent Endpoints"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.security.auth import create_agent_token

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


class AgentRegisterRequest(BaseModel):
    agent_name: str
    spending_cap: float = Field(gt=0, description="Max amount this agent is allowed to spend in INR")


@router.post("/register")
def register_external_agent(body: AgentRegisterRequest):
    """
    Mock identity/mandate step for an external AI agent.
    Issues a short-lived token scoped to "agent-buyer".
    """
    token = create_agent_token(body.agent_name, body.spending_cap)
    return {
        "success": True,
        "data": {
            "token": token,
            "role": "agent-buyer",
            "spending_cap": body.spending_cap
        },
        "error": None
    }
