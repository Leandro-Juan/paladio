import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_user_preferences_and_embedding(async_client: AsyncClient):
    # 1. Register user
    reg_payload = {
        "email": "preferences@paladio.com",
        "username": "prefuser",
        "password": "mypassword123",
        "preferences": {"budget": "low", "nature": True},
    }
    reg_res = await async_client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, reg_res.text
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get me preferences
    me_res = await async_client.get("/api/v1/users/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["preferences"] == {"budget": "low", "nature": True}

    # 3. Update preferences
    update_pref_res = await async_client.put(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={"preferences": {"budget": "luxury", "culinary": True, "pace": "relaxed"}},
    )
    assert update_pref_res.status_code == 200
    assert update_pref_res.json()["preferences"] == {
        "budget": "luxury",
        "culinary": True,
        "pace": "relaxed",
    }

    # 4. Check embedding
    emb_res = await async_client.get("/api/v1/users/me/embedding", headers=headers)
    assert emb_res.status_code == 200
    emb_data = emb_res.json()
    assert emb_data["dimension"] == 64
    assert len(emb_data["embedding"]) == 64

    # 5. Update embedding
    new_embedding = [0.5] * 64
    put_emb_res = await async_client.put(
        "/api/v1/users/me/embedding",
        headers=headers,
        json={"embedding": new_embedding},
    )
    assert put_emb_res.status_code == 200

    # 6. Verify updated embedding
    check_emb_res = await async_client.get(
        "/api/v1/users/me/embedding", headers=headers
    )
    assert check_emb_res.status_code == 200
    assert check_emb_res.json()["embedding"] == new_embedding
