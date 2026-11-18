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


@pytest.mark.asyncio
@patch("app.tasks.async_trigger_city_gtfs_download_if_needed", new_callable=AsyncMock)
@patch("app.engine.city_readiness.ensure_city_ready", new_callable=AsyncMock)
async def test_trip_revisions_timeline_revert_and_restore(
    mock_city_ready,
    mock_gtfs_download,
    async_client: AsyncClient,
):
    uid = uuid.uuid4().hex[:8]
    username = f"timeline_user_{uid}"

    # 1. Register test user
    res_reg = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"{username}@example.com",
            "username": username,
            "password": "passwordRev123",
        },
    )
    assert res_reg.status_code == 201
    token = res_reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create initial trip (v0)
    res_create = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Kyoto",
            "start_date": "2026-12-01",
            "end_date": "2026-12-05",
            "itinerary_data": {
                "title": "Kyoto Initial",
                "destination": "Kyoto",
                "notes": "Bring camera",
                "budget": 1500,
                "currency": "EUR",
                "days": [],
                "travel_constraints": {
                    "title": "Kyoto Initial",
                    "destination_city": "Kyoto",
                    "budget_usd": 1500,
                    "currency": "EUR",
                    "pace": "balanced",
                },
            },
        },
        headers=headers,
    )
    assert res_create.status_code == 201
    trip = res_create.json()
    trip_id = trip["id"]
    assert trip["revision"] == 0

    # 3. Revision 1: Change title & status
    v1_itin = dict(trip["itinerary_data"])
    v1_itin["title"] = "Kyoto Autumn V2"
    v1_itin["travel_constraints"] = {
        **v1_itin["travel_constraints"],
        "title": "Kyoto Autumn V2",
    }
    res_v1 = await async_client.put(
        f"/api/trips/{trip_id}",
        json={
            "status": "archived",
            "itinerary_data": v1_itin,
            "revision": 0,
        },
        headers=headers,
    )
    assert res_v1.status_code == 200
    assert res_v1.json()["revision"] == 1

    # 4. Revision 2: Change budget & pace
    v2_itin = dict(res_v1.json()["itinerary_data"])
    v2_itin["budget"] = 2400
    v2_itin["travel_constraints"] = {
        **v2_itin["travel_constraints"],
        "budget_usd": 2400,
        "pace": "packed",
    }
    res_v2 = await async_client.put(
        f"/api/trips/{trip_id}",
        json={
            "itinerary_data": v2_itin,
            "revision": 1,
        },
        headers=headers,
    )
    assert res_v2.status_code == 200
    assert res_v2.json()["revision"] == 2

    # 5. Revision 3: Change notes
    v3_itin = dict(res_v2.json()["itinerary_data"])
    v3_itin["notes"] = "Book Gion tea ceremony"
    res_v3 = await async_client.put(
        f"/api/trips/{trip_id}",
        json={
            "itinerary_data": v3_itin,
            "revision": 2,
        },
        headers=headers,
    )
    assert res_v3.status_code == 200
    assert res_v3.json()["revision"] == 3

    # 6. Fetch revision timeline
    res_list = await async_client.get(
        f"/api/trips/{trip_id}/revisions", headers=headers
    )
    assert res_list.status_code == 200
    timeline = res_list.json()
    assert timeline["trip_id"] == trip_id
    assert timeline["current_revision"] == 3
    items = timeline["items"]
    # v3, v2, v1, v0
    assert [it["revision"] for it in items] == [3, 2, 1, 0]
    assert items[0]["is_current"] is True
    assert items[0]["actor_name"] == username
    assert any(c["field"] == "notes" for c in items[0]["changes"])
    assert any(c["field"] == "budget" for c in items[1]["changes"])
    assert any(c["field"] == "pace" for c in items[1]["changes"])
    assert any(c["field"] == "status" for c in items[2]["changes"])
    assert any(c["field"] == "title" for c in items[2]["changes"])
    assert items[3]["kind"] == "created"
    assert items[3]["can_revert"] is False
    assert items[3]["actor_name"] == username

    # 7. Surgically revert Revision 2 (budget & pace) while keeping Revision 3 (notes) and Revision 1 (title & status)
    rev2_id = items[1]["id"]
    res_revert = await async_client.post(
        f"/api/trips/{trip_id}/revisions/{rev2_id}/revert",
        headers=headers,
    )
    assert res_revert.status_code == 200
    reverted_trip = res_revert.json()
    assert reverted_trip["revision"] == 4
    reverted_itin = reverted_trip["itinerary_data"]
    assert reverted_itin["budget"] == 1500
    assert reverted_itin["travel_constraints"]["budget_usd"] == 1500
    assert reverted_itin["travel_constraints"]["pace"] == "balanced"
    # Preserved from v1 and v3:
    assert reverted_itin["title"] == "Kyoto Autumn V2"
    assert reverted_trip["status"] == "archived"
    assert reverted_itin["notes"] == "Book Gion tea ceremony"

    # 8. Restore back to Version v1 (title = "Kyoto Autumn V2", status = "archived", budget = 1500, notes = "Bring camera")
    res_restore_v1 = await async_client.post(
        f"/api/trips/{trip_id}/revisions/1/restore",
        headers=headers,
    )
    assert res_restore_v1.status_code == 200
    restored_v1 = res_restore_v1.json()
    assert restored_v1["revision"] == 5
    assert restored_v1["status"] == "archived"
    assert restored_v1["itinerary_data"]["title"] == "Kyoto Autumn V2"
    assert restored_v1["itinerary_data"]["notes"] == "Bring camera"
    assert restored_v1["itinerary_data"]["budget"] == 1500

    # 9. Restore back to Version v0 (creation baseline)
    res_restore_v0 = await async_client.post(
        f"/api/trips/{trip_id}/revisions/0/restore",
        headers=headers,
    )
    assert res_restore_v0.status_code == 200
    restored_v0 = res_restore_v0.json()
    assert restored_v0["revision"] == 6
    assert restored_v0["status"] == "active"
    assert restored_v0["itinerary_data"]["title"] == "Kyoto Initial"
    assert restored_v0["itinerary_data"]["notes"] == "Bring camera"
    assert restored_v0["itinerary_data"]["budget"] == 1500

    # 10. Confirm final timeline contains revert & restore entries
    res_list_final = await async_client.get(
        f"/api/trips/{trip_id}/revisions", headers=headers
    )
    assert res_list_final.status_code == 200
    final_items = res_list_final.json()["items"]
    assert [it["revision"] for it in final_items] == [6, 5, 4, 3, 2, 1, 0]
    assert final_items[0]["kind"] == "restore"
    assert final_items[1]["kind"] == "restore"
    assert final_items[2]["kind"] == "revert"
