import uuid
from unittest.mock import AsyncMock
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trip_collections_lifecycle(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        "app.tasks.async_trigger_city_gtfs_download_if_needed",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.engine.city_readiness.ensure_city_ready",
        AsyncMock(return_value=None),
    )
    uid = uuid.uuid4().hex[:8]

    # 1. Register a test user
    res_reg = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"coll_user_{uid}@paladio.com",
            "username": f"coll_user_{uid}",
            "password": "passwordColl123",
        },
    )
    assert res_reg.status_code == 201, res_reg.text
    token = res_reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a test trip
    create_trip_res = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Rome",
            "start_date": "2026-10-10",
            "end_date": "2026-10-15",
            "itinerary_data": {"days": []},
        },
        headers=headers,
    )
    assert create_trip_res.status_code == 201
    trip_id = create_trip_res.json()["id"]

    # 3. Check existing shared collections
    list_res = await async_client.get(
        f"/api/trips/{trip_id}/collections", headers=headers
    )
    assert list_res.status_code == 200
    assert isinstance(list_res.json(), list)

    # 4. Create collection 1: "Must-See Museums"
    col1_res = await async_client.post(
        f"/api/trips/{trip_id}/collections",
        json={
            "name": "Must-See Museums",
            "description": "Top tier historical landmarks and galleries",
            "color": "#0F4C5C",
        },
        headers=headers,
    )
    assert col1_res.status_code == 201
    col1_data = col1_res.json()
    col1_id = col1_data["id"]
    assert col1_data["name"] == "Must-See Museums"
    assert col1_data["color"] == "#0F4C5C"
    assert col1_data["items_count"] == 0

    # 5. Create collection 2: "Cafes & Pastries"
    col2_res = await async_client.post(
        f"/api/trips/{trip_id}/collections",
        json={
            "name": "Cafes & Pastries",
            "description": "Espresso spots and local bakeries",
            "color": "#E36414",
        },
        headers=headers,
    )
    assert col2_res.status_code == 201
    col2_id = col2_res.json()["id"]

    # 6. Update collection 1
    update_res = await async_client.put(
        f"/api/trips/{trip_id}/collections/{col1_id}",
        json={"name": "Iconic Sights & Museums", "color": "#1B8FA6"},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Iconic Sights & Museums"
    assert update_res.json()["color"] == "#1B8FA6"

    # 7. Add POIs to collection 1
    add_item1 = await async_client.post(
        f"/api/trips/{trip_id}/collections/{col1_id}/items",
        json={"poi_id": "rome-colosseum-01", "notes": "Book morning slot"},
        headers=headers,
    )
    assert add_item1.status_code == 201
    assert add_item1.json()["poi_id"] == "rome-colosseum-01"
    assert add_item1.json()["notes"] == "Book morning slot"
    assert add_item1.json()["visit_status"] == "want_to_go"
    assert add_item1.json()["poi"] is not None

    # 7b. Update visit_status to 'visited' and verify persistence
    patch_visited = await async_client.patch(
        f"/api/trips/{trip_id}/collections/{col1_id}/items/rome-colosseum-01",
        json={"visit_status": "visited"},
        headers=headers,
    )
    assert patch_visited.status_code == 200
    assert patch_visited.json()["visit_status"] == "visited"

    add_item2 = await async_client.post(
        f"/api/trips/{trip_id}/collections/{col1_id}/items",
        json={"poi_id": "rome-pantheon-02"},
        headers=headers,
    )
    assert add_item2.status_code == 201
    assert add_item2.json()["poi_id"] == "rome-pantheon-02"

    # 8. Add POI to collection 2
    add_cafe = await async_client.post(
        f"/api/trips/{trip_id}/collections/{col2_id}/items",
        json={"poi_id": "rome-caffe-greco"},
        headers=headers,
    )
    assert add_cafe.status_code == 201

    # 9. Verify listing includes populated items and counts
    cols_res = await async_client.get(
        f"/api/trips/{trip_id}/collections", headers=headers
    )
    assert cols_res.status_code == 200
    cols = cols_res.json()
    assert any(c["id"] == col1_id for c in cols)
    assert any(c["id"] == col2_id for c in cols)

    c1 = next(c for c in cols if c["id"] == col1_id)
    assert c1["items_count"] == 2
    assert len(c1["items"]) == 2
    colosseum_item = next(
        it for it in c1["items"] if it["poi_id"] == "rome-colosseum-01"
    )
    assert colosseum_item["visit_status"] == "visited"

    c2 = next(c for c in cols if c["id"] == col2_id)
    assert c2["items_count"] == 1

    # 10. Check get POI collections
    poi_col_res = await async_client.get(
        f"/api/trips/{trip_id}/pois/rome-colosseum-01/collections",
        headers=headers,
    )
    assert poi_col_res.status_code == 200
    assert col1_id in poi_col_res.json()["collection_ids"]
    assert col2_id not in poi_col_res.json()["collection_ids"]

    # 11. Toggle POI in collection
    # Add colosseum to col2 via toggle
    toggle_res1 = await async_client.post(
        f"/api/trips/{trip_id}/pois/rome-colosseum-01/toggle",
        json={"collection_id": col2_id},
        headers=headers,
    )
    assert toggle_res1.status_code == 200
    assert toggle_res1.json()["saved"] is True
    assert col2_id in toggle_res1.json()["collection_ids"]

    # Toggle colosseum out of col2
    toggle_res2 = await async_client.post(
        f"/api/trips/{trip_id}/pois/rome-colosseum-01/toggle",
        json={"collection_id": col2_id},
        headers=headers,
    )
    assert toggle_res2.status_code == 200
    assert toggle_res2.json()["saved"] is False
    assert col2_id not in toggle_res2.json()["collection_ids"]

    # 12. Remove single item
    del_item_res = await async_client.delete(
        f"/api/trips/{trip_id}/collections/{col1_id}/items/rome-pantheon-02",
        headers=headers,
    )
    assert del_item_res.status_code == 204

    # Verify count decremented
    cols_res_after = await async_client.get(
        f"/api/trips/{trip_id}/collections", headers=headers
    )
    c1_after = next(c for c in cols_res_after.json() if c["id"] == col1_id)
    assert c1_after["items_count"] == 1
    assert c1_after["items"][0]["poi_id"] == "rome-colosseum-01"

    # 13. Delete collection 1
    del_col_res = await async_client.delete(
        f"/api/trips/{trip_id}/collections/{col1_id}",
        headers=headers,
    )
    assert del_col_res.status_code == 204

    # Verify collection 1 is gone
    final_cols_res = await async_client.get(
        f"/api/trips/{trip_id}/collections", headers=headers
    )
    final_cols = final_cols_res.json()
    assert all(c["id"] != col1_id for c in final_cols)
    assert any(c["id"] == col2_id for c in final_cols)

    # 14. 404 handling
    bad_trip_res = await async_client.get(
        "/api/trips/non-existent-trip-id/collections", headers=headers
    )
    assert bad_trip_res.status_code == 404

    # 15. Cross-trip saved-collections endpoint
    saved_cols_res = await async_client.get(
        "/api/trips/saved-collections", headers=headers
    )
    assert saved_cols_res.status_code == 200
    saved_cols = saved_cols_res.json()
    assert isinstance(saved_cols, list)
    matching = [c for c in saved_cols if c["id"] == col2_id]
    assert len(matching) == 1
    assert matching[0]["trip_destination"] == "Rome"
    assert matching[0]["trip_id"] == trip_id

    # 16. Shared collections: Different user and different trip can view and modify collection
    user2_uid = f"user2_{uuid.uuid4().hex[:6]}"
    res_reg2 = await async_client.post(
        "/api/auth/register",
        json={
            "email": f"{user2_uid}@example.com",
            "username": f"{user2_uid}",
            "password": "Password123!",
        },
    )
    assert res_reg2.status_code == 201
    headers2 = {"Authorization": f"Bearer {res_reg2.json()['access_token']}"}

    create_trip2_res = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Tokyo",
            "start_date": "2026-11-01",
            "end_date": "2026-11-07",
            "itinerary_data": {"days": []},
        },
        headers=headers2,
    )
    assert create_trip2_res.status_code == 201
    trip2_id = create_trip2_res.json()["id"]

    # Trip 2 lists all shared collections, so col2_id is visible
    trip2_cols_res = await async_client.get(
        f"/api/trips/{trip2_id}/collections", headers=headers2
    )
    assert trip2_cols_res.status_code == 200
    shared_matching = [c for c in trip2_cols_res.json() if c["id"] == col2_id]
    assert len(shared_matching) == 1

    # User 2 in Trip 2 can toggle a Tokyo POI into col2_id (created in Rome by User 1)
    toggle_trip2_res = await async_client.post(
        f"/api/trips/{trip2_id}/pois/tokyo-shinjuku-01/toggle",
        json={"collection_id": col2_id},
        headers=headers2,
    )
    assert toggle_trip2_res.status_code == 200
    assert toggle_trip2_res.json()["saved"] is True

    # User 2 saved-collections endpoint displays col2_id with the new POI
    saved_cols_user2 = await async_client.get(
        "/api/trips/saved-collections", headers=headers2
    )
    assert saved_cols_user2.status_code == 200
    col2_for_user2 = next(c for c in saved_cols_user2.json() if c["id"] == col2_id)
    assert any(it["poi_id"] == "tokyo-shinjuku-01" for it in col2_for_user2["items"])
