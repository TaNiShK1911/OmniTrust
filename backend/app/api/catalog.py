"""OmniTrust Backend — Catalog Endpoint for Agents"""
from fastapi import APIRouter, Query

from app.db import queries
from app.dependencies import DB

router = APIRouter(prefix="/api/v1/catalog/agent-feed", tags=["catalog"])


@router.get("/manifest")
def get_catalog_manifest():
    """Returns capabilities that an external AI agent can discover and use."""
    return {
        "@context": "https://schema.org",
        "@type": "WebAPI",
        "name": "OmniTrust Agent Commerce API",
        "description": "API for AI agents to discover products and negotiate B2B orders.",
        "documentation": "https://docs.omnitrust.local/agent-api",
        "endpoints": [
            {
                "name": "catalog_feed",
                "method": "GET",
                "url": "/api/v1/catalog/agent-feed",
                "description": "Returns a list of products formatted as JSON-LD schema.org Offers.",
            },
            {
                "name": "negotiate",
                "method": "POST",
                "url": "/api/v1/negotiations",
                "description": "Start a negotiation session for a product.",
            },
        ],
    }


@router.get("")
def get_agent_feed(
    db: DB,
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    """
    Returns the product catalog in a machine-readable JSON-LD format.
    Never exposes `price_floor` to external agents.
    """
    products = queries.list_products(db, search=search, page=page, limit=limit)
    feed = []

    for p in products:
        stock = int(p["stock"])
        availability = "https://schema.org/InStock" if stock > 0 else "https://schema.org/OutOfStock"
        
        feed.append({
            "@context": "https://schema.org",
            "@type": "Product",
            "sku": p["sku"],
            "name": p["name"],
            "description": p.get("description", ""),
            "category": p.get("category", ""),
            "offers": {
                "@type": "Offer",
                "price": float(p["list_price"]),
                "priceCurrency": p.get("currency", "INR"),
                "availability": availability,
                "negotiable": True,
                "negotiationEndpoint": "/api/v1/negotiations"
            },
        })

    return {"success": True, "data": feed, "error": None}
