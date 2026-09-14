import importlib
import os
from datetime import timedelta
from unittest.mock import patch

import pytest
from app.core import security
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hashing_and_verification():
    password = "SuperSecretPassword123!"
    hashed = hash_password(password)

    assert hashed != password
    assert "$" in hashed
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password(password, "malformed$hash$string") is False


def test_jwt_token_lifecycle():
    subject = "user-12345"
    token = create_access_token(
        subject=subject,
        expires_delta=timedelta(minutes=15),
        extra_claims={"role": "admin"},
    )

    assert isinstance(token, str)
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == subject
    assert payload["role"] == "admin"
    assert "exp" in payload
    assert "iat" in payload


def test_jwt_token_invalid_or_tampered():
    valid_token = create_access_token(subject="user-12345")
    tampered_token = valid_token[:-4] + "abcd"

    assert decode_access_token(tampered_token) is None
    assert decode_access_token("completely.invalid.jwt") is None


def test_jwt_secret_fail_fast_in_production():
    with patch.dict(
        os.environ, {"ENVIRONMENT": "production", "JWT_SECRET_KEY": ""}, clear=False
    ):
        os.environ.pop("JWT_SECRET_KEY", None)
        with pytest.raises(RuntimeError) as exc_info:
            importlib.reload(security)
        assert "JWT_SECRET_KEY must be explicitly configured in production" in str(
            exc_info.value
        )

    with patch.dict(
        os.environ, {"APP_ENV": "production", "ENVIRONMENT": "test"}, clear=False
    ):
        os.environ.pop("JWT_SECRET_KEY", None)
        with pytest.raises(RuntimeError) as exc_info:
            importlib.reload(security)
        assert "JWT_SECRET_KEY must be explicitly configured in production" in str(
            exc_info.value
        )

    # Restore module state
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "development",
            "JWT_SECRET_KEY": "paladio-test-dev-secret-key-at-least-32-bytes-long",
        },
    ):
        importlib.reload(security)
