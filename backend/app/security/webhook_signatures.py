"""
OmniTrust Backend — Security: Webhook Signature Verification

Implements HMAC-SHA256 signing and constant-time verification for logistics
webhook payloads. The secret must match LOGISTICS_WEBHOOK_SECRET in both
OmniTrust and the Mock 3PL service.
"""
import hashlib
import hmac


def sign_payload(body: bytes, secret: str) -> str:
    """
    Compute HMAC-SHA256 hex digest of `body` using `secret`.
    Used by the mock 3PL to sign outgoing events and by the backend
    to verify incoming ones.
    """
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    """
    Constant-time comparison of the provided `signature` against the expected
    HMAC-SHA256 of `body`. Returns False on any error (missing secret, wrong
    length, invalid hex) rather than raising.

    Security notes:
    - Uses hmac.compare_digest to prevent timing attacks.
    - Always computes the expected digest even when signature is empty so that
      execution time does not leak whether the secret is configured.
    """
    if not secret:
        return False
    expected = sign_payload(body, secret)
    try:
        return hmac.compare_digest(
            expected.encode("ascii"),
            signature.strip().encode("ascii"),
        )
    except Exception:
        return False
