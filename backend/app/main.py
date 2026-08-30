"""
OmniTrust Backend — FastAPI Application Factory

Wires together all routers, middleware, and startup checks.
"""
import time
import uuid

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import agents, audit, auth, catalog, disputes, escrow, health, metrics, negotiation, orders, products, shipments, webhooks
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
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.onrender\.com)(:\d+)?",
        allow_origins=[settings.frontend_origin] if settings.frontend_origin else [],
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

    # ── Global exception handlers ─────────────────────────────────────────────
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = getattr(request.state, "request_id", "unknown")
        if isinstance(exc.detail, dict):
            code = exc.detail.get("code", "HTTP_ERROR")
            message = exc.detail.get("message", str(exc.detail))
        else:
            code = "HTTP_ERROR"
            message = str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "data": None,
                "error": {"code": code, "message": message},
                "request_id": request_id,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", "unknown")
        errors = exc.errors()
        message = errors[0].get("msg", "Validation error") if errors else "Validation error"
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "data": None,
                "error": {"code": "VALIDATION_ERROR", "message": message, "details": errors},
                "request_id": request_id,
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
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
    app.include_router(agents.router)
    app.include_router(auth.router)
    app.include_router(metrics.router)
    app.include_router(products.router)
    app.include_router(negotiation.router)
    app.include_router(orders.router)
    app.include_router(escrow.router)
    app.include_router(shipments.router)
    app.include_router(disputes.router)
    app.include_router(audit.router)
    app.include_router(catalog.router)
    app.include_router(webhooks.router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    port = settings.api_port
    print(f"OmniTrust Backend starting on http://localhost:{port}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=settings.is_development)
