from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_get_update_status(async_client):
    response = await async_client.get("/api/system/update/status")
    assert response.status_code == 200
    data = response.json()
    assert "current_version" in data
    assert "auto_update_enabled" in data
    assert data["github_repo"] == "Leandro-Juan/paladio"


@pytest.mark.asyncio
async def test_update_config_stop_and_resume(async_client):
    # 1. Stop automatic updates
    res = await async_client.post(
        "/api/system/update/config",
        json={"auto_update_enabled": False, "check_interval_hours": 12},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["config"]["auto_update_enabled"] is False
    assert body["config"]["check_interval_hours"] == 12

    # 2. Check status reflects stopped state
    status_res = await async_client.get("/api/system/update/status")
    assert status_res.status_code == 200
    assert status_res.json()["auto_update_enabled"] is False

    # 3. Resume automatic updates
    res2 = await async_client.post(
        "/api/system/update/config",
        json={"auto_update_enabled": True},
    )
    assert res2.status_code == 200
    assert res2.json()["config"]["auto_update_enabled"] is True


@pytest.mark.asyncio
async def test_trigger_update_check_and_download(async_client):
    with patch(
        "app.services.updater_service.UpdaterService.check_for_updates",
        new_callable=AsyncMock,
    ) as mock_check:
        mock_check.return_value = {
            "current_version": "2.0.0",
            "latest_version": "2.1.0",
            "update_available": True,
            "download_status": "idle",
        }

        res = await async_client.post("/api/system/update/check?force_download=false")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert body["telemetry"]["latest_version"] == "2.1.0"

    with patch(
        "app.services.updater_service.UpdaterService.download_update",
        new_callable=AsyncMock,
    ) as mock_download:
        mock_download.return_value = {
            "latest_version": "2.1.0",
            "download_status": "downloaded",
            "downloaded_file": "/tmp/paladio-2.1.0.tar.gz",
        }

        res = await async_client.post(
            "/api/system/update/download",
            json={"version": "2.1.0"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert body["download"]["download_status"] == "downloaded"
