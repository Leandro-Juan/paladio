import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.osm_map_service import OSMMapService
from app.use_cases.upgrade_trip_transit import (
    UpgradeTripTransitUseCase,
    minutes_to_time_str,
    parse_time_to_minutes,
)


def test_time_parsing_and_formatting():
    assert parse_time_to_minutes("09:00") == 540
    assert parse_time_to_minutes("14:30") == 870
    assert minutes_to_time_str(540) == "09:00"
    assert minutes_to_time_str(870) == "14:30"
    # Float inputs from re-optimization or metrics calculations must not raise ValueError
    assert minutes_to_time_str(540.0) == "09:00"
    assert minutes_to_time_str(589.4) == "09:49"
    assert minutes_to_time_str(870.0) == "14:30"


@pytest.mark.asyncio
async def test_osm_service_resolve_known_cities():
    url_madrid, file_madrid = await OSMMapService.resolve_osm_pbf_url("Madrid")
    assert "madrid-latest.osm.pbf" in file_madrid
    assert "spain/madrid" in url_madrid

    url_paris, file_paris = await OSMMapService.resolve_osm_pbf_url("Paris")
    assert "ile-de-france-latest.osm.pbf" in file_paris
    assert "france/ile-de-france" in url_paris


@pytest.mark.asyncio
async def test_osm_service_resolve_unindexed_city_fallback():
    _url_val, file_val = await OSMMapService.resolve_osm_pbf_url("Valencia")
    assert "valencia-latest.osm.pbf" in file_val


@pytest.mark.asyncio
async def test_upgrade_trip_transit_cascades_schedule():
    mock_trip = MagicMock()
    mock_trip.id = "trip-test-123"
    mock_trip.destination = "Paris"
    mock_trip.itinerary_data = {
        "days": [
            {
                "day": 1,
                "date": "2026-09-20",
                "itinerary": {
                    "path": [
                        {
                            "poi": {"name": "Hotel Le Grand", "category": "HOTEL"},
                            "scheduled_start": "08:00",
                            "scheduled_end": "09:00",
                        },
                        {
                            "poi": {"name": "Louvre Museum", "category": "MUSEUM"},
                            "scheduled_start": "09:15",
                            "scheduled_end": "11:15",
                            "transit_from_previous": {
                                "duration_mins": 15,
                                "cost_eur": 2.15,
                                "cost_is_estimated": True,
                                "price_source": "fallback_estimate",
                                "steps": [
                                    {
                                        "type": "transit",
                                        "instruction": "Board transit towards Louvre",
                                        "duration_mins": 15,
                                        "transit_line": "Transit",
                                    }
                                ],
                            },
                        },
                        {
                            "poi": {"name": "Eiffel Tower", "category": "LANDMARK"},
                            "scheduled_start": "11:35",
                            "scheduled_end": "13:35",
                            "transit_from_previous": {
                                "duration_mins": 20,
                                "cost_eur": 2.15,
                                "cost_is_estimated": True,
                                "price_source": "fallback_estimate",
                                "steps": [
                                    {
                                        "type": "transit",
                                        "instruction": "Board transit towards Eiffel",
                                        "duration_mins": 20,
                                        "transit_line": "Transit",
                                    }
                                ],
                            },
                        },
                    ]
                },
            }
        ]
    }

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_trip
    mock_session.execute.return_value = mock_result

    # Mock real transit return: 25 mins for first leg, 30 mins for second leg
    leg1 = TransitLeg(
        duration_mins=25,
        cost_eur=2.15,
        cost_is_estimated=False,
        price_source="official_idfm",
        mode="transit",
        steps=[
            TransitStep(
                type="transit",
                instruction="Board Metro Line 1 towards Louvre",
                duration_mins=25,
                transit_line="1",
                station_name="Palais Royal",
            )
        ],
    )
    leg2 = TransitLeg(
        duration_mins=30,
        cost_eur=2.15,
        cost_is_estimated=False,
        price_source="official_idfm",
        mode="transit",
        steps=[
            TransitStep(
                type="transit",
                instruction="Board Metro Line 6 towards Bir-Hakeim",
                duration_mins=30,
                transit_line="6",
                station_name="Bir-Hakeim",
            )
        ],
    )

    with patch(
        "app.use_cases.upgrade_trip_transit.get_detailed_transit_leg",
        side_effect=[leg1, leg2],
    ):
        use_case = UpgradeTripTransitUseCase(mock_session)
        res = await use_case.execute("trip-test-123")

        assert res["status"] == "success"
        days = mock_trip.itinerary_data["days"]
        path = days[0]["itinerary"]["path"]

        # POI 0: 08:00 - 09:00 (dwell 60m)
        assert path[0]["scheduled_start"] == "08:00"
        assert path[0]["scheduled_end"] == "09:00"

        # POI 1: dep 09:00 + 25m transit = 09:25 arrival
        assert path[1]["scheduled_start"] == "09:25"
        # original dwell at Louvre was 120m (11:15 - 09:15) -> 09:25 + 120m = 11:25
        assert path[1]["scheduled_end"] == "11:25"
        assert path[1]["transit_from_previous"]["steps"][0]["transit_line"] == "1"
        assert not path[1]["transit_from_previous"]["cost_is_estimated"]

        # POI 2: dep 11:25 + 30m transit = 11:55 arrival
        assert path[2]["scheduled_start"] == "11:55"
        # original dwell at Eiffel was 120m -> 11:55 + 120m = 13:55
        assert path[2]["scheduled_end"] == "13:55"
        assert path[2]["transit_from_previous"]["steps"][0]["transit_line"] == "6"
        assert not path[2]["transit_from_previous"]["cost_is_estimated"]


