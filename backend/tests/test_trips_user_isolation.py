import pytest
from httpx import AsyncClient


import uuid


@pytest.mark.asyncio
async def test_trips_user_isolation(async_client: AsyncClient):
    uid = uuid.uuid4().hex[:8]
    # Register User A
    res_a = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"usera_{uid}@paladio.com",
            "username": f"usera_{uid}",
            "password": "passwordA123",
        },
    )
    assert res_a.status_code == 201, res_a.text
    token_a = res_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Register User B
    res_b = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"userb_{uid}@paladio.com",
            "username": f"userb_{uid}",
            "password": "passwordB123",
        },
    )
    assert res_b.status_code == 201, res_b.text
    token_b = res_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates Trip A
    trip_a_payload = {
        "destination": "Rome",
        "start_date": "2026-10-01",
        "end_date": "2026-10-05",
        "itinerary_data": {"city": "Rome", "days": 5},
    }
    create_a_res = await async_client.post(
        "/api/v1/trips/", json=trip_a_payload, headers=headers_a
    )
    assert create_a_res.status_code == 201
    trip_a_id = create_a_res.json()["id"]

    # User B creates Trip B
    trip_b_payload = {
        "destination": "Tokyo",
        "start_date": "2026-11-01",
        "end_date": "2026-11-10",
        "itinerary_data": {"city": "Tokyo", "days": 10},
    }
    create_b_res = await async_client.post(
        "/api/v1/trips/", json=trip_b_payload, headers=headers_b
    )
    assert create_b_res.status_code == 201
    trip_b_id = create_b_res.json()["id"]

    # Universal access: User A lists trips -> should see both trips
    trips_a_res = await async_client.get("/api/v1/trips/", headers=headers_a)
    assert trips_a_res.status_code == 200
    trips_a_ids = [t["id"] for t in trips_a_res.json()]
    assert trip_a_id in trips_a_ids
    assert trip_b_id in trips_a_ids

    # Universal access: User B lists trips -> should see both trips
    trips_b_res = await async_client.get("/api/v1/trips/", headers=headers_b)
    assert trips_b_res.status_code == 200
    trips_b_ids = [t["id"] for t in trips_b_res.json()]
    assert trip_b_id in trips_b_ids
    assert trip_a_id in trips_b_ids

    # Universal access: User B fetches User A's trip -> should succeed with 200
    get_res = await async_client.get(f"/api/v1/trips/{trip_a_id}", headers=headers_b)
    assert get_res.status_code == 200
    assert get_res.json()["destination"] == "Rome"

    # Universal access: User B deletes trip -> succeeds
    del_res = await async_client.delete(f"/api/v1/trips/{trip_a_id}", headers=headers_b)
    assert del_res.status_code == 200
