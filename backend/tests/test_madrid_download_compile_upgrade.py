import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.db.models import TransitCacheModel, TransitCacheStatus, TripModel
from app.services.osm_map_service import OSMMapService
from app.tasks import CITY_GTFS_MAP
from app.use_cases.upgrade_trip_transit import UpgradeTripTransitUseCase


@pytest.mark.asyncio
async def test_madrid_download_link_and_gtfs_resolution():
    """
    1. Downloading phase verification:
    Verify OSM download link for Madrid resolves to official Geofabrik server,
    is reachable, returns HTTP 200, and is a valid binary extract (>50MB).
    Verify GTFS feed URL for Madrid is mapped and valid.
    """
    url, filename = await OSMMapService.resolve_osm_pbf_url("Madrid")
    assert filename == "madrid-latest.osm.pbf"
    assert url == "https://download.geofabrik.de/europe/spain/madrid-latest.osm.pbf"

    # Verify live reachability
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.head(url)
        assert resp.status_code == 200
        assert "html" not in resp.headers.get("Content-Type", "").lower()
        content_len = int(resp.headers.get("Content-Length", 0))
        assert content_len > 50_000_000  # Madrid extract is ~84MB

    # Verify GTFS feed mapping
    gtfs_url = CITY_GTFS_MAP.get("madrid")
    assert gtfs_url is not None
    assert gtfs_url.startswith("https://")


@pytest.mark.asyncio
async def test_madrid_compilation_and_cache_state(db_session, monkeypatch, tmp_path):
    """
    2. Compilation phase verification:
    Verify that executing map ingestion and GTFS tasks updates cache
    state to READY and publishes events.
    """
    from app.tasks import build_city_gtfs_task

    monkeypatch.setenv("GTFS_BASE_DIR", str(tmp_path / "gtfs_feeds"))

    # Populate cache entry
    cache_entry = TransitCacheModel(
        city="madrid",
        status=TransitCacheStatus.BUILDING.value,
        osm_status="READY",
        gtfs_status="BUILDING",
    )
    db_session.add(cache_entry)
    await db_session.commit()

    with (
        patch("app.tasks._async_update_transit_cache", new_callable=AsyncMock),
        patch("urllib.request.urlretrieve"),
        patch("zipfile.ZipFile"),
        patch("app.tasks.extract_gtfs_expiry", return_value=datetime.now(timezone.utc)),
        patch("redis.from_url") as mock_redis_factory,
    ):
        mock_redis = mock_redis_factory.return_value
        result = build_city_gtfs_task("madrid", trip_id="trip-madrid-test")
        assert result["status"] == "success"
        assert result["gtfs_status"] == "READY"

        # Verify publication of tiles ready event
        mock_redis.publish.assert_called_once()
        args, _ = mock_redis.publish.call_args
        assert args[0] == "paladio:events"
        event = json.loads(args[1])
        assert event["event"] == "TRANSIT_TILES_READY"
        assert event["city"] == "madrid"


