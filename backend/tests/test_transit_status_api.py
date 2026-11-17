import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
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

    res = await async_client.get("/api/trips/transit-status?city=Valencia")
    assert res.status_code == 200
    data = res.json()
    assert data["city"] == "valencia"
    assert data["gtfs_status"] == "READY"
    assert data["is_ready"] is True

    res_unknown = await async_client.get("/api/trips/transit-status?city=UnknownCity")
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

    res = await async_client.get("/api/trips/test-trip-berlin/transit-status")
    assert res.status_code == 200
    data = res.json()
    assert data["city"] == "berlin"
    assert data["gtfs_status"] == "BUILDING"
    assert data["is_ready"] is False

    res_404 = await async_client.get("/api/trips/non-existent-id/transit-status")
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

    res = await async_client.get("/api/trips/transit/registry")
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


@pytest.mark.live_integration
@pytest.mark.asyncio
async def test_trigger_city_gtfs_compile(async_client: AsyncClient, db_session):
    res = await async_client.post(
        "/api/trips/transit/compile",
        json={"city": "madrid"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["triggered", "queued"]
    assert data["city"] == "madrid"


@pytest.mark.asyncio
async def test_delete_compiled_gtfs(
    async_client: AsyncClient, db_session, monkeypatch, tmp_path
):
    temp_gtfs = tmp_path / "gtfs_feeds"
    city_dir = temp_gtfs / "sevilla"
    city_dir.mkdir(parents=True, exist_ok=True)
    dummy_stop = city_dir / "stops.txt"
    dummy_stop.write_text("stop_id,stop_name\n1,Test Stop\n")
    monkeypatch.setenv("GTFS_BASE_DIR", str(temp_gtfs))

    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "sevilla")
    )
    cache_record = TransitCacheModel(
        city="sevilla",
        status=TransitCacheStatus.READY.value,
        osm_status="READY",
        gtfs_status="READY",
    )
    db_session.add(cache_record)
    await db_session.commit()

    res = await async_client.delete("/api/trips/transit/sevilla")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "deleted"
    assert data["city"] == "sevilla"

    # Verify database record was deleted
    stmt = select(TransitCacheModel).where(TransitCacheModel.city == "sevilla")
    check_db = (await db_session.execute(stmt)).scalar_one_or_none()
    assert check_db is None

    # Verify GTFS directory was deleted
    assert not city_dir.exists()


@pytest.mark.asyncio
async def test_stop_active_compilation_and_clean(
    async_client: AsyncClient, db_session, monkeypatch, tmp_path
):
    temp_gtfs = tmp_path / "gtfs_feeds"
    city_dir = temp_gtfs / "bilbao"
    city_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("GTFS_BASE_DIR", str(temp_gtfs))

    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "bilbao")
    )
    cache_record = TransitCacheModel(
        city="bilbao",
        status=TransitCacheStatus.BUILDING.value,
        osm_status="READY",
        gtfs_status="BUILDING",
    )
    db_session.add(cache_record)
    await db_session.commit()

    res = await async_client.delete("/api/trips/transit/bilbao")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "deleted"
    assert data["city"] == "bilbao"

    # Verify database record deleted
    stmt = select(TransitCacheModel).where(TransitCacheModel.city == "bilbao")
    check_db = (await db_session.execute(stmt)).scalar_one_or_none()
    assert check_db is None
    assert not city_dir.exists()


