"""
pytest configuration for OmniTrust backend tests.
Sets SUPABASE_URL so pydantic-settings doesn't fail on import
when running unit tests that don't touch the DB.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

# Fallback only if not set in .env
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-at-least-32-chars-long!!")
