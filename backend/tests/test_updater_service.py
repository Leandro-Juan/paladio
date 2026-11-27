from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from app.db.models import SystemConfigModel
from app.services.updater_service import (
    CONFIG_KEY,
    UpdaterService,
    is_version_newer,
    parse_semver,
)
from sqlalchemy import delete


@pytest.fixture(autouse=True)
async def clean_updater_config(db_session):
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
    )
    await db_session.commit()
    yield


def test_semver_parsing_and_comparison():
    assert parse_semver("v2.0.0") == (2, 0, 0)
    assert parse_semver("2.1.3") == (2, 1, 3)
    assert parse_semver("v3.0.0-rc1") == (3, 0, 0)

    assert is_version_newer("2.1.0", "2.0.0") is True
    assert is_version_newer("2.0.1", "2.0.0") is True
    assert is_version_newer("3.0.0", "2.9.9") is True
    assert is_version_newer("2.0.0", "2.0.0") is False
    assert is_version_newer("1.9.9", "2.0.0") is False


@pytest.mark.asyncio
async def test_updater_state_initialization_and_config_toggle(db_session):
    state = await UpdaterService.get_state(db_session)
    assert state["auto_update_enabled"] is False
    assert state["github_repo"] == "Leandro-Juan/paladio"
    assert "current_version" in state
    assert state["download_status"] == "idle"

    # Enable automatic updates
    updated = await UpdaterService.update_config(
        db_session,
        auto_update_enabled=True,
    )
    assert updated["auto_update_enabled"] is True

    # Verify state reflects enabled status
    refreshed = await UpdaterService.get_state(db_session)
    assert refreshed["auto_update_enabled"] is True

    # Disable / stop automatic updates
    disabled = await UpdaterService.update_config(
        db_session,
        auto_update_enabled=False,
        check_interval_hours=12,
    )
    assert disabled["auto_update_enabled"] is False
    assert disabled["check_interval_hours"] == 12


@pytest.mark.asyncio
async def test_check_for_updates_when_stopped_does_not_download(db_session):
    # Stop automatic updates
    await UpdaterService.update_config(db_session, auto_update_enabled=False)

    fake_release = {
        "tag_name": "v99.0.0",
        "name": "Paladio 99.0.0 Release",
        "body": "Exciting new features and fixes.",
        "html_url": "https://github.com/Leandro-Juan/paladio/releases/tag/v99.0.0",
        "tarball_url": "https://api.github.com/repos/Leandro-Juan/paladio/tarball/v99.0.0",
        "assets": [],
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_release
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_resp

    state = await UpdaterService.check_for_updates(
        db_session,
        force_download=False,
        client=mock_client,
    )

    assert state["latest_version"] == "99.0.0"
    assert state["update_available"] is True
    # Because auto-updates are STOPPED, status should remain idle (no auto-download)
    assert state["download_status"] == "idle"


@pytest.mark.asyncio
async def test_download_update_streams_file(db_session, tmp_path, monkeypatch):
    monkeypatch.setenv("PALADIO_UPDATES_DIR", str(tmp_path))

    fake_archive_bytes = b"MOCK_PALADIO_TARBALL_ARCHIVE_DATA_1234567890"

    mock_stream = MagicMock()
    mock_stream.raise_for_status = MagicMock()

    async def fake_aiter_bytes(chunk_size=65536):
        yield fake_archive_bytes

    mock_stream.aiter_bytes = fake_aiter_bytes

    class MockStreamContext:
        async def __aenter__(self):
            return mock_stream

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.stream.return_value = MockStreamContext()

    state = await UpdaterService.download_update(
        session=db_session,
        download_url="https://api.github.com/repos/Leandro-Juan/paladio/tarball/v3.0.0",
        version="3.0.0",
        client=mock_client,
    )

    assert state["download_status"] == "downloaded"
    assert state["file_size_bytes"] == len(fake_archive_bytes)
    assert state["downloaded_file"] is not None
    assert (tmp_path / "paladio-3.0.0.tar.gz").exists()
    assert (tmp_path / "paladio-3.0.0.tar.gz").read_bytes() == fake_archive_bytes


@pytest.mark.asyncio
async def test_download_update_rejects_untrusted_urls(db_session):
    for bad_url in (
        "http://169.254.169.254/latest/meta-data/",
        "http://github.com/Leandro-Juan/paladio/archive/refs/tags/v3.0.0.tar.gz",
        "https://evil.example/paladio.tar.gz",
    ):
        with pytest.raises(ValueError, match="official HTTPS GitHub"):
            await UpdaterService.download_update(
                session=db_session,
                download_url=bad_url,
                version="3.0.1",
            )


@pytest.mark.asyncio
async def test_periodic_autoupdate_task_checks_and_discovers(db_session):
    from app.tasks import periodic_autoupdate_check_task

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
        res = periodic_autoupdate_check_task()
        assert res["status"] == "completed"
        mock_check.assert_called_once()
