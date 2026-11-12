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


class UpdateSecretPayload(BaseModel):
    secret_type: str = Field(..., description="Secret type identifier ('aviasales')")
    token: str = Field(..., description="API key or token to save")


class TestSecretPayload(BaseModel):
    token: str | None = Field(
        None, description="Optional raw token to test before saving"
    )


def mask_secret_token(token: str | None) -> str | None:
    if not token:
        return None
    token = token.strip()
    if len(token) <= 8:
        return "•" * len(token)
    return f"{'•' * (len(token) - 4)}{token[-4:]}"


@router.get("/secrets")
async def get_system_secrets(
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Retrieve status and obfuscated values of configured external API secrets."""
    from app.db.models import SystemConfigModel
    from app.engine.market.config import get_travelpayouts_token, config
    from sqlalchemy import select

    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()
    secrets_dict = record.value if record and isinstance(record.value, dict) else {}

    db_aviasales = secrets_dict.get("aviasales", {})
    db_token = db_aviasales.get("token")
    updated_at = db_aviasales.get("updated_at")

    if db_token is not None:
        active_token = db_token
        source = "database" if db_token else "not_configured"
    else:
        active_token = get_travelpayouts_token() or config.TRAVELPAYOUTS_TOKEN
        source = "env" if active_token else "not_configured"

    is_configured = bool(active_token and active_token.strip())

    return {
        "status": "success",
        "secrets": {
            "aviasales": {
                "provider": "aviasales",
                "label": "Aviasales / Travelpayouts Data API",
                "description": "Used for 11-month forward flight price sweeps, price drop detection, and live fare verification.",
                "configured": is_configured,
                "masked_token": mask_secret_token(active_token)
                if is_configured
                else None,
                "source": source,
                "updated_at": updated_at,
            }
        },
    }


@router.post("/secrets")
async def update_system_secret(
    payload: UpdateSecretPayload,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Persist or update an external API secret and update runtime engine state."""
    from app.db.models import SystemConfigModel
    from app.engine.market.config import set_runtime_aviasales_token
    from datetime import datetime, timezone
    from sqlalchemy import select

    secret_type = payload.secret_type.strip().lower()
    raw_token = payload.token.strip()

    if secret_type != "aviasales":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported secret type: '{payload.secret_type}'. Supported: 'aviasales'",
        )

    if not raw_token:
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

    secrets_dict["aviasales"] = {
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

    # Immediately activate in memory for running engine
    set_runtime_aviasales_token(raw_token)

    return {
        "status": "success",
        "secret": {
            "provider": "aviasales",
            "label": "Aviasales / Travelpayouts Data API",
            "description": "Used for 11-month forward flight price sweeps, price drop detection, and live fare verification.",
            "configured": True,
            "masked_token": mask_secret_token(raw_token),
            "source": "database",
            "updated_at": now_iso,
        },
    }


@router.delete("/secrets/{secret_type}")
async def delete_system_secret(
    secret_type: str,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Delete a configured external API secret and clear it from the runtime engine."""
    from app.db.models import SystemConfigModel
    from app.engine.market.config import set_runtime_aviasales_token
    from sqlalchemy import select

    stype = secret_type.strip().lower()
    if stype != "aviasales":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported secret type: '{secret_type}'. Supported: 'aviasales'",
        )

    stmt = select(SystemConfigModel).where(SystemConfigModel.key == "secrets")
    res = await session.execute(stmt)
    record = res.scalar_one_or_none()

    if record and isinstance(record.value, dict):
        secrets_dict = dict(record.value)
        secrets_dict["aviasales"] = {"token": "", "updated_at": None}
        record.value = secrets_dict
        await session.commit()

    # Clear runtime token
    set_runtime_aviasales_token("")

    return {
        "status": "success",
        "secret": {
            "provider": "aviasales",
            "label": "Aviasales / Travelpayouts Data API",
            "description": "Used for 11-month forward flight price sweeps, price drop detection, and live fare verification.",
            "configured": False,
            "masked_token": None,
            "source": "not_configured",
            "updated_at": None,
        },
    }


@router.post("/secrets/test/{secret_type}")
async def test_system_secret(
    secret_type: str,
    payload: TestSecretPayload | None = None,
    session: AsyncSession = Depends(get_db),
    _user: UserModel | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Test connectivity of an API secret with live provider validation."""
    from app.db.models import SystemConfigModel
    from app.engine.market.config import get_travelpayouts_token
    from app.engine.market.providers.aviasales import AviasalesProvider
    from sqlalchemy import select

    stype = secret_type.strip().lower()
    if stype != "aviasales":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported secret type: '{secret_type}'. Supported: 'aviasales'",
        )

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
