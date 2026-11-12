import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.db.session import async_session
from app.db.models import SystemConfigModel
from sqlalchemy import delete


@pytest.mark.asyncio
async def test_secrets_api_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Clean up secrets row
        async with async_session() as session:
            await session.execute(
                delete(SystemConfigModel).where(SystemConfigModel.key == "secrets")
            )
            await session.commit()

        # 2. GET secrets
        resp = await client.get("/api/system/secrets")
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
        get_resp2 = await client.get("/api/system/secrets")
        assert get_resp2.status_code == 200
        data2 = get_resp2.json()
        av2 = data2["secrets"]["aviasales"]
        assert av2["configured"] is True
        assert av2["source"] == "database"
        assert av2["masked_token"] == masked

        # 5. DELETE secret -> must clear
        del_resp = await client.delete("/api/system/secrets/aviasales")
        assert del_resp.status_code == 200
        del_data = del_resp.json()
        assert del_data["status"] == "success"
        assert del_data["secret"]["configured"] is False
        assert del_data["secret"]["masked_token"] is None

        # 6. GET secrets after delete -> configured is False
        get_resp3 = await client.get("/api/system/secrets")
        assert get_resp3.status_code == 200
        av3 = get_resp3.json()["secrets"]["aviasales"]
        assert av3["configured"] is False
        assert av3["masked_token"] is None

        # 7. Cleanup so running instance reverts to environment default
        from app.engine.market.config import set_runtime_aviasales_token

        set_runtime_aviasales_token(None)
        async with async_session() as session:
            await session.execute(
                delete(SystemConfigModel).where(SystemConfigModel.key == "secrets")
            )
            await session.commit()
