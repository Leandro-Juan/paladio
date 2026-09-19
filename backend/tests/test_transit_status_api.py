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


@pytest.mark.asyncio
async def test_transit_registry(async_client: AsyncClient, db_session):
    # Ensure madrid is compiled in test db
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "madrid")
    )
    madrid_cache = TransitCacheModel(
        city="madrid",
        status=TransitCacheStatus.READY.value,
        osm_status="READY",
        gtfs_status="READY",
    )
    db_session.add(madrid_cache)
    await db_session.commit()

    res = await async_client.get("/api/v1/trips/transit/registry")
    assert res.status_code == 200
    data = res.json()
    assert "has_active_process" in data
    assert "active_processes_count" in data
    assert "active_cities" in data
    assert "total_cities" in data
    assert "compiled_cities" in data
    assert "cities" in data
    assert len(data["cities"]) > 0

    # Registry must ONLY include compiled (READY) or downloading (BUILDING) cities
    city_names = [c["city"] for c in data["cities"]]
    assert "madrid" in city_names
    assert "valencia" in city_names
    assert "berlin" in city_names
    # Uncompiled / unmonitored cities must NOT be present
    assert "barcelona" not in city_names


@pytest.mark.asyncio
async def test_trigger_city_gtfs_compile(async_client: AsyncClient, db_session):
    res = await async_client.post(
        "/api/v1/trips/transit/compile",
        json={"city": "madrid"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["triggered", "queued"]
    assert data["city"] == "madrid"
