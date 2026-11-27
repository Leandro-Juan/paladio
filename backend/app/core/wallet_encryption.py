import base64
import hashlib
import os
from pathlib import Path

from cryptography.fernet import Fernet

from app.core.paths import resolve_runtime_data_dir

_fernet_instance: Fernet | None = None


def _load_or_generate_wallet_key() -> str:
    env_key = os.getenv("WALLET_ENCRYPTION_KEY")
    if env_key and env_key.strip():
        return env_key.strip()

    env = os.getenv("ENVIRONMENT", "development").lower()
    app_env = os.getenv("APP_ENV", "").lower()

    key_file = Path(
        os.getenv("WALLET_ENCRYPTION_KEY_PATH")
        or (resolve_runtime_data_dir() / ".wallet_key")
    )
    try:
        if key_file.exists():
            content = key_file.read_text(encoding="utf-8").strip()
            if content:
                return content
        key_file.parent.mkdir(parents=True, exist_ok=True)
        generated = Fernet.generate_key().decode("utf-8")
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        with os.fdopen(os.open(key_file, flags, 0o600), "w", encoding="utf-8") as f:
            f.write(generated)
        return generated
    except Exception:
        if env == "production" or app_env == "production":
            raise RuntimeError(
                "WALLET_ENCRYPTION_KEY must be explicitly configured or data volume must be writable."
            )
        # Deterministic 32-byte key for dev/test fallback
        derived = hashlib.sha256(b"paladio-dev-wallet-encryption-key-seed").digest()
        return base64.urlsafe_b64encode(derived).decode("utf-8")


def get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    key = _load_or_generate_wallet_key()

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
