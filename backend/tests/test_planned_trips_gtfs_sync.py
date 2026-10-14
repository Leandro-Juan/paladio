import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.db.models import TransitCacheModel, TransitCacheStatus


@pytest.mark.asyncio
async def test_planned_trips_transit_status_and_sync(
    async_client: AsyncClient, test_db_session
):
    uid = uuid.uuid4().hex[:8]
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

    # 1. Create a trip with destination "Kyoto" (not in cache -> NOT_DOWNLOADED)
    res1 = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Kyoto",
            "start_date": "2026-11-01",
            "end_date": "2026-11-07",
            "itinerary_data": {"city": "Kyoto"},
        },
        headers=headers,
    )
    assert res1.status_code == 201
    trip1_id = res1.json()["id"]

    # 2. Pre-seed TransitCache for "Tokyo" as READY
    tokyo_cache = TransitCacheModel(
        city="tokyo",
        status=TransitCacheStatus.READY.value,
        osm_status="READY",
        gtfs_status="READY",
    )
    test_db_session.add(tokyo_cache)
    await test_db_session.commit()

    # Create a trip with destination "Tokyo"
    res2 = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Tokyo",
            "start_date": "2026-12-01",
            "end_date": "2026-12-07",
            "itinerary_data": {"city": "Tokyo"},
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

    kyoto_item = next((item for item in items if item["trip_id"] == trip1_id), None)
    assert kyoto_item is not None
    assert kyoto_item["city_clean"] == "kyoto"
    assert kyoto_item["is_downloaded"] is False
    assert kyoto_item["gtfs_status"] in ("NOT_DOWNLOADED", "PENDING")

    tokyo_item = next((item for item in items if item["trip_id"] == trip2_id), None)
    assert tokyo_item is not None
    assert tokyo_item["city_clean"] == "tokyo"
    assert tokyo_item["is_downloaded"] is True
    assert tokyo_item["gtfs_status"] == "READY"

    # 4. Test POST /api/v1/trips/transit/sync-planned
    with patch("app.tasks.build_city_gtfs_task.delay") as mock_delay:
        mock_task = MagicMock()
        mock_task.id = "mock-celery-task-id"
        mock_delay.return_value = mock_task

        sync_res = await async_client.post(
            "/api/v1/trips/transit/sync-planned",
            json={"cities": ["Kyoto", "Tokyo"]},
            headers=headers,
        )
        assert sync_res.status_code == 200, sync_res.text
        data = sync_res.json()
        assert "tokyo" in data["already_ready"]
        assert "kyoto" in data["triggered"] or "kyoto" in data["queued"]
        assert (
            "initiated" in data["message"].lower()
            or "already" in data["message"].lower()
        )
