import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.photo_sync_service import PhotoSyncService
from app.db.models import SystemConfigModel
from sqlalchemy import delete


@pytest.mark.asyncio
async def test_photo_sync_config(db_session):
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == "vault")
    )
    await db_session.commit()

    cfg = await PhotoSyncService.get_config(db_session)
    assert "immich_enabled" in cfg
    assert cfg["immich_enabled"] is False
    assert cfg["synology_enabled"] is False
    assert cfg["immich_album_name"] == "Paladio Vault"


@pytest.mark.asyncio
async def test_test_immich_connection_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"major": 1, "minor": 105, "patch": 0}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        res = await PhotoSyncService.test_immich_connection(
            url="https://immich.test", api_key="secret-key"
        )
        assert res["success"] is True
        assert "Immich server connected successfully" in res["message"]


@pytest.mark.asyncio
async def test_test_immich_connection_failure():
    res = await PhotoSyncService.test_immich_connection(url="", api_key="")
    assert res["success"] is False
    assert "required" in res["error"]


@pytest.mark.asyncio
async def test_test_synology_connection_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 207

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = mock_resp
        res = await PhotoSyncService.test_synology_connection(
            url="https://nas.test:5006",
            username="admin",
            password="pwd",
            destination_path="/photo/Paladio",
        )
        assert res["success"] is True
        assert "reachable" in res["message"]


@pytest.mark.asyncio
async def test_photo_sync_skip_when_disabled(db_session):
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == "vault")
    )
    await db_session.commit()

    photo_meta = {
        "id": "test-photo-1",
        "filename": "test.jpg",
        "mime_type": "image/jpeg",
    }
    result = await PhotoSyncService.sync_photo(
        session=db_session,
        trip_id="trip-123",
        photo_meta=photo_meta,
        file_bytes=b"fake-bytes",
    )
    assert result["status"] == "completed"
    assert len(result["providers"]) == 0
