import uuid

import pytest
from app.db.models import (
    TransitAgencyModel,
    TransitCacheModel,
    TransitLineModel,
    TransitStationLineModel,
    TransitStationModel,
    TripModel,
)
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_transit_api_endpoints(async_client: AsyncClient, db_session):
    # Setup test data
    uid = uuid.uuid4().hex[:8]
    city = f"tokyotest_{uid}"
    build_id = f"build_{uid}"
    trip_id = f"trip_{uid}"

    # 1. Create transit_cache
    cache = TransitCacheModel(
        city=city,
        status="READY",
        gtfs_status="READY",
        derived_status="READY",
        active_build_id=build_id,
        capabilities={
            "has_shapes": False,
            "has_translations": True,
            "has_route_colors": True,
            "has_headsigns": True,
            "has_transfers": False,
            "has_wheelchair_info": True,
            "has_gtfs_fares": False,
        },
    )
    db_session.add(cache)

    # 2. Create agencies
    agency = TransitAgencyModel(
        build_id=build_id,
        city=city,
        agency_id="A1",
        name="Tokyo Metro Test",
    )
    db_session.add(agency)

    # 3. Create line
    line = TransitLineModel(
        build_id=build_id,
        city=city,
        line_id="G",
        short_name="G",
        long_name="Ginza Line",
        mode="Metro",
        color="#FF9500",
        text_color="#FFFFFF",
        color_source="gtfs",
        sort_order=1,
    )
    db_session.add(line)

    # 4. Create station
    station = TransitStationModel(
        build_id=build_id,
        city=city,
        station_id="G01",
        name="Shibuya",
        original_name="渋谷",
        lat=35.6580,
        lon=139.7016,
        wheelchair_boarding=1,
        stop_count=2,
    )
    db_session.add(station)

    # 5. Station line
    st_line = TransitStationLineModel(
        build_id=build_id,
        city=city,
        station_id="G01",
        line_id="G",
        direction_id=0,
        headsign="Asakusa",
    )
    db_session.add(st_line)

    # 6. Create Trip
    trip = TripModel(
        id=trip_id,
        destination=city,
        start_date="2026-11-01",
        end_date="2026-11-05",
        status="saved",
        itinerary_data={
            "lodging": {
                "name": "Cerulean Tower Tokyu Hotel",
                "latitude": 35.6560,
                "longitude": 139.6995,
            },
            "days": [
                {
                    "day": 1,
                    "itinerary": {
                        "path": [
                            {
                                "poi_id": "poi_scramble",
                                "name": "Shibuya Scramble Crossing",
                                "poi": {
                                    "location": {
                                        "lat": 35.6595,
                                        "lon": 139.7005,
                                    }
                                },
                            }
                        ]
                    },
                }
            ],
        },
    )
    db_session.add(trip)
    await db_session.commit()

    # TEST 1: Availability
    res_avail = await async_client.get(f"/api/trips/{trip.id}/transit/availability")
    assert res_avail.status_code == 200
    avail_data = res_avail.json()
    assert avail_data["city"] == city
    assert avail_data["derived_status"] == "READY"
    assert avail_data["capabilities"]["has_route_colors"] is True
    assert len(avail_data["agencies"]) == 1

    # TEST 2: Nearby
    res_nearby = await async_client.get(
        f"/api/trips/{trip.id}/transit/nearby?day=0&radius=1000"
    )
    assert res_nearby.status_code == 200
    nearby_data = res_nearby.json()
    assert nearby_data["anchors_count"] == 2  # lodging + scramble crossing
    assert len(nearby_data["grouped_stations"]) >= 1
    hotel_group = nearby_data["grouped_stations"][0]
    assert len(hotel_group["stations"]) >= 1
    st_obj = hotel_group["stations"][0]
    assert st_obj["id"] == "G01"
    assert st_obj["name"] == "Shibuya"
    assert st_obj["walk_mins"] >= 1
    assert len(st_obj["lines"]) == 1
    assert st_obj["lines"][0]["short_name"] == "G"

    # TEST 3: Lines
    res_lines = await async_client.get(f"/api/trips/{trip.id}/transit/lines")
    assert res_lines.status_code == 200
    lines_data = res_lines.json()
    assert len(lines_data["lines"]) == 1
    assert lines_data["lines"][0]["short_name"] == "G"
    assert lines_data["lines"][0]["mode"] == "Metro"

    # TEST 4: Line Detail
    res_ld = await async_client.get(f"/api/trips/{trip.id}/transit/lines/G")
    assert res_ld.status_code == 200
    ld_data = res_ld.json()
    assert ld_data["id"] == "G"
    assert ld_data["mode"] == "Metro"

    # TEST 5: Station Detail
    res_sd = await async_client.get(f"/api/trips/{trip.id}/transit/stations/G01")
    assert res_sd.status_code == 200
    sd_data = res_sd.json()
    assert sd_data["id"] == "G01"
    assert sd_data["name"] == "Shibuya"
    assert sd_data["original_name"] == "渋谷"
    assert sd_data["wheelchair_boarding"] == 1
    assert len(sd_data["serving_lines"]) == 1

    # TEST 6: Map Stations Bounding Box
    res_map = await async_client.get(
        f"/api/transit/{city}/map-stations?bbox=35.65,139.69,35.67,139.71"
    )
    assert res_map.status_code == 200
    map_data = res_map.json()
    assert len(map_data) == 1
    assert map_data[0]["id"] == "G01"

    # TEST 7: City-scoped station detail
    res_city_st = await async_client.get(f"/api/transit/{city}/stations/G01")
    assert res_city_st.status_code == 200
    city_st_data = res_city_st.json()
    assert city_st_data["id"] == "G01"
    assert city_st_data["name"] == "Shibuya"

    # TEST 8: City-scoped line detail (by line_id and flexible long_name)
    res_city_line = await async_client.get(f"/api/transit/{city}/lines/G")
    assert res_city_line.status_code == 200
    city_line_data = res_city_line.json()
    assert city_line_data["id"] == "G"

    res_city_line_long = await async_client.get(
        f"/api/transit/{city}/lines/Ginza%20Line"
    )
    assert res_city_line_long.status_code == 200
    assert res_city_line_long.json()["id"] == "G"


