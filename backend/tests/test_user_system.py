import math
import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_user_preferences_and_embedding(async_client: AsyncClient):
    # 1. Register user
    suffix = uuid.uuid4().hex[:8]
    reg_payload = {
        "email": f"preferences_{suffix}@paladio.com",
        "username": f"prefuser_{suffix}",
        "password": "mypassword123",
        "preferences": {"budget": "low", "nature": True},
    }
    reg_res = await async_client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, reg_res.text
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get me preferences
    me_res = await async_client.get("/api/users/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["preferences"] == {"budget": "low", "nature": True}

    # 3. Update preferences
    update_pref_res = await async_client.put(
        "/api/users/me/preferences",
        headers=headers,
        json={"preferences": {"budget": "luxury", "culinary": True, "pace": "relaxed"}},
    )
    assert update_pref_res.status_code == 200
    prefs = update_pref_res.json()["preferences"]
    assert prefs["budget"] == "luxury"
    assert prefs["budget_tier"] == "luxury"
    assert prefs["culinary"] is True
    assert prefs["tag_affinities"]["food_culinary"] == 0.9
    assert prefs["pace"] == "leisurely"
    assert "taste_bio" in prefs

    # 4. Check embedding (768D semantic vector)
    emb_res = await async_client.get("/api/users/me/embedding", headers=headers)
    assert emb_res.status_code == 200
    emb_data = emb_res.json()
    assert emb_data["dimension"] == 768
    assert len(emb_data["embedding"]) == 768

    # 5. Update embedding
    new_embedding = [0.75] * 768
    put_emb_res = await async_client.put(
        "/api/users/me/embedding",
        headers=headers,
        json={"embedding": new_embedding},
    )
    assert put_emb_res.status_code == 200

    # 6. Verify updated embedding
    check_emb_res = await async_client.get("/api/users/me/embedding", headers=headers)
    assert check_emb_res.status_code == 200
    assert check_emb_res.json()["dimension"] == 768
    stored_emb = check_emb_res.json()["embedding"]
    expected_unit_val = 1.0 / math.sqrt(768)
    assert len(stored_emb) == 768
    assert stored_emb == pytest.approx([expected_unit_val] * 768, abs=1e-5)
