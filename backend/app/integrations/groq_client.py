"""
OmniTrust Backend — Groq API Client

Thin wrapper around the Groq Python SDK providing:
  - Structured JSON output with schema enforcement
  - Automatic retries with exponential back-off
  - Latency measurement and model-ID recording for the audit trail
  - Graceful degradation: raises GroqUnavailableError so callers can fall back
    to deterministic logic without crashing the request
"""
import json
import time
from typing import Any, TypeVar

from groq import Groq, APIStatusError, APIConnectionError, APITimeoutError

from app.config import get_settings

T = TypeVar("T")


class GroqUnavailableError(Exception):
    """Raised when Groq cannot be reached or returns an unusable response."""


def _client() -> Groq:
    settings = get_settings()
    if not settings.groq_configured:
        raise GroqUnavailableError("GROQ_API_KEY is not configured")
    return Groq(api_key=settings.groq_api_key)


def call_groq_structured(
    *,
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    model: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 800,
    max_retries: int = 2,
) -> tuple[dict[str, Any], float]:
    """
    Call Groq with structured JSON output mode.

    Returns (parsed_dict, latency_seconds).
    Raises GroqUnavailableError if all retries are exhausted or the response
    cannot be parsed as the expected JSON schema.
    """
    settings = get_settings()
    resolved_model = model or settings.groq_model
    client = _client()

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 2):
        started = time.monotonic()
        try:
            response = client.chat.completions.create(
                model=resolved_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "agent_output",
                        "strict": True,
                        "schema": json_schema,
                    },
                },
            )
            elapsed = time.monotonic() - started
            content = response.choices[0].message.content or ""
            try:
                parsed = json.loads(content)
                return parsed, elapsed
            except json.JSONDecodeError as exc:
                raise GroqUnavailableError(
                    f"Groq returned non-JSON content: {content[:200]}"
                ) from exc

        except GroqUnavailableError:
            raise
        except (APIConnectionError, APITimeoutError) as exc:
            last_error = exc
        except APIStatusError as exc:
            if exc.status_code < 500:
                raise GroqUnavailableError(
                    f"Groq client error {exc.status_code}: {exc.message}"
                ) from exc
            last_error = exc

        if attempt <= max_retries:
            time.sleep(2**attempt * 0.4)  # 0.8s, 1.6s

    raise GroqUnavailableError(
        f"Groq unavailable after {max_retries + 1} attempts: {last_error}"
    )