async def test_upgrade_trip_transit_handles_none_transit_from_previous():
    from app.services.transit_service import TransitRoutingError

    mock_trip = MagicMock()
    mock_trip.id = "trip-none-transit"
    mock_trip.destination = "Sevilla"
    mock_trip.itinerary_data = {
        "days": [
            {
                "day": 1,
                "date": "2026-10-17",
                "itinerary": {
                    "path": [
                        {
                            "poi": {"name": "SVQ Airport", "category": "AIRPORT"},
                            "scheduled_start": "13:00",
                            "scheduled_end": "14:00",
                            "transit_from_previous": None,
                        },
                        {
                            "poi": {
                                "name": "Sevilla Center (Start)",
                                "category": "HOTEL",
                            },
                            "scheduled_start": "15:00",
                            "scheduled_end": "15:00",
                            "transit_from_previous": None,
                        },
                        {
                            "poi": {"name": "Chupadedos Bar", "category": "RESTAURANT"},
                            "scheduled_start": "19:30",
                            "scheduled_end": "21:00",
                            "transit_from_previous": {
                                "duration_mins": 15,
                                "mode": "pedestrian",
                            },
                        },
                    ]
                },
            }
        ]
    }

    mock_session = AsyncMock()
    mock_session.execute.return_value = MagicMock(scalar_one_or_none=lambda: mock_trip)

    leg2 = TransitLeg(
        duration_mins=12,
        cost_eur=0.0,
        cost_is_estimated=False,
        price_source="pedestrian",
        mode="pedestrian",
        steps=[],
    )

    # First leg (Airport) fails with TransitRoutingError, second succeeds
    with patch(
        "app.use_cases.upgrade_trip_transit.get_detailed_transit_leg",
        side_effect=[TransitRoutingError("No route to airport"), leg2],
    ):
        use_case = UpgradeTripTransitUseCase(mock_session)
        res = await use_case.execute("trip-none-transit")
        assert res["status"] == "success"
        days = mock_trip.itinerary_data["days"]
        path = days[0]["itinerary"]["path"]
        # Leg 1 retained scheduled duration (60m) without raising AttributeError
        assert path[1]["scheduled_start"] == "15:00"
        assert path[1]["scheduled_end"] == "15:00"
        # Leg 2 upgraded with 12 mins transit
        assert path[2]["transit_from_previous"]["duration_mins"] == 12


