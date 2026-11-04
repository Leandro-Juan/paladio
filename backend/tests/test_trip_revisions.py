import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from unittest.mock import AsyncMock, patch

from app.db.models import TripRevisionModel


@pytest.mark.asyncio
@patch("app.tasks.async_trigger_city_gtfs_download_if_needed", new_callable=AsyncMock)
@patch("app.engine.city_readiness.ensure_city_ready", new_callable=AsyncMock)
async def test_optimistic_concurrency_and_revisions(
    mock_city_ready,
    mock_gtfs_download,
    async_client: AsyncClient,
):
    uid = uuid.uuid4().hex[:8]

    # 1. Register test user
    res_reg = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"rev_user_{uid}@example.com",
            "username": f"rev_user_{uid}",
            "password": "passwordRev123",
        },
    )
    assert res_reg.status_code == 201
    token = res_reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create trip
    res_create = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Valencia",
            "start_date": "2026-11-10",
            "end_date": "2026-11-12",
            "itinerary_data": {"days": []},
        },
        headers=headers,
    )
    assert res_create.status_code == 201
    trip_data = res_create.json()
    trip_id = trip_data["id"]
    assert trip_data["revision"] == 0

    # 3. Update trip with matching revision (0)
    res_update_1 = await async_client.put(
        f"/api/trips/{trip_id}",
        json={
            "destination": "Valencia Coast",
            "revision": 0,
        },
        headers=headers,
    )
    assert res_update_1.status_code == 200
    updated_1 = res_update_1.json()
    assert updated_1["destination"] == "Valencia Coast"
    assert updated_1["revision"] == 1

    # 4. Attempt update with stale revision (0 instead of 1) -> Must return 409
    res_stale = await async_client.put(
        f"/api/trips/{trip_id}",
        json={
            "destination": "Valencia Stale",
            "revision": 0,
        },
        headers=headers,
    )
    assert res_stale.status_code == 409
    assert "Stale trip revision" in res_stale.json()["detail"]

    # 5. Update with correct revision (1)
    res_update_2 = await async_client.put(
        f"/api/trips/{trip_id}",
        json={
            "destination": "Valencia City",
            "revision": 1,
        },
        headers=headers,
    )
    assert res_update_2.status_code == 200
    assert res_update_2.json()["revision"] == 2

    # 6. Verify trip_revisions entries in DB
    from app.db.session import async_session

    async with async_session() as session:
        stmt = (
            select(TripRevisionModel)
            .where(TripRevisionModel.trip_id == trip_id)
            .order_by(TripRevisionModel.revision.asc())
        )
        rev_res = await session.execute(stmt)
        revisions = rev_res.scalars().all()
        assert len(revisions) == 2
        assert revisions[0].revision == 1
        assert revisions[0].actor == "user"
        assert revisions[1].revision == 2
