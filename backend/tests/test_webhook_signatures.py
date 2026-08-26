"""
OmniTrust Backend — Unit Tests: Webhook Signature Verification

Tests HMAC-SHA256 signing and constant-time comparison.
These tests require zero network calls or external services.
"""
import pytest

from app.security.webhook_signatures import sign_payload, verify_signature


SECRET = "razorpay_hackathon_secret_2026"
BODY = b'{"tracking_id":"OMNI-TRK-1234","event":"delivered"}'


class TestSignPayload:
    def test_deterministic(self):
        assert sign_payload(BODY, SECRET) == sign_payload(BODY, SECRET)

    def test_different_secrets_differ(self):
        assert sign_payload(BODY, SECRET) != sign_payload(BODY, "different-secret")

    def test_different_bodies_differ(self):
        assert sign_payload(BODY, SECRET) != sign_payload(b'{"other":"body"}', SECRET)

    def test_returns_hex_string(self):
        sig = sign_payload(BODY, SECRET)
        assert len(sig) == 64  # SHA256 = 32 bytes = 64 hex chars
        int(sig, 16)  # must be valid hex


class TestVerifySignature:
    def test_valid_signature_passes(self):
        sig = sign_payload(BODY, SECRET)
        assert verify_signature(BODY, sig, SECRET) is True

    def test_tampered_body_fails(self):
        sig = sign_payload(BODY, SECRET)
        tampered = BODY + b" extra"
        assert verify_signature(tampered, sig, SECRET) is False

    def test_wrong_secret_fails(self):
        sig = sign_payload(BODY, "wrong-secret-from-attacker")
        assert verify_signature(BODY, sig, SECRET) is False

    def test_empty_signature_fails(self):
        assert verify_signature(BODY, "", SECRET) is False

    def test_empty_secret_fails(self):
        sig = sign_payload(BODY, SECRET)
        assert verify_signature(BODY, sig, "") is False

    def test_garbage_signature_fails(self):
        assert verify_signature(BODY, "not_a_valid_hex_sig_at_all_!!!", SECRET) is False

    def test_replay_same_event_id_same_result(self):
        """Same body + secret always produces same sig — replay detection is handled by audit log."""
        sig = sign_payload(BODY, SECRET)
        assert verify_signature(BODY, sig, SECRET) is True
        assert verify_signature(BODY, sig, SECRET) is True  # idempotent verification

    def test_case_sensitivity(self):
        """Signatures are compared as ASCII — uppercase hex should not verify."""
        sig = sign_payload(BODY, SECRET)
        # uppercase version of the sig — should fail (different bytes)
        assert verify_signature(BODY, sig.upper(), SECRET) is False