@pytest.mark.asyncio
async def test_upgrade_trip_transit_handles_float_duration_mins_from_reoptimization():
    """
    When a trip day was re-optimized via paladio_core, transit_from_previous
    durations may be stored as floats (e.g. 49.0). Upgrading transit must
    cleanly handle float durations without raising 'Unknown format code d for object of type float'.
    """
    mock_trip = MagicMock()
    mock_trip.id = "trip-float-test"
    mock_trip.destination = "Tokyo"
    mock_trip.itinerary_data = {
        "days": [
            {
                "day": 1,
                "date": "2026-10-16",
                "itinerary": {
                    "path": [
                        {
                            "poi": {"name": "Haneda Airport", "category": "AIRPORT"},
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:00",
                        },
                        {
                            "poi": {"name": "Hotel Gracery", "category": "HOTEL"},
                            "scheduled_start": "10:49",
                            "scheduled_end": "11:19",
                            "transit_from_previous": {
                                "duration_mins": 49.0,  # float from re-optimization!
                                "cost_eur": 4.5,
                                "mode": "transit",
                            },
                        },
                        {
                            "poi": {"name": "Meiji Shrine", "category": "LANDMARK"},
                            "scheduled_start": "11:34",
                            "scheduled_end": "12:34",
                            "transit_from_previous": {
                                "duration_mins": 15.0,  # float from re-optimization!
                                "cost_eur": 2.0,
                                "mode": "transit",
                            },
                        },
                    ]
                },
            }
        ]
    }

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_trip
    mock_session.execute.return_value = mock_result

    upgraded_leg = TransitLeg(
        duration_mins=15,
        cost_eur=2.0,
        cost_is_estimated=False,
        price_source="tokyo_metro",
        mode="transit",
        steps=[],
    )

    # First leg fails (retains previous float duration), second leg succeeds
    with patch(
        "app.use_cases.upgrade_trip_transit.get_detailed_transit_leg",
        side_effect=[None, upgraded_leg],
    ):
        use_case = UpgradeTripTransitUseCase(mock_session)
        res = await use_case.execute("trip-float-test")
        assert res["status"] == "success"
        path = mock_trip.itinerary_data["days"][0]["itinerary"]["path"]
        assert path[1]["scheduled_start"] == "10:49"
        assert path[1]["scheduled_end"] == "11:19"
        assert isinstance(path[1]["transit_from_previous"]["duration_mins"], int)
        assert path[1]["transit_from_previous"]["duration_mins"] == 49
        assert path[2]["scheduled_start"] == "11:34"
        assert path[2]["scheduled_end"] == "12:34"
        assert isinstance(path[2]["transit_from_previous"]["duration_mins"], int)
        assert path[2]["transit_from_previous"]["duration_mins"] == 15


@pytest.mark.slow
def test_build_city_gtfs_task_publishes_to_redis(monkeypatch, tmp_path):
    from app.tasks import build_city_gtfs_task

    monkeypatch.setenv("GTFS_BASE_DIR", str(tmp_path / "gtfs_feeds"))

    mock_container = MagicMock()
    mock_container.exec_run.return_value = MagicMock(exit_code=0, output=b"OK")
    mock_docker = MagicMock()
    mock_docker.containers.get.return_value = mock_container

    with (
        patch("docker.from_env", return_value=mock_docker),
        patch("app.tasks._async_update_transit_cache", new_callable=AsyncMock),
        patch("urllib.request.urlretrieve"),
        patch("zipfile.ZipFile"),
        patch("app.tasks.extract_gtfs_expiry", return_value=datetime.now(timezone.utc)),
        patch("redis.from_url") as mock_redis_factory,
    ):
        mock_redis = MagicMock()
        mock_redis_factory.return_value = mock_redis

        res = build_city_gtfs_task("paris", trip_id="trip-abc-123")
        assert res["status"] == "success"
        assert res["gtfs_status"] == "READY"

        # Verify Redis event was published
        mock_redis.publish.assert_called_once()
        args, _ = mock_redis.publish.call_args
        assert args[0] == "paladio:events"
        payload = json.loads(args[1])
        assert payload["event"] == "TRANSIT_TILES_READY"
        assert payload["city"] == "paris"
        assert payload["trip_id"] == "trip-abc-123"
