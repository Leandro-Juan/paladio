import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from app.db.models import TransitCacheModel, TransitCacheStatus, TripModel


@pytest.mark.asyncio
async def test_transit_status_by_city(async_client: AsyncClient, db_session):
    # Ensure clean state for test city
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "valencia")
    )
    await db_session.commit()

    valencia_cache = TransitCacheModel(
        city="valencia",
        status=TransitCacheStatus.READY.value,
        osm_status="READY",
        gtfs_status="READY",
    )
    db_session.add(valencia_cache)
    await db_session.commit()

    res = await async_client.get("/api/v1/trips/transit-status?city=Valencia")
    assert res.status_code == 200
    data = res.json()
    assert data["city"] == "valencia"
    assert data["gtfs_status"] == "READY"
    assert data["is_ready"] is True

    res_unknown = await async_client.get(
        "/api/v1/trips/transit-status?city=UnknownCity"
    )
    assert res_unknown.status_code == 200
    data_unknown = res_unknown.json()
    assert data_unknown["city"] == "unknowncity"
    assert data_unknown["gtfs_status"] == "PENDING"
    assert data_unknown["is_ready"] is False


@pytest.mark.asyncio
async def test_transit_status_by_trip_id(async_client: AsyncClient, db_session):
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "berlin")
    )
    await db_session.execute(
        delete(TripModel).where(TripModel.id == "test-trip-berlin")
    )
    await db_session.commit()

    berlin_cache = TransitCacheModel(
        city="berlin",
        status=TransitCacheStatus.BUILDING.value,
        osm_status="READY",
        gtfs_status="BUILDING",
    )
    db_session.add(berlin_cache)

    trip = TripModel(
        id="test-trip-berlin",
        destination="Berlin",
        start_date="2026-10-01",
        end_date="2026-10-05",
        itinerary_data={"days": []},
    )
    db_session.add(trip)
    await db_session.commit()

    res = await async_client.get("/api/v1/trips/test-trip-berlin/transit-status")
    assert res.status_code == 200
    data = res.json()
    assert data["city"] == "berlin"
    assert data["gtfs_status"] == "BUILDING"
    assert data["is_ready"] is False

    res_404 = await async_client.get("/api/v1/trips/non-existent-id/transit-status")
    assert res_404.status_code == 404
