"""
OmniTrust Backend — Application Configuration

All settings are loaded from environment variables (or .env file).
Pydantic Settings validates types at startup so misconfiguration fails fast.
"""
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────────
    app_env: str = "development"
    api_port: int = 8000
    frontend_origin: str = "http://localhost:3000"

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # ── Groq ──────────────────────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    groq_arb_model: str = "openai/gpt-oss-20b"

    # ── Razorpay ──────────────────────────────────────────────────────────────
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""

    # ── Logistics ─────────────────────────────────────────────────────────────
    logistics_base_url: str = "http://localhost:5001"
    logistics_webhook_secret: str = "razorpay_hackathon_secret_2026"

    # ── Business rules ────────────────────────────────────────────────────────
    negotiation_max_turns: int = 4
    max_order_value_inr: float = 500_000.0

    @field_validator("supabase_url")
    @classmethod
    def supabase_url_must_be_set(cls, v: str) -> str:
        if not v or v.startswith("<"):
            raise ValueError("SUPABASE_URL must be set")
        return v

    @property
    def is_development(self) -> bool:
        return self.app_env.lower() in ("development", "dev", "local")

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key and not self.groq_api_key.startswith("<"))

    @property
    def razorpay_configured(self) -> bool:
        return bool(
            self.razorpay_key_id
            and not self.razorpay_key_id.startswith("<")
            and self.razorpay_key_secret
            and not self.razorpay_key_secret.startswith("<")
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
