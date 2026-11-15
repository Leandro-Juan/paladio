import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.core.security import create_access_token
from app.db.models import SystemConfigModel, UserModel
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_secrets_api_lifecycle(db_session):
    app.dependency_overrides[get_db] = lambda: db_session

    admin_id = str(uuid.uuid4())
    admin_user = UserModel(
        id=admin_id,
        email=f"secrets_admin_{admin_id[:8]}@example.com",
        username=f"secrets_admin_{admin_id[:8]}",
        hashed_password="fakehashedpwd",
        role="admin",
        is_active=True,
    )
    regular_id = str(uuid.uuid4())
    regular_user = UserModel(
        id=regular_id,
        email=f"secrets_user_{regular_id[:8]}@example.com",
        username=f"secrets_user_{regular_id[:8]}",
        hashed_password="fakehashedpwd",
        role="user",
        is_active=True,
    )
    db_session.add_all([admin_user, regular_user])
    await db_session.commit()

    admin_headers = {
        "Authorization": f"Bearer {create_access_token(subject=admin_id, extra_claims={'role': 'admin'})}"
    }
    user_headers = {
        "Authorization": f"Bearer {create_access_token(subject=regular_id, extra_claims={'role': 'user'})}"
    }

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 0. Non-admin and unauthenticated callers must receive 403 Forbidden
            unauth_resp = await client.get("/api/system/secrets")
            assert unauth_resp.status_code == 403
            non_admin_resp = await client.get(
                "/api/system/secrets", headers=user_headers
            )
            assert non_admin_resp.status_code == 403

            # 1. Clean up secrets row
            await db_session.execute(
                delete(SystemConfigModel).where(SystemConfigModel.key == "secrets")
            )
            await db_session.commit()

            # 2. GET secrets as admin
            resp = await client.get("/api/system/secrets", headers=admin_headers)
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "success"
            assert "aviasales" in data["secrets"]
            av = data["secrets"]["aviasales"]
            assert av["provider"] == "aviasales"
            if av["configured"]:
                assert av["masked_token"] is not None
                assert "•" in av["masked_token"]

            # 3. POST new secret (custom test token)
            test_token = "aviasales_test_token_secret_12345678"
            post_resp = await client.post(
                "/api/system/secrets",
                headers=admin_headers,
                json={"secret_type": "aviasales", "token": test_token},
            )
            assert post_resp.status_code == 200
            post_data = post_resp.json()
            assert post_data["status"] == "success"
            assert post_data["secret"]["configured"] is True
            assert post_data["secret"]["source"] == "database"
            # Must be obfuscated! Last 4 characters only: "5678"
            masked = post_data["secret"]["masked_token"]
            assert masked.endswith("5678")
            assert test_token not in masked
            assert masked.startswith("•" * (len(test_token) - 4))

            # 4. GET secrets again -> must reflect database secret
            get_resp2 = await client.get("/api/system/secrets", headers=admin_headers)
            assert get_resp2.status_code == 200
            data2 = get_resp2.json()
            av2 = data2["secrets"]["aviasales"]
            assert av2["configured"] is True
            assert av2["source"] == "database"
            assert av2["masked_token"] == masked

            # 5. DELETE secret -> must clear
            del_resp = await client.delete(
                "/api/system/secrets/aviasales", headers=admin_headers
            )
            assert del_resp.status_code == 200
            del_data = del_resp.json()
            assert del_data["status"] == "success"
            assert del_data["secret"]["configured"] is False
            assert del_data["secret"]["masked_token"] is None

            # 6. GET secrets after delete -> configured is False
            get_resp3 = await client.get("/api/system/secrets", headers=admin_headers)
            assert get_resp3.status_code == 200
            av3 = get_resp3.json()["secrets"]["aviasales"]
            assert av3["configured"] is False
            assert av3["masked_token"] is None

            # 7. Cleanup so running instance reverts to environment default
            from app.engine.market.config import set_runtime_aviasales_token

            set_runtime_aviasales_token(None)
            await db_session.execute(
                delete(SystemConfigModel).where(SystemConfigModel.key == "secrets")
            )
            await db_session.commit()
    finally:
        app.dependency_overrides.clear()
