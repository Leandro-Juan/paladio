import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.db.models import TransitCacheModel, TransitCacheStatus


@pytest.mark.asyncio
async def test_planned_trips_transit_status_and_sync(
    async_client: AsyncClient, db_session
):
    uid = uuid.uuid4().hex[:8]
    city_not_ready = f"citynr_{uid}"
    city_ready = f"cityr_{uid}"

    # Register test user
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"sync_test_{uid}@paladio.com",
            "username": f"sync_{uid}",
            "password": "password123!",
        },
    )
    assert reg_res.status_code == 201, reg_res.text
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a trip with destination city_not_ready
    res1 = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": city_not_ready.title(),
            "start_date": "2026-11-01",
            "end_date": "2026-11-07",
            "itinerary_data": {"city": city_not_ready},
        },
        headers=headers,
    )
    assert res1.status_code == 201
    trip1_id = res1.json()["id"]

    # 2. Pre-seed TransitCache for city_ready as READY
    ready_cache = TransitCacheModel(
        city=city_ready,
        status=TransitCacheStatus.READY.value,
        osm_status="READY",
        gtfs_status="READY",
    )
    db_session.add(ready_cache)
    await db_session.commit()

    # Create a trip with destination city_ready
    res2 = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": city_ready.title(),
            "start_date": "2026-12-01",
            "end_date": "2026-12-07",
            "itinerary_data": {"city": city_ready},
        },
        headers=headers,
    )
    assert res2.status_code == 201
    trip2_id = res2.json()["id"]

    # 3. Call GET /api/v1/trips/transit/planned-status
    status_res = await async_client.get(
        "/api/v1/trips/transit/planned-status",
        headers=headers,
    )
    assert status_res.status_code == 200, status_res.text
    items = status_res.json()
    assert isinstance(items, list)

    nr_item = next((item for item in items if item["trip_id"] == trip1_id), None)
    assert nr_item is not None
    assert nr_item["city_clean"] == city_not_ready
    assert nr_item["is_downloaded"] is False

    r_item = next((item for item in items if item["trip_id"] == trip2_id), None)
    assert r_item is not None
    assert r_item["city_clean"] == city_ready
    assert r_item["is_downloaded"] is True
    assert r_item["gtfs_status"] == "READY"

    # 4. Test POST /api/v1/trips/transit/sync-planned
    with patch("app.tasks.build_city_gtfs_task.delay") as mock_delay:
        mock_task = MagicMock()
        mock_task.id = "mock-celery-task-id"
        mock_delay.return_value = mock_task

        sync_res = await async_client.post(
            "/api/v1/trips/transit/sync-planned",
            json={"cities": [city_not_ready, city_ready]},
            headers=headers,
        )
        assert sync_res.status_code == 200, sync_res.text
        data = sync_res.json()
        assert city_ready in data["already_ready"]
        assert city_not_ready in data["triggered"] or city_not_ready in data["queued"]
        assert (
            "initiated" in data["message"].lower()
            or "already" in data["message"].lower()
        )