@pytest.mark.asyncio
async def test_transit_line_extraction_sanitization():
    from app.api.pois import _extract_transit_info
    from app.db.models import AttractionModel

    # 1. Subway entrance with ref="2" (Exit 2) must NEVER have line "2"
    p_entrance = AttractionModel(
        id="test-entrance", name="Yoyogi-koen Exit 2", category="metro"
    )
    meta_entrance = {
        "tags": {
            "ref": "2",
            "railway": "subway_entrance",
            "name": "代々木公園",
        },
        "transit_info": {
            "lines": ["2", "4", "C02", "3"],
            "type": "metro",
        },
    }
    info_entrance = _extract_transit_info(p_entrance, meta_entrance)
    assert info_entrance is not None
    assert "2" not in info_entrance["lines"]
    assert "4" not in info_entrance["lines"]
    assert "3" not in info_entrance["lines"]
    assert info_entrance["lines"] == []

    # 2. Bus stop with CRTM pole ref="08717" without route_ref must NOT have line "08717"
    p_bus = AttractionModel(id="test-bus", name="Pozuelo Oeste", category="bus_stop")
    meta_bus = {
        "tags": {
            "ref": "08717",
            "highway": "bus_stop",
            "bus": "yes",
        }
    }
    info_bus = _extract_transit_info(p_bus, meta_bus)
    assert info_bus is not None
    assert info_bus["lines"] == []

    # 3. Stop with genuine route_ref="211;212;827" must extract only real lines
    p_route = AttractionModel(id="test-route", name="Av. Logrono", category="bus_stop")
    meta_route = {
        "tags": {
            "ref": "07324",
            "highway": "bus_stop",
            "route_ref": "211;212;827;828",
        }
    }
    info_route = _extract_transit_info(p_route, meta_route)
    assert info_route is not None
    assert info_route["lines"] == ["211", "212", "827", "828"]
    assert "07324" not in info_route["lines"]
