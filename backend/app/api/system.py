import logging
from typing import Any

from app.api.deps import get_optional_user
from app.db.models import UserModel
from app.db.session import get_db
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
