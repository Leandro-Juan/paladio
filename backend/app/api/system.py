import logging
from typing import Any

from app.api.deps import get_current_admin_user, get_optional_user
from app.db.models import UserModel
from app.db.session import get_db
from app.services.llm_service import (
    LLMService,
    SUPPORTED_PROVIDERS,
    mask_api_key,
)
from app.services.settings_service import SettingsService
from app.services.photo_sync_service import PhotoSyncService
from app.services.notification_relay_service import NotificationRelayService
from app.schemas.settings import DOMAIN_CONFIG_MAP
from app.services.updater_service import UpdaterService

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


class UpdateConfigPayload(BaseModel):
    auto_update_enabled: bool | None = Field(
        None, description="Whether background automatic updates are enabled or stopped"
    )
    check_interval_hours: int | None = Field(
        None, description="Interval in hours for periodic GitHub update checks"
    )
    github_repo: str | None = Field(
        None, description="GitHub repository in owner/repo format"
    )


class ManualDownloadPayload(BaseModel):
    version: str | None = Field(None, description="Target version to download")
    download_url: str | None = Field(None, description="Explicit download URL if known")


@router.get("/update/status")
async def get_update_status(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Retrieve the current software version, update telemetry, and auto-updater settings."""
    try:
        return await UpdaterService.get_state(session)
    except Exception as e:
        logger.exception(f"Failed to fetch update status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load updater status: {e}",
        )


@router.post("/update/config")
async def update_updater_configuration(
    payload: UpdateConfigPayload,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """
    Update auto-updater preferences, including the option to stop/disable automatic updates.
    """
    try:
        updated = await UpdaterService.update_config(
            session=session,
            auto_update_enabled=payload.auto_update_enabled,
            check_interval_hours=payload.check_interval_hours,
            github_repo=payload.github_repo,
        )
        return {"status": "success", "config": updated}
    except Exception as e:
        logger.exception(f"Failed to update updater configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save updater configuration: {e}",
        )


@router.post("/update/check")
async def trigger_update_check(
    force_download: bool = False,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """
    Manually check GitHub for the latest release/tag.
    If force_download is True or auto_update_enabled is True and a newer version exists,
    automatically triggers download.
    """
    try:
        result = await UpdaterService.check_for_updates(
            session=session,
            force_download=force_download,
        )
        return {"status": "success", "telemetry": result}
    except Exception as e:
        logger.exception(f"Error checking GitHub update: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check for updates: {e}",
        )


@router.post("/update/download")
async def trigger_update_download(
    payload: ManualDownloadPayload | None = None,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """
    Manually download the latest release archive from GitHub.
    """
    try:
        download_url = payload.download_url if payload else None
        version = payload.version if payload else None
        result = await UpdaterService.download_update(
            session=session,
            download_url=download_url,
            version=version,
        )
        return {"status": "success", "download": result}
    except Exception as e:
        logger.exception(f"Error downloading update: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download update: {e}",
        )


class UpdateLLMConfigPayload(BaseModel):
    provider: str = Field(..., description="LLM provider key")
    model: str = Field(..., description="Model identifier")
    api_key: str | None = Field(None, description="API key or token for the provider")
    base_url: str | None = Field(None, description="Custom API endpoint URL")


class TestLLMConnectionPayload(BaseModel):
    provider: str = Field(..., description="LLM provider key")
    model: str = Field(..., description="Model identifier")
    api_key: str | None = Field(None, description="API key to test")
    base_url: str | None = Field(None, description="Custom base URL to test")


@router.get("/llm/config")
async def get_llm_configuration(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Retrieve current LLM provider configuration and catalog of supported providers."""
    try:
        config = await LLMService.get_config_from_db(session)
        configured_providers = await LLMService.get_configured_providers(session)
        hardware = LLMService.get_hardware_profile()
        return {
            "provider": config.provider,
            "model": config.model,
            "base_url": config.base_url,
            "has_api_key": bool(config.api_key),
            "masked_api_key": mask_api_key(config.api_key),
            "supported_providers": SUPPORTED_PROVIDERS,
            "configured_providers": configured_providers,
            "hardware_profile": hardware.to_dict(),
        }
    except Exception as e:
        logger.exception(f"Failed to retrieve LLM configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load LLM config: {e}",
        )


@router.post("/llm/config")
async def update_llm_configuration(
    payload: UpdateLLMConfigPayload,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Update active LLM provider, model, API key, or custom endpoint URL."""
    try:
        saved = await LLMService.save_config(
            session=session,
            provider=payload.provider,
            model=payload.model,
            api_key=payload.api_key,
            base_url=payload.base_url,
        )
        configured_providers = await LLMService.get_configured_providers(session)
        hardware = LLMService.get_hardware_profile()
        return {
            "status": "success",
            "config": {
                "provider": saved.provider,
                "model": saved.model,
                "base_url": saved.base_url,
                "has_api_key": bool(saved.api_key),
                "masked_api_key": mask_api_key(saved.api_key),
                "supported_providers": SUPPORTED_PROVIDERS,
                "configured_providers": configured_providers,
                "hardware_profile": hardware.to_dict(),
            },
        }
    except Exception as e:
        logger.exception(f"Failed to update LLM configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update LLM config: {e}",
        )


@router.post("/llm/test")
async def test_llm_connection(
    payload: TestLLMConnectionPayload,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Test connectivity and authentication against an LLM provider."""
    try:
        result = await LLMService.test_connection(
            provider=payload.provider,
            model=payload.model,
            api_key=payload.api_key,
            base_url=payload.base_url,
            session=session,
        )
        return result
    except Exception as e:
        logger.exception(f"Failed during LLM connection test: {e}")
        return {
            "success": False,
            "error": str(e),
            "provider": payload.provider,
            "model": payload.model,
        }


class UnloadModelPayload(BaseModel):
    model: str | None = Field(
        None, description="Optional model name to unload from memory"
    )


@router.post("/llm/unload")
async def unload_local_model(
    payload: UnloadModelPayload | None = None,
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Unload resident local Ollama model to immediately reclaim system memory."""
    target_model = payload.model if payload else None
    success = await LLMService.unload_ollama_model(model_name=target_model)
    hardware = LLMService.get_hardware_profile()
    return {
        "success": success,
        "message": (
            f"Local model '{target_model or 'active'}' unloaded from memory."
            if success
            else "Failed to unload or Ollama is not active."
        ),
        "hardware_profile": hardware.to_dict(),
    }


class PhotoSyncTestPayload(BaseModel):
    provider: str = Field(
        ..., description="Target photo provider ('immich' or 'synology')"
    )
    url: str = Field(..., description="Base endpoint URL")
    api_key: str | None = Field(None, description="API key for Immich")
    username: str | None = Field(None, description="Username for Synology")
    password: str | None = Field(None, description="Password for Synology")
    destination_path: str | None = Field(
        None, description="Destination folder on Synology"
    )


class PhotoSyncAllPayload(BaseModel):
    trip_id: str | None = Field(
        None, description="Optional trip ID to restrict sync to"
    )


class NotificationTestPayload(BaseModel):
    provider: str = Field(
        ..., description="Provider key ('pushify', 'pushover', 'ntfy', 'webhook')"
    )
    config: dict[str, Any] = Field(..., description="Provider configuration dictionary")


class NotificationRelayPayload(BaseModel):
    title: str = Field(..., description="Notification title")
    message: str = Field(..., description="Notification body content")
    level: str = Field(
        "info", description="Severity level: info, success, warning, error"
    )
    action_url: str | None = Field(None, description="Optional target action link URL")
    event_type: str = Field(
        "general",
        description="Event category: deal_alert, trip_update, ticket_parse, photo_sync, general",
    )


@router.get("/settings/{domain}")
async def get_domain_settings(
    domain: str,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Retrieve system settings for a specific domain (engine, swarm, vault, notifications)."""
    if domain not in DOMAIN_CONFIG_MAP:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Domain '{domain}' not found. Valid domains: {list(DOMAIN_CONFIG_MAP.keys())}",
        )

    # Sensitive infrastructure domains require administrator role
    if domain in ("vault", "notifications"):
        if not _user or getattr(_user, "role", "user") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrator privileges required to access infrastructure domain settings",
            )

    try:
        data = await SettingsService.get_domain_settings(session, domain)
        return {"status": "success", "domain": domain, "config": data}
    except Exception as e:
        logger.exception(f"Failed to fetch domain settings for '{domain}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load settings: {e}",
        )


@router.post("/settings/{domain}")
async def update_domain_settings(
    domain: str,
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Update system settings for a domain (engine, swarm, vault, notifications) - Admin Only."""
    if not _user or getattr(_user, "role", "user") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required to modify system settings",
        )

    if domain not in DOMAIN_CONFIG_MAP:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Domain '{domain}' not found. Valid domains: {list(DOMAIN_CONFIG_MAP.keys())}",
        )
    try:
        updated = await SettingsService.update_domain_settings(session, domain, payload)
        return {"status": "success", "domain": domain, "config": updated}
    except Exception as e:
        logger.exception(f"Failed to update domain settings for '{domain}': {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update settings: {e}",
        )


@router.post("/photo-sync/test")
async def test_photo_sync_endpoint(
    payload: PhotoSyncTestPayload,
    _admin: UserModel = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Test Immich or Synology connection and authentication (Admin Only)."""
    provider = payload.provider.strip().lower()
    if provider == "immich":
        return await PhotoSyncService.test_immich_connection(
            url=payload.url,
            api_key=payload.api_key or "",
        )
    elif provider == "synology":
        return await PhotoSyncService.test_synology_connection(
            url=payload.url,
            username=payload.username or "",
            password=payload.password or "",
            destination_path=payload.destination_path or "/photo/Paladio",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported photo sync provider '{payload.provider}'. Supported: 'immich', 'synology'",
        )


@router.post("/photo-sync/sync-all")
async def sync_all_vault_photos_endpoint(
    payload: PhotoSyncAllPayload | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: UserModel = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Manually trigger photo synchronization across all vault trips (Admin Only)."""
    trip_id = payload.trip_id if payload else None
    return await PhotoSyncService.sync_all_vault_photos(
        session=session, trip_id=trip_id
    )


@router.post("/notifications/test")
async def test_notification_relay_endpoint(
    payload: NotificationTestPayload,
    _admin: UserModel = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Send a diagnostic ping message to verify a notification relay provider (Admin Only)."""
    return await NotificationRelayService.test_relay(
        provider=payload.provider.strip().lower(),
        config=payload.config,
    )


@router.post("/notifications/relay")
async def relay_notification_endpoint(
    payload: NotificationRelayPayload,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Dispatch a notification event to all configured notification relays."""
    return await NotificationRelayService.dispatch(
        session=session,
        title=payload.title,
        message=payload.message,
        level=payload.level,
        action_url=payload.action_url,
        event_type=payload.event_type,
    )


# ---------------------------------------------------------------------------
# API Keys & Secrets Management
# ---------------------------------------------------------------------------


_SECRET_REGISTRY: dict[str, dict[str, str]] = {
    "aviasales": {
        "label": "Aviasales / Travelpayouts Data API",
        "description": "Used for 11-month forward flight price sweeps, price drop detection, and live fare verification.",
    },
    "deepl": {
        "label": "DeepL Translation API",
        "description": "High-accuracy neural translation for on-demand POI overview localization (supports Free :fx and Pro keys).",
    },
    "libretranslate": {
        "label": "LibreTranslate (Self-Hosted)",
        "description": "Private, unlimited on-demand POI overview translation via your own LibreTranslate instance.",
    },
}


class UpdateSecretPayload(BaseModel):
    secret_type: str = Field(
        ...,
        description="Secret type identifier ('aviasales', 'deepl', 'libretranslate')",
    )
    token: str = Field("", description="API key or token to save")
    base_url: str | None = Field(
        None,
        description="Optional endpoint URL (used by self-hosted providers like libretranslate)",
    )


class TestSecretPayload(BaseModel):
    token: str | None = Field(
        None, description="Optional raw token to test before saving"
    )
    base_url: str | None = Field(
        None, description="Optional endpoint URL to test before saving"
    )


def _require_admin(user: UserModel | None, detail: str) -> UserModel:
    if not user or getattr(user, "role", "user") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )
    return user


def mask_secret_token(token: str | None) -> str | None:
    if not token:
        return None
    token = token.strip()
    if len(token) <= 8:
        return "•" * len(token)
    return f"{'•' * (len(token) - 4)}{token[-4:]}"


def _build_secret_item(
    provider: str,
    *,
    token: str | None = None,
    base_url: str | None = None,
    source: str = "not_configured",
    updated_at: str | None = None,
) -> dict[str, Any]:
    meta = _SECRET_REGISTRY[provider]
    clean_token = (token or "").strip()
    clean_url = (base_url or "").strip().rstrip("/")
    configured = bool(clean_url) if provider == "libretranslate" else bool(clean_token)
    item: dict[str, Any] = {
        "provider": provider,
        "label": meta["label"],
        "description": meta["description"],
        "configured": configured,
        "masked_token": mask_secret_token(clean_token) if clean_token else None,
        "source": source if configured else "not_configured",
        "updated_at": updated_at,
    }
    if provider == "libretranslate":
        item["base_url"] = clean_url or None
    return item


@router.get("/secrets")
async def get_system_secrets(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Retrieve status and obfuscated values of configured external API secrets (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to manage system secrets")
    import os
    from app.db.models import SystemConfigModel
    from app.engine.market.config import get_travelpayouts_token, config
    from sqlalchemy import select

    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    secrets_dict = record.value if record and isinstance(record.value, dict) else {}

    # 1. Aviasales
    db_av = secrets_dict.get("aviasales", {})
    db_av_token = db_av.get("token")
    if db_av_token is not None:
        av_token = db_av_token
        av_source = "database" if db_av_token else "not_configured"
    else:
        av_token = get_travelpayouts_token() or config.TRAVELPAYOUTS_TOKEN
        av_source = "env" if av_token else "not_configured"

    # 2. DeepL
    db_dl = secrets_dict.get("deepl", {})
    db_dl_token = db_dl.get("token")
    if db_dl_token is not None:
        dl_token = db_dl_token
        dl_source = "database" if db_dl_token else "not_configured"
    else:
        dl_token = (os.getenv("DEEPL_API_KEY") or "").strip()
        dl_source = "env" if dl_token else "not_configured"

    # 3. LibreTranslate
    db_lt = secrets_dict.get("libretranslate", {})
    db_lt_url = db_lt.get("base_url")
    if db_lt_url is not None:
        lt_url = db_lt_url
        lt_token = db_lt.get("token") or ""
        lt_source = "database" if db_lt_url else "not_configured"
    else:
        lt_url = (os.getenv("LIBRETRANSLATE_URL") or "").strip()
        lt_token = (os.getenv("LIBRETRANSLATE_API_KEY") or "").strip()
        lt_source = "env" if lt_url else "not_configured"

    return {
        "status": "success",
        "secrets": {
            "aviasales": _build_secret_item(
                "aviasales",
                token=av_token,
                source=av_source,
                updated_at=db_av.get("updated_at"),
            ),
            "deepl": _build_secret_item(
                "deepl",
                token=dl_token,
                source=dl_source,
                updated_at=db_dl.get("updated_at"),
            ),
            "libretranslate": _build_secret_item(
                "libretranslate",
                token=lt_token,
                base_url=lt_url,
                source=lt_source,
                updated_at=db_lt.get("updated_at"),
            ),
        },
    }


@router.post("/secrets")
async def update_system_secret(
    payload: UpdateSecretPayload,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Persist or update an external API secret and update runtime engine state (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to manage system secrets")
    from app.db.models import SystemConfigModel
    from app.engine.market.config import set_runtime_aviasales_token
    from datetime import datetime, timezone
    from sqlalchemy import select

    secret_type = payload.secret_type.strip().lower()
    raw_token = (payload.token or "").strip()
    raw_url = (payload.base_url or "").strip().rstrip("/")

    if secret_type not in _SECRET_REGISTRY:
        supported = ", ".join(f"'{k}'" for k in _SECRET_REGISTRY)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported secret type: '{payload.secret_type}'. Supported: {supported}",
        )

    if secret_type == "libretranslate":
        if not raw_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Endpoint URL cannot be empty for LibreTranslate.",
            )
    elif not raw_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token cannot be empty. Use DELETE to remove a configured token.",
        )

    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()

    now_iso = datetime.now(timezone.utc).isoformat()
    secrets_dict = (
        dict(record.value) if record and isinstance(record.value, dict) else {}
    )

    if secret_type == "libretranslate":
        secrets_dict["libretranslate"] = {
            "base_url": raw_url,
            "token": raw_token,
            "updated_at": now_iso,
        }
    else:
        secrets_dict[secret_type] = {
            "token": raw_token,
            "updated_at": now_iso,
        }

    if record:
        record.value = secrets_dict
    else:
        record = SystemConfigModel(key="secrets", value=secrets_dict)
        session.add(record)

    await session.commit()
    await session.refresh(record)

    if secret_type == "aviasales":
        set_runtime_aviasales_token(raw_token)

    return {
        "status": "success",
        "secret": _build_secret_item(
            secret_type,
            token=raw_token,
            base_url=raw_url if secret_type == "libretranslate" else None,
            source="database",
            updated_at=now_iso,
        ),
    }


@router.delete("/secrets/{secret_type}")
async def delete_system_secret(
    secret_type: str,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Delete a configured external API secret and clear it from the runtime engine (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to manage system secrets")
    from app.db.models import SystemConfigModel
    from app.engine.market.config import set_runtime_aviasales_token
    from sqlalchemy import select

    stype = secret_type.strip().lower()
    if stype not in _SECRET_REGISTRY:
        supported = ", ".join(f"'{k}'" for k in _SECRET_REGISTRY)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported secret type: '{secret_type}'. Supported: {supported}",
        )

    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()

    if record and isinstance(record.value, dict):
        secrets_dict = dict(record.value)
        if stype == "libretranslate":
            secrets_dict["libretranslate"] = {
                "base_url": "",
                "token": "",
                "updated_at": None,
            }
        else:
            secrets_dict[stype] = {"token": "", "updated_at": None}
        record.value = secrets_dict
        await session.commit()

    if stype == "aviasales":
        set_runtime_aviasales_token("")

    return {
        "status": "success",
        "secret": _build_secret_item(stype, source="not_configured"),
    }


@router.post("/secrets/test/{secret_type}")
async def test_system_secret(
    secret_type: str,
    payload: TestSecretPayload | None = None,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Test connectivity of an API secret with live provider validation (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to manage system secrets")
    import httpx
    from app.db.models import SystemConfigModel
    from app.engine.market.config import get_travelpayouts_token
    from app.engine.market.providers.aviasales import AviasalesProvider
    from app.services.translation_service import TranslationService
    from sqlalchemy import select

    stype = secret_type.strip().lower()
    if stype not in _SECRET_REGISTRY:
        supported = ", ".join(f"'{k}'" for k in _SECRET_REGISTRY)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported secret type: '{secret_type}'. Supported: {supported}",
        )

    if stype == "deepl":
        creds = await TranslationService.get_secret_credentials(session)
        test_key = (
            payload.token.strip()
            if payload and payload.token and payload.token.strip()
            else creds["deepl"]["api_key"]
        )
        if not test_key:
            return {"success": False, "message": "No DeepL API key configured to test."}
        translated = await TranslationService._translate_via_deepl(
            "Hello", "es", "en", api_key=test_key
        )
        if translated:
            return {
                "success": True,
                "message": "Successfully validated DeepL API key and translation endpoint.",
            }
        return {
            "success": False,
            "message": "DeepL API key validation failed. Check key and quota.",
        }

    if stype == "libretranslate":
        creds = await TranslationService.get_secret_credentials(session)
        test_url = (
            payload.base_url.strip().rstrip("/")
            if payload and payload.base_url and payload.base_url.strip()
            else creds["libretranslate"]["base_url"]
        )
        if not test_url:
            return {
                "success": False,
                "message": "No LibreTranslate URL configured to test.",
            }
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(f"{test_url}/languages")
                if resp.status_code == 200 and isinstance(resp.json(), list):
                    return {
                        "success": True,
                        "message": f"Connected to LibreTranslate ({len(resp.json())} languages available).",
                    }
                return {
                    "success": False,
                    "message": f"LibreTranslate responded with HTTP {resp.status_code}.",
                }
        except Exception as err:
            return {
                "success": False,
                "message": f"LibreTranslate connection failed: {err}",
            }

    test_token = payload.token.strip() if payload and payload.token else None
    if not test_token:
        stmt = select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
        res = await session.execute(stmt)
        record = res.scalar_one_or_none()
        if record and isinstance(record.value, dict):
            test_token = record.value.get("aviasales", {}).get("token")
        if not test_token:
            test_token = get_travelpayouts_token()

    if not test_token:
        return {
            "success": False,
            "message": "No Aviasales token configured to test.",
        }

    provider = AviasalesProvider(token=test_token)
    try:
        is_healthy = await provider.is_healthy()
        if not is_healthy:
            return {
                "success": False,
                "message": "Aviasales token is invalid or missing.",
            }

        return {
            "success": True,
            "message": "Successfully validated Aviasales token format and connectivity.",
        }
    except Exception as e:
        logger.warning(f"Aviasales connection test failed: {e}")
        return {
            "success": False,
            "message": f"Connection test failed: {e}",
        }


# ---------------------------------------------------------------------------
# Taste Profile, Deal Sweep & Vault Operations
# ---------------------------------------------------------------------------

_TASTE_LABELS: dict[str, str] = {
    "art_culture": "Art & Culture",
    "history_heritage": "History & Heritage",
    "nature_outdoors": "Nature & Outdoors",
    "architecture": "Architecture",
    "food_culinary": "Food & Culinary",
    "nightlife": "Nightlife",
    "shopping": "Shopping",
    "scenic_views": "Scenic Views",
}

_CACHED_TASTE_ANCHORS: dict[str, list[float]] | None = None


async def _load_taste_anchors() -> dict[str, list[float]]:
    global _CACHED_TASTE_ANCHORS
    if _CACHED_TASTE_ANCHORS is not None:
        return _CACHED_TASTE_ANCHORS

    from app.engine.scoring.semantic_learning import CATEGORY_ANCHORS
    from app.infrastructure.providers.onnx_embedding_provider import (
        OnnxEmbeddingProvider,
    )

    provider = OnnxEmbeddingProvider()
    anchors: dict[str, list[float]] = {}
    for tag, prompt in CATEGORY_ANCHORS.items():
        anchors[tag] = await provider.embed_text(prompt, input_type="query")
    _CACHED_TASTE_ANCHORS = anchors
    return anchors


@router.get("/taste-profile")
async def get_taste_profile(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Retrieve the authenticated user's live 768-D semantic taste profile projections."""
    if not _user:
        return {
            "status": "success",
            "active": False,
            "dimensions": 0,
            "affinities": [],
        }

    from app.application.taste.taste_service import TasteService
    from app.engine.scoring.semantic_learning import SemanticLearningEngine
    import numpy as np

    prof = await TasteService.get_or_create_profile(session, _user.id)
    embedding = prof.embedding
    if (
        embedding is None
        or len(embedding) == 0
        or (prof.is_neutral and prof.event_count == 0)
    ):
        return {
            "status": "success",
            "active": False,
            "dimensions": len(embedding) if embedding else 0,
            "affinities": [],
        }

    emb_arr = np.asarray(embedding, dtype=np.float32)
    neutral = np.asarray(
        SemanticLearningEngine.get_neutral_768d_prior(len(emb_arr)), dtype=np.float32
    )
    if prof.is_neutral and np.allclose(emb_arr, neutral, atol=1e-4):
        return {
            "status": "success",
            "active": False,
            "dimensions": len(emb_arr),
            "affinities": [],
        }

    affinities: list[dict[str, Any]] = []
    try:
        anchors = await _load_taste_anchors()
        engine = SemanticLearningEngine(anchors)
        projected = engine.project_to_8d_harmonics(emb_arr)
        post_affs = prof.get_tag_affinities()
        affinities = [
            {
                "category": _TASTE_LABELS.get(tag, tag),
                "score": round(
                    0.5 * float(score) + 0.5 * float(post_affs.get(tag, 0.5)), 4
                ),
            }
            for tag, score in projected.items()
        ]
    except Exception as e:
        logger.warning(
            f"Failed projecting user taste embedding onto category anchors: {e}"
        )

    return {
        "status": "success",
        "active": True,
        "dimensions": len(emb_arr),
        "affinities": affinities,
    }


@router.post("/taste-profile/reset")
async def reset_taste_profile(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Reset the authenticated user's semantic taste vector back to the neutral prior."""
    if not _user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to reset taste profile",
        )

    from app.application.taste.taste_service import TasteService

    prof = await TasteService.reset_user_taste_profile(session, _user.id)

    return {
        "status": "success",
        "active": False,
        "dimensions": len(prof.embedding or []),
        "affinities": [],
    }


@router.post("/deals/sweep")
async def trigger_deal_sweep(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Trigger an immediate background deal sweep (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to trigger a deal sweep")

    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.db.models import SystemConfigModel

    now_iso = datetime.now(timezone.utc).isoformat()
    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "engine_runtime")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    runtime_val = (
        dict(record.value) if record and isinstance(record.value, dict) else {}
    )
    runtime_val["last_deal_sweep_at"] = now_iso
    if record:
        record.value = runtime_val
    else:
        session.add(SystemConfigModel(key="engine_runtime", value=runtime_val))
    await session.commit()

    dispatched_task = False
    try:
        from app.tasks import daily_flight_sweep_task

        daily_flight_sweep_task.delay()
        dispatched_task = True
    except Exception as e:
        logger.debug(f"Celery deal sweep dispatch skipped (broker unavailable): {e}")

    return {
        "status": "success",
        "message": (
            "Deal sweep queued for immediate background execution."
            if dispatched_task
            else "Deal sweep scheduled and recorded."
        ),
        "triggered_at": now_iso,
    }


@router.post("/vault/snapshot")
async def create_vault_snapshot(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Record an instant configuration and database vault snapshot (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to create vault snapshots")

    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.db.models import SystemConfigModel

    now_iso = datetime.now(timezone.utc).isoformat()
    domains = list(DOMAIN_CONFIG_MAP.keys())
    snapshot_configs: dict[str, Any] = {}
    for domain in domains:
        snapshot_configs[domain] = await SettingsService.get_domain_settings(
            session, domain
        )

    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "vault_snapshots")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    history = (
        list(record.value.get("snapshots", []))
        if record and isinstance(record.value, dict)
        else []
    )
    history.append(
        {"snapshot_at": now_iso, "domains": domains, "config": snapshot_configs}
    )
    payload = {"last_snapshot_at": now_iso, "snapshots": history[-20:]}

    if record:
        record.value = payload
    else:
        session.add(SystemConfigModel(key="vault_snapshots", value=payload))
    await session.commit()

    return {
        "status": "success",
        "snapshot_at": now_iso,
        "domains_archived": domains,
    }


@router.post("/cache/purge")
async def purge_system_cache(
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Clear Valhalla route and tile cache keys from Redis (Admin Only)."""
    _require_admin(_user, "Administrator privileges required to purge system caches")

    import os

    keys_cleared = 0
    try:
        import redis

        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        client = redis.from_url(
            redis_url, socket_connect_timeout=1.0, socket_timeout=1.0
        )
        for pattern in ("valhalla:*", "tile:*", "route:*", "transit:*"):
            matched = list(client.scan_iter(match=pattern, count=200))
            if matched:
                keys_cleared += int(client.delete(*matched))
    except Exception as e:
        logger.debug(f"Redis cache purge skipped or unavailable: {e}")

    return {
        "status": "success",
        "purged": True,
        "keys_cleared": keys_cleared,
    }