@pytest.mark.asyncio
async def test_transit_status_unavailable_stops_recompile(
    async_client: AsyncClient, db_session
):
    await db_session.execute(
        delete(TransitCacheModel).where(TransitCacheModel.city == "atlantis")
    )
    cache_record = TransitCacheModel(
        city="atlantis",
        status=TransitCacheStatus.UNAVAILABLE.value,
        osm_status="READY",
        gtfs_status="UNAVAILABLE",
        derived_status="UNAVAILABLE",
    )
    db_session.add(cache_record)
    await db_session.commit()

    # Verify transit status API returns UNAVAILABLE
    res_status = await async_client.get("/api/trips/transit-status?city=atlantis")
    assert res_status.status_code == 200
    data_status = res_status.json()
    assert data_status["city"] == "atlantis"
    assert data_status["gtfs_status"] == "UNAVAILABLE"
    assert data_status["is_ready"] is False

    # Verify compile request is rejected with unavailable message and not re-queued
    res_compile = await async_client.post(
        "/api/trips/transit/compile", json={"city": "atlantis"}
    )
    assert res_compile.status_code == 200
    data_compile = res_compile.json()
    assert data_compile["status"] == "unavailable"
    assert "cannot be downloaded" in data_compile["message"]


@pytest.mark.asyncio
async def test_city_storage_registry_and_delete_pois_preserves_trips(
    async_client: AsyncClient, db_session
):
    from app.db.models import AttractionModel, CityModel, TripModel

    # 1. Clean previous test items
    await db_session.execute(
        delete(AttractionModel).where(AttractionModel.id == "poi-storage-test-1")
    )
    await db_session.execute(
        delete(TripModel).where(TripModel.id == "trip-storage-test-1")
    )
    await db_session.execute(delete(CityModel).where(CityModel.id == "testville_es"))
    await db_session.commit()

    # 2. Seed city, attraction, and trip
    city_rec = CityModel(
        id="testville_es",
        name="Testville",
        country_code="ES",
        center_lat=40.0,
        center_lon=-3.0,
        bbox=[39.9, -3.1, 40.1, -2.9],
        timezone="UTC",
        currency="EUR",
    )
    db_session.add(city_rec)

    poi_rec = AttractionModel(
        id="poi-storage-test-1",
        city="testville",
        city_id="testville_es",
        name="Testville Monument",
        category="monument",
        category_id=1,
        location={"lat": 40.0, "lon": -3.0},
        scoring={"rating": 4.5},
        metadata_field={"source": "test"},
    )
    db_session.add(poi_rec)

    trip_rec = TripModel(
        id="trip-storage-test-1",
        destination="Testville",
        start_date="2027-04-01",
        end_date="2027-04-05",
        itinerary_data={"days": []},
    )
    db_session.add(trip_rec)
    await db_session.commit()

    # 3. Test registry returns full city data and disk/db storage metrics
    res_reg = await async_client.get("/api/trips/transit/registry")
    assert res_reg.status_code == 200
    data_reg = res_reg.json()
    assert data_reg["total_cities"] > 0
    assert "total_disk_bytes" in data_reg
    assert "total_db_bytes" in data_reg
    assert "total_storage_bytes" in data_reg

    testville_items = [c for c in data_reg["cities"] if c["city"] == "testville"]
    assert len(testville_items) == 1
    tv = testville_items[0]
    assert tv["display_name"] == "Testville"
    assert tv["country_code"] == "ES"
    assert tv["poi_count"] >= 1
    assert tv["poi_db_bytes"] > 0
    assert tv["total_storage_bytes"] > 0

    # 4. Delete POIs for testville
    res_del = await async_client.delete("/api/trips/pois/testville")
    assert res_del.status_code == 200
    data_del = res_del.json()
    assert data_del["status"] == "deleted"
    assert data_del["deleted_pois"] >= 1

    # Verify POI was removed
    stmt_poi = select(AttractionModel).where(AttractionModel.id == "poi-storage-test-1")
    assert (await db_session.execute(stmt_poi)).scalar_one_or_none() is None

    # Crucially verify trip was NOT removed and remains completely intact
    stmt_trip = select(TripModel).where(TripModel.id == "trip-storage-test-1")
    trip_check = (await db_session.execute(stmt_trip)).scalar_one_or_none()
    assert trip_check is not None
    assert trip_check.id == "trip-storage-test-1"

    # Clean up
    await db_session.execute(
        delete(TripModel).where(TripModel.id == "trip-storage-test-1")
    )
    await db_session.execute(delete(CityModel).where(CityModel.id == "testville_es"))
    await db_session.commit()
