"""
OmniTrust Backend — Mock Logistics Adapter

Calls the Mock 3PL service running at :5001. If the logistics service is
unavailable, raises LogisticsUnavailableError so the caller can decide whether
to abort or simulate.
"""
import httpx

from app.config import get_settings


class LogisticsUnavailableError(Exception):
    pass


def _base_url() -> str:
    return get_settings().logistics_base_url.rstrip("/")


def create_shipment(order_id: str, item_count: int) -> dict:
    """
    Register a new shipment with the mock 3PL.
    Returns {"tracking_id": "OMNI-TRK-XXXX", "status": "in_transit", ...}
    """
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{_base_url()}/api/v1/create_shipment",
                json={"order_id": order_id, "item_count": item_count},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise LogisticsUnavailableError(
            f"3PL returned {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc
    except Exception as exc:
        raise LogisticsUnavailableError(f"3PL unreachable: {exc}") from exc


def get_shipment(tracking_id: str) -> dict:
    """Query the mock 3PL for current shipment state."""
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{_base_url()}/api/v1/shipments/{tracking_id}")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise LogisticsUnavailableError(f"Shipment {tracking_id} not found at 3PL") from exc
        raise LogisticsUnavailableError(
            f"3PL returned {exc.response.status_code}"
        ) from exc
    except Exception as exc:
        raise LogisticsUnavailableError(f"3PL unreachable: {exc}") from exc


def check_logistics_health() -> dict:
    """Probe the mock 3PL root endpoint."""
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(f"{_base_url()}/health")
            return {"ok": resp.status_code == 200, "detail": f"3PL reachable at {_base_url()}"}
    except Exception as exc:
        return {"ok": False, "detail": str(exc)}
