import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from app.api.system import router as system_router

from app.core.security import create_access_token
from app.db.models import UserModel
import uuid

from app.db.session import get_db

app = FastAPI()
app.include_router(system_router, prefix="/api/system")


@pytest.fixture
async def admin_token(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    admin_id = str(uuid.uuid4())
    admin_user = UserModel(
        id=admin_id,
        email=f"admin_{admin_id[:8]}@example.com",
        username=f"admin_{admin_id[:8]}",
        hashed_password="fakehashedpwd",
        role="admin",
        is_active=True,
    )
    db_session.add(admin_user)
    await db_session.commit()
    return create_access_token(subject=admin_id, extra_claims={"role": "admin"})


@pytest.fixture
async def regular_user_token(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        email=f"user_{user_id[:8]}@example.com",
        username=f"user_{user_id[:8]}",
        hashed_password="fakehashedpwd",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return create_access_token(subject=user_id, extra_claims={"role": "user"})


@pytest.mark.asyncio
async def test_admin_restriction_on_vault_settings(regular_user_token, admin_token):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Non-admin should be forbidden (403)
        res_forbidden = await client.get(
            "/api/system/settings/vault",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert res_forbidden.status_code == 403

        # Admin should succeed (200)
        res_admin = await client.get(
            "/api/system/settings/vault",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res_admin.status_code == 200
        data = res_admin.json()
        assert data["domain"] == "vault"
        assert "immich_enabled" in data["config"]


@pytest.mark.asyncio
async def test_admin_restriction_on_notifications_settings(
    regular_user_token, admin_token
):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Non-admin forbidden
        res_forbidden = await client.get(
            "/api/system/settings/notifications",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert res_forbidden.status_code == 403

        # Admin succeeds
        res_admin = await client.get(
            "/api/system/settings/notifications",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res_admin.status_code == 200
        data = res_admin.json()
        assert data["domain"] == "notifications"
        assert "pushify" in data["config"]


@pytest.mark.asyncio
async def test_admin_update_notifications_settings(regular_user_token, admin_token):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "pushify": {
                "enabled": True,
                "endpoint_url": "https://api.pushify.net/api/v1/send",
                "api_key": "my-secret-key",
                "channel": "travelers",
            }
        }
        # Non-admin blocked
        res_blocked = await client.post(
            "/api/system/settings/notifications",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            json=payload,
        )
        assert res_blocked.status_code == 403

        # Admin updates
        res_admin = await client.post(
            "/api/system/settings/notifications",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
        )
        assert res_admin.status_code == 200
        cfg = res_admin.json()["config"]
        assert cfg["pushify"]["enabled"] is True
        assert cfg["pushify"]["channel"] == "travelers"


@pytest.mark.asyncio
async def test_photo_sync_test_endpoint(regular_user_token, admin_token):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Non-admin blocked
        res_blocked = await client.post(
            "/api/system/photo-sync/test",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            json={"provider": "immich", "url": "https://immich.test", "api_key": "abc"},
        )
        assert res_blocked.status_code == 403

        # Admin calls endpoint (empty url returns error handled gracefully by service)
        res_admin = await client.post(
            "/api/system/photo-sync/test",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"provider": "immich", "url": "", "api_key": ""},
        )
        assert res_admin.status_code == 200
        assert res_admin.json()["success"] is False
