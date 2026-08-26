"""
OmniTrust Backend — FastAPI Application Factory

Wires together all routers, middleware, and startup checks.
"""
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import audit, auth, disputes, escrow, health, negotiation, orders, products, shipments, webhooks
from app.config import get_settings

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(
        title="OmniTrust API",
        description="AI-native B2B buyer/seller settlement backend — Razorpay Buildathon 2026",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin, "http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request ID + timing middleware ────────────────────────────────────────
    @app.middleware("http")
    async def add_request_metadata(request: Request, call_next):
        request_id = f"req_{uuid.uuid4().hex[:12]}"
        request.state.request_id = request_id
        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        return response

    # ── Global exception handler ──────────────────────────────────────────────
    @app.exception_handler(RuntimeError)
    async def runtime_error_handler(request: Request, exc: RuntimeError):
        request_id = getattr(request.state, "request_id", "unknown")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "data": None,
                "error": {"code": "INTERNAL_ERROR", "message": str(exc)},
                "request_id": request_id,
            },
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(products.router)
    app.include_router(negotiation.router)
    app.include_router(orders.router)
    app.include_router(escrow.router)
    app.include_router(shipments.router)
    app.include_router(disputes.router)
    app.include_router(audit.router)
    app.include_router(webhooks.router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    port = settings.api_port
    print(f"OmniTrust Backend starting on http://localhost:{port}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=settings.is_development)