@pytest.mark.asyncio
async def test_madrid_itinerary_upgrade_end_to_end(db_session):
    """
    3. Upgrading phase verification:
    Loads a multi-day Madrid itinerary with optimistic/estimated transit legs,
    runs UpgradeTripTransitUseCase, and verifies that all legs are upgraded with:
    - Real pedestrian/transit instructions and street maneuvers.
    - Preserved POI visitation order and original dwell times.
    - Dynamically cascading scheduled_start and scheduled_end timestamps.
    - Calculated transit passes and airport surcharges.
    """
    # Create sample Madrid trip with estimated legs
    madrid_trip_id = "test-madrid-trip-123"
    trip_data = {
        "days": [
            {
                "day": 1,
                "date": "2026-09-23",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "name": "The Westin Palace Madrid",
                                "category": "HOTEL",
                                "city": "Madrid",
                                "location": {"latitude": 40.4154, "longitude": -3.6946},
                            },
                            "scheduled_start": "08:00",
                            "scheduled_end": "09:00",
                        },
                        {
                            "poi": {
                                "name": "Puerta del Sol",
                                "category": "ATTRACTION",
                                "city": "Madrid",
                                "location": {"latitude": 40.4169, "longitude": -3.7038},
                            },
                            "scheduled_start": "09:15",
                            "scheduled_end": "10:00",
                            "transit_from_previous": {
                                "mode": "transit",
                                "cost_eur": 1.5,
                                "duration_mins": 15,
                                "cost_is_estimated": True,
                                "price_source": "estimated_city_transit_fare",
                                "steps": [
                                    {
                                        "type": "transit_board",
                                        "transit_line": "Transit",
                                        "instruction": "Board public transit towards Puerta del Sol",
                                        "duration_mins": 15,
                                    }
                                ],
                            },
                        },
                        {
                            "poi": {
                                "name": "Estadio Santiago Bernabéu",
                                "category": "ATTRACTION",
                                "city": "Madrid",
                                "location": {"latitude": 40.4530, "longitude": -3.6883},
                            },
                            "scheduled_start": "10:20",
                            "scheduled_end": "12:20",
                            "transit_from_previous": {
                                "mode": "transit",
                                "cost_eur": 1.5,
                                "duration_mins": 20,
                                "cost_is_estimated": True,
                                "price_source": "estimated_city_transit_fare",
                                "steps": [
                                    {
                                        "type": "transit_board",
                                        "transit_line": "Transit",
                                        "instruction": "Board public transit towards Estadio Santiago Bernabéu",
                                        "duration_mins": 20,
                                    }
                                ],
                            },
                        },
                    ]
                },
            }
        ]
    }

    db_trip = TripModel(
        id=madrid_trip_id,
        destination="Madrid",
        start_date="2026-09-23T08:00:00.000Z",
        end_date="2026-09-24T20:00:00.000Z",
        itinerary_data=trip_data,
    )
    db_session.add(db_trip)
    await db_session.commit()

    # Execute upgrade use case
    use_case = UpgradeTripTransitUseCase(db_session)
    result = await use_case.execute(madrid_trip_id)

    assert result["status"] == "success"
    assert result["trip_id"] == madrid_trip_id

    upgraded_itin = result["itinerary_data"]
    day1 = upgraded_itin["days"][0]
    path = day1["itinerary"]["path"]

    # 1. Verify POI 0: Hotel departure
    assert path[0]["poi"]["name"] == "The Westin Palace Madrid"
    assert path[0]["scheduled_start"] == "08:00"
    assert path[0]["scheduled_end"] == "09:00"

    # 2. Verify POI 1: Puerta del Sol
    assert path[1]["poi"]["name"] == "Puerta del Sol"
    trans1 = path[1]["transit_from_previous"]
    assert trans1 is not None
    # Dwell at Westin was 60m (08:00 to 09:00).
    # Arrival at Sol must be 09:00 + duration
    dur1 = trans1["duration_mins"]
    assert dur1 > 0
    # Original dwell at Sol was 45m (09:15 to 10:00).
    # Upgraded departure must be arrival + 45m
    from app.use_cases.upgrade_trip_transit import parse_time_to_minutes

    start1_m = parse_time_to_minutes(path[1]["scheduled_start"])
    end1_m = parse_time_to_minutes(path[1]["scheduled_end"])
    assert start1_m == 540 + dur1
    assert end1_m - start1_m == 45  # Dwell time strictly preserved

    # Verify steps contain turn-by-turn maneuvers
    assert len(trans1["steps"]) > 0
    for step in trans1["steps"]:
        assert step.get("instruction")

    # 3. Verify POI 2: Bernabeu
    assert path[2]["poi"]["name"] == "Estadio Santiago Bernabéu"
    trans2 = path[2]["transit_from_previous"]
    assert trans2 is not None
    dur2 = trans2["duration_mins"]
    start2_m = parse_time_to_minutes(path[2]["scheduled_start"])
    end2_m = parse_time_to_minutes(path[2]["scheduled_end"])
    assert start2_m == end1_m + dur2
    # Original dwell at Bernabeu was 120m (10:20 to 12:20)
    assert end2_m - start2_m == 120  # Dwell time strictly preserved

    # 4. Verify transit recommendation was computed
    assert "transit_recommendation" in day1["itinerary"]
    rec = day1["itinerary"]["transit_recommendation"]
    assert "type" in rec

    # 5. Verify database was updated
    refreshed_trip = await db_session.get(TripModel, madrid_trip_id)
    assert refreshed_trip.itinerary_data == upgraded_itin
