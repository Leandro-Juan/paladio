import uuid

import pytest
from app.db.models import (
    AttractionModel,
    TransitAgencyModel,
    TransitCacheModel,
    TransitLineModel,
    TransitStationLineModel,
    TransitStationModel,
)
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_poi_details_resolves_transit_station_over_substring_attraction(
    async_client: AsyncClient, db_session
):
    uid = uuid.uuid4().hex[:8]
    city = f"tokyo_{uid}"
    build_id = f"build_{uid}"
    station_id = f"st_{uid}"
    station_name = f"StationHub_{uid}"

    # 1. Create transit_cache
    cache = TransitCacheModel(
        city=city,
        status="READY",
        gtfs_status="READY",
        derived_status="READY",
        active_build_id=build_id,
        capabilities={"has_translations": True},
    )
    db_session.add(cache)

    # 2. Create transit agency, line, and station
    agency = TransitAgencyModel(
        build_id=build_id,
        city=city,
        agency_id=f"AG_{uid}",
        name="Metro Test",
    )
    db_session.add(agency)

    line = TransitLineModel(
        build_id=build_id,
        city=city,
        line_id=f"L_{uid}",
        short_name="M1",
        long_name="Main Line",
        mode="metro",
        color="#007AFF",
        text_color="#FFFFFF",
    )
    db_session.add(line)

    station = TransitStationModel(
        build_id=build_id,
        city=city,
        station_id=station_id,
        name=station_name,
        original_name="駅ハブ",
        lat=35.6895,
        lon=139.6917,
        wheelchair_boarding=1,
    )
    db_session.add(station)

    st_line = TransitStationLineModel(
        build_id=build_id,
        city=city,
        station_id=station_id,
        line_id=f"L_{uid}",
        direction_id=0,
        headsign="Downtown",
    )
    db_session.add(st_line)

    # 3. Create an unrelated park that contains station_name as a substring with a high iconicity score
    attraction = AttractionModel(
        id=f"attraction_{uid}",
        name=f"{station_name} National Botanical Park",
        category="park",
        city=city,
        location={"lat": 35.6850, "lng": 139.7100},
        scoring={},
        metadata_field={},
        iconicity_score=99.0,
    )
    db_session.add(attraction)
    await db_session.commit()

    # Case A: Lookup directly by GTFS ID: /pois/gtfs:{city}:{station_id}/details
    gtfs_id = f"gtfs:{city}:{station_id}"
    res_gtfs = await async_client.get(f"/api/v1/pois/{gtfs_id}/details")
    assert res_gtfs.status_code == 200
    data_gtfs = res_gtfs.json()
    assert data_gtfs["category"] == "transit"
    assert data_gtfs["name"] == station_name
    assert "transit_info" in data_gtfs
    assert "M1" in data_gtfs["transit_info"]["lines"]

    # Case B: Lookup by station name: /pois/{station_name}/details?name={station_name}&city={city}
    # It must resolve to the transit station, NEVER the national botanical park!
    res_name = await async_client.get(
        f"/api/v1/pois/{station_name}/details?name={station_name}&city={city}"
    )
    assert res_name.status_code == 200
    data_name = res_name.json()
    assert data_name["category"] == "transit"
    assert data_name["name"] == station_name
    assert data_name["id"] == gtfs_id
    assert "transit_info" in data_name
    assert "M1" in data_name["transit_info"]["lines"]

    # Case C: Station detail endpoint provides photos field
    res_station = await async_client.get(
        f"/api/v1/transit/{city}/stations/{station_id}"
    )
    assert res_station.status_code == 200
    data_st = res_station.json()
    assert "photos" in data_st
    assert isinstance(data_st["photos"], list)
