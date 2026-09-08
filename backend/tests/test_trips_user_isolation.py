import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trips_user_isolation(async_client: AsyncClient):
    # Register User A
    res_a = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "usera@paladio.com",
            "username": "usera",
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
            "email": "userb@paladio.com",
            "username": "userb",
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

    # User A lists trips -> should only see Trip A
    trips_a_res = await async_client.get("/api/v1/trips/", headers=headers_a)
    assert trips_a_res.status_code == 200
    trips_a_ids = [t["id"] for t in trips_a_res.json()]
    assert trip_a_id in trips_a_ids
    assert trip_b_id not in trips_a_ids

    # User B lists trips -> should only see Trip B
    trips_b_res = await async_client.get("/api/v1/trips/", headers=headers_b)
    assert trips_b_res.status_code == 200
    trips_b_ids = [t["id"] for t in trips_b_res.json()]
    assert trip_b_id in trips_b_ids
    assert trip_a_id not in trips_b_ids

    # User B attempts to fetch User A's trip -> should return 404
    get_unauth_res = await async_client.get(
        f"/api/v1/trips/{trip_a_id}", headers=headers_b
    )
    assert get_unauth_res.status_code == 404

    # User B attempts to delete User A's trip -> should return 404
    del_unauth_res = await async_client.delete(
        f"/api/v1/trips/{trip_a_id}", headers=headers_b
    )
    assert del_unauth_res.status_code == 404

    # User A successfully fetches their own trip
    get_auth_res = await async_client.get(
        f"/api/v1/trips/{trip_a_id}", headers=headers_a
    )
    assert get_auth_res.status_code == 200
    assert get_auth_res.json()["destination"] == "Rome"

    # User A deletes their own trip
    del_auth_res = await async_client.delete(
        f"/api/v1/trips/{trip_a_id}", headers=headers_a
    )
    assert del_auth_res.status_code == 200
