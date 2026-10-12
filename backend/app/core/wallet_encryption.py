import base64
import hashlib
import os
from cryptography.fernet import Fernet

_fernet_instance: Fernet | None = None


def get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    key = os.getenv("WALLET_ENCRYPTION_KEY")
    env = os.getenv("ENVIRONMENT", "development").lower()
    app_env = os.getenv("APP_ENV", "").lower()

    if not key:
        if env == "production" or app_env == "production":
            raise RuntimeError(
                "WALLET_ENCRYPTION_KEY must be explicitly configured in production environment."
            )
        # Deterministic 32-byte key for dev/test
        derived = hashlib.sha256(b"paladio-dev-wallet-encryption-key-seed").digest()
        key = base64.urlsafe_b64encode(derived).decode("utf-8")

    try:
        _fernet_instance = Fernet(key.encode("utf-8") if isinstance(key, str) else key)
    except Exception as e:
        raise ValueError(f"Invalid WALLET_ENCRYPTION_KEY format: {e}") from e

    return _fernet_instance


def encrypt_wallet_secret(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    if not plaintext:
        return ""
    f = get_fernet()
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_wallet_secret(ciphertext: str | None) -> str | None:
    if ciphertext is None:
        return None
    if not ciphertext:
        return ""
    f = get_fernet()
    try:
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        # If decryption fails (e.g. legacy plain text), return as-is
        return ciphertext
