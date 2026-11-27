import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt

from app.core.paths import resolve_runtime_data_dir

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
APP_ENV = os.getenv("APP_ENV", "").lower()


def _load_or_generate_secret_key() -> str:
    env_secret = os.getenv("JWT_SECRET_KEY")
    if env_secret and env_secret.strip():
        return env_secret.strip()

    secret_file = Path(
        os.getenv("JWT_SECRET_PATH") or (resolve_runtime_data_dir() / ".jwt_secret")
    )
    try:
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        generated = secrets.token_hex(32)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        mode = 0o600
        try:
            with os.fdopen(
                os.open(secret_file, flags, mode), "w", encoding="utf-8"
            ) as f:
                f.write(generated)
            return generated
        except FileExistsError:
            for _ in range(5):
                content = secret_file.read_text(encoding="utf-8").strip()
                if content:
                    return content
                time.sleep(0.05)
            raise RuntimeError("Existing JWT secret file is empty.")
    except Exception:
        if ENVIRONMENT == "production" or APP_ENV == "production":
            raise RuntimeError(
                "JWT_SECRET_KEY must be explicitly configured or data volume must be writable."
            )
        return os.getenv(
            "DEV_JWT_SECRET",
            "paladio-dev-ephemeral-jwt-secret-key-do-not-use-in-production",
        )


SECRET_KEY = _load_or_generate_secret_key()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
)  # 24 hours


def hash_password(password: str) -> str:
    """
    Hashes a password using PBKDF2-HMAC-SHA256 with a cryptographically secure random salt.
    Format: <hex_salt>$<hex_hash>
    """
    salt = secrets.token_bytes(32)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain-text password against a hashed password using constant-time comparison.
    """
    try:
        salt_hex, hash_hex = hashed_password.split("$")
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(hash_hex)
        actual_hash = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode("utf-8"), salt, 100000
        )
        return hmac.compare_digest(actual_hash, expected_hash)
    except Exception:
        return False


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """
    Generates a signed JWT access token for a given user subject.
    """
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode: dict[str, Any] = dict(extra_claims) if extra_claims else {}
    to_encode.update(
        {
            "sub": str(subject),
            "iat": int(now.timestamp()),
            "exp": int(expire.timestamp()),
        }
    )

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any] | None:
    """
    Decodes and validates a JWT access token. Returns payload dict or None if invalid/expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None
