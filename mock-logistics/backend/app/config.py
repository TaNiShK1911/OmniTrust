import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    logistics_port: int = 5001
    logistics_db_url: str = "sqlite:///./data/logistics.db"
    omnitrust_webhook_url: str = "http://localhost:8000/api/webhooks/logistics"
    logistics_webhook_secret: str = "change-me"
    webhook_timeout_seconds: int = 15
    webhook_max_retries: int = 3

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Fallback to local dev secret if change-me is set but not overridden, 
# for ease of hackathon dev
settings = Settings()
if settings.logistics_webhook_secret == "change-me":
    settings.logistics_webhook_secret = os.getenv("LOGISTICS_WEBHOOK_SECRET", "razorpay_hackathon_secret_2026")
