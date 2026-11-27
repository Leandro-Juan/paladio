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


def test_jwt_secret_fail_fast_in_production(tmp_path):
    blocker_file = tmp_path / "not_a_dir"
    blocker_file.write_text("x", encoding="utf-8")
    unwritable_path = str(blocker_file / ".jwt_secret")

    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "",
            "JWT_SECRET_PATH": unwritable_path,
        },
        clear=False,
    ):
        os.environ.pop("JWT_SECRET_KEY", None)
        with pytest.raises(RuntimeError) as exc_info:
            importlib.reload(security)
        assert "JWT_SECRET_KEY must be explicitly configured" in str(exc_info.value)

    with patch.dict(
        os.environ,
        {
            "APP_ENV": "production",
            "ENVIRONMENT": "test",
            "JWT_SECRET_KEY": "",
            "JWT_SECRET_PATH": unwritable_path,
        },
        clear=False,
    ):
        os.environ.pop("JWT_SECRET_KEY", None)
        with pytest.raises(RuntimeError) as exc_info:
            importlib.reload(security)
        assert "JWT_SECRET_KEY must be explicitly configured" in str(exc_info.value)

    writable_path = tmp_path / ".jwt_secret_persisted"
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "",
            "JWT_SECRET_PATH": str(writable_path),
        },
        clear=False,
    ):
        os.environ.pop("JWT_SECRET_KEY", None)
        importlib.reload(security)
        first_secret = security.SECRET_KEY
        assert writable_path.exists()
        assert (writable_path.stat().st_mode & 0o777) == 0o600
        importlib.reload(security)
        assert security.SECRET_KEY == first_secret

    # Restore module state
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "development",
            "JWT_SECRET_KEY": "paladio-test-dev-secret-key-at-least-32-bytes-long",
        },
    ):
        importlib.reload(security)


def test_create_access_token_protects_reserved_claims():
    token = create_access_token(
        subject="real-user-1",
        extra_claims={"sub": "spoofed-admin", "exp": 1, "role": "user"},
    )
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "real-user-1"
    assert payload["role"] == "user"
    assert payload["exp"] > payload["iat"]
