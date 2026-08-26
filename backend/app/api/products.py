"""OmniTrust Backend — Product Catalog Endpoints"""
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.db import queries
from app.dependencies import AuthUser, DB, OptionalAuthUser
from app.services.audit_service import log_event

router = APIRouter(prefix="/api/v1/products", tags=["products"])


class ProductCreate(BaseModel):
    sku: str
    name: str
    category: str = "general"
    description: str = ""
    list_price: float = Field(gt=0)
    price_floor: float = Field(gt=0)
    currency: str = "INR"
    stock: int = Field(gt=0)

    def validate_floor(self):
        if self.price_floor > self.list_price:
            raise ValueError("price_floor must be <= list_price")


class ProductPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    list_price: float | None = None
    price_floor: float | None = None
    stock: int | None = None
    category: str | None = None


@router.get("")
def list_products(
    db: DB,
    user: OptionalAuthUser = None,
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    products = queries.list_products(db, search=search, page=page, limit=limit)
    return {"success": True, "data": products, "error": None}


@router.get("/{product_id}")
def get_product(product_id: str, db: DB, user: OptionalAuthUser = None):
    product = queries.get_product(db, product_id)
    return {"success": True, "data": product, "error": None}


@router.post("", status_code=201)
def create_product(body: ProductCreate, db: DB, user: AuthUser):
    body.validate_floor()
    product = queries.create_product(db, body.model_dump())
    log_event(
        db,
        user_id=user.user_id,
        category="guardrail",
        event_type="product.created",
        actor="Admin",
        entity=product["sku"],
        decision="PRODUCT_CREATED",
        payload={"sku": product["sku"], "list_price": body.list_price},
    )
    return {"success": True, "data": product, "error": None}


@router.patch("/{product_id}")
def update_product(product_id: str, body: ProductPatch, db: DB, user: AuthUser):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = queries.update_product(db, product_id, fields)
    log_event(
        db,
        user_id=user.user_id,
        category="guardrail",
        event_type="product.updated",
        actor="Admin",
        entity=product_id,
        decision="PRODUCT_UPDATED",
        payload=fields,
    )
    return {"success": True, "data": updated, "error": None}
