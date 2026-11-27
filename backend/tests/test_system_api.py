import uuid
from unittest.mock import AsyncMock, patch

import pytest
from app.core.security import create_access_token
from app.db.models import SystemConfigModel, UserModel
from sqlalchemy import delete


async def _create_auth_headers(db_session, role: str) -> dict[str, str]:
    uid = str(uuid.uuid4())
    user = UserModel(
        id=uid,
        email=f"sys_{role}_{uid[:8]}@example.com",
        username=f"sys_{role}_{uid[:8]}",
        hashed_password="fakehashedpwd",
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    token = create_access_token(subject=uid, extra_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_update_status(async_client, db_session):
    unauth = await async_client.get("/api/system/update/status")
    assert unauth.status_code == 401

    user_headers = await _create_auth_headers(db_session, "user")
    response = await async_client.get("/api/system/update/status", headers=user_headers)
    assert response.status_code == 200
    data = response.json()
    assert "current_version" in data
    assert "auto_update_enabled" in data
    assert data["github_repo"] == "Leandro-Juan/paladio"


@pytest.mark.asyncio
async def test_update_config_stop_and_resume(async_client, db_session):
    admin_headers = await _create_auth_headers(db_session, "admin")

    # 1. Stop automatic updates
    res = await async_client.post(
        "/api/system/update/config",
        headers=admin_headers,
        json={"auto_update_enabled": False, "check_interval_hours": 12},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["config"]["auto_update_enabled"] is False
    assert body["config"]["check_interval_hours"] == 12

    # 2. Check status reflects stopped state
    status_res = await async_client.get(
        "/api/system/update/status", headers=admin_headers
    )
    assert status_res.status_code == 200
    assert status_res.json()["auto_update_enabled"] is False

    # 3. Resume automatic updates
    res2 = await async_client.post(
        "/api/system/update/config",
        headers=admin_headers,
        json={"auto_update_enabled": True},
    )
    assert res2.status_code == 200
    assert res2.json()["config"]["auto_update_enabled"] is True


@pytest.mark.asyncio
async def test_trigger_update_check_and_download(async_client, db_session):
    admin_headers = await _create_auth_headers(db_session, "admin")

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

        res = await async_client.post(
            "/api/system/update/check?force_download=false", headers=admin_headers
        )
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
            headers=admin_headers,
            json={"version": "2.1.0"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert body["download"]["download_status"] == "downloaded"


@pytest.mark.asyncio
async def test_system_admin_endpoints_enforce_auth_and_reject_ssrf_and_key_exfil(
    async_client, db_session
):
    user_headers = await _create_auth_headers(db_session, "user")
    admin_headers = await _create_auth_headers(db_session, "admin")

    # 1. Unauthenticated and non-admin callers are blocked from admin endpoints
    unauth_cfg = await async_client.post(
        "/api/system/update/config", json={"auto_update_enabled": True}
    )
    assert unauth_cfg.status_code == 401
    non_admin_cfg = await async_client.post(
        "/api/system/update/config",
        headers=user_headers,
        json={"auto_update_enabled": True},
    )
    assert non_admin_cfg.status_code == 403

    unauth_models = await async_client.post(
        "/api/system/llm/models", json={"provider": "openai"}
    )
    assert unauth_models.status_code == 401
    non_admin_models = await async_client.post(
        "/api/system/llm/models", headers=user_headers, json={"provider": "openai"}
    )
    assert non_admin_models.status_code == 403

    # 2. Updater rejects SSRF / non-GitHub download URLs and invalid github_repo
    bad_repo = await async_client.post(
        "/api/system/update/config",
        headers=admin_headers,
        json={"github_repo": "evil.com/../../etc"},
    )
    assert bad_repo.status_code == 400

    for bad_url in (
        "http://169.254.169.254/latest/meta-data/",
        "https://evil.example/payload.tar.gz",
    ):
        bad_dl = await async_client.post(
            "/api/system/update/download",
            headers=admin_headers,
            json={"version": "3.0.1", "download_url": bad_url},
        )
        assert bad_dl.status_code == 400

    # 3. Calling /llm/models with an attacker base_url and no explicit api_key cannot exfiltrate stored key
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == "llm_config")
    )
    db_session.add(
        SystemConfigModel(
            key="llm_config",
            value={
                "provider": "anthropic",
                "model": "claude-sonnet-5-5",
                "api_key": "sk-ant-secret-key-do-not-leak",
                "provider_keys": {"anthropic": "sk-ant-secret-key-do-not-leak"},
            },
        )
    )
    await db_session.commit()

    with patch("httpx.AsyncClient") as mock_client_cls:
        exfil_res = await async_client.post(
            "/api/system/llm/models",
            headers=admin_headers,
            json={"provider": "anthropic", "base_url": "https://attacker.tld"},
        )
        assert exfil_res.status_code == 200
        body = exfil_res.json()
        assert body["success"] is False
        assert "Explicit API key is required" in body["error"]
        mock_client_cls.assert_not_called()
