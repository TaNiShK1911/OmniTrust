import os
import json
from pathlib import Path

# Set minimal non-secret dummy environment variables required to instantiate FastAPI app
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "dummy-anon-key-for-openapi-spec-generation")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "dummy-service-role-key-for-openapi-spec-generation")
os.environ.setdefault("SUPABASE_JWT_SECRET", "dummy-jwt-secret-min-32-chars-for-spec")
os.environ.setdefault("PAYPAL_CLIENT_ID", "dummy-paypal-client-id")
os.environ.setdefault("PAYPAL_CLIENT_SECRET", "dummy-paypal-client-secret")
os.environ.setdefault("LOGISTICS_WEBHOOK_SECRET", "omnitrust_logistics_secret_2026")

from app.main import app

def generate_spec():
    spec = app.openapi()
    dest = Path(__file__).resolve().parent.parent / "api" / "openapi.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {dest} with {len(spec.get('paths', {}))} paths and {len(spec.get('components', {}).get('schemas', {}))} schemas.")

if __name__ == "__main__":
    generate_spec()
