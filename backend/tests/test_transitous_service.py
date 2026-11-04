import pytest
from unittest.mock import AsyncMock, patch
import httpx
from app.services.transitous_service import TransitousService, format_transitous_time


def test_format_transitous_time():
    assert format_transitous_time("2026-09-10T10:00") == "2026-09-10T10:00:00Z"
    assert format_transitous_time("2026-09-10T10:00:00Z") == "2026-09-10T10:00:00Z"
    assert format_transitous_time("2026-09-10") == "2026-09-10T09:00:00Z"
    assert format_transitous_time(None) is None
    assert format_transitous_time("") is None


@pytest.mark.asyncio
async def test_transitous_service_plan_transit_route_success():
    origin = {"name": "Sol", "city": "madrid", "lat": 40.4168, "lon": -3.7038}
    dest = {"name": "Bernabeu", "city": "madrid", "lat": 40.4530, "lon": -3.6883}

    mock_motis_response = {
        "itineraries": [
            {
                "duration": 1200,
                "legs": [
                    {
                        "mode": "WALK",
                        "duration": 180,
                        "distance": 200,
                        "from": {"name": "START"},
                        "to": {"name": "Sol Station"},
                        "legGeometry": {"points": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    },
                    {
                        "mode": "SUBWAY",
                        "routeShortName": "10",
                        "routeColor": "001A9C",
                        "routeTextColor": "FFFFFF",
                        "headsign": "Hospital Infanta Sofía",
                        "duration": 840,
                        "distance": 4500,
                        "from": {"name": "Sol Station", "lat": 40.4168, "lon": -3.7038},
                        "to": {
                            "name": "Santiago Bernabéu",
                            "lat": 40.4530,
                            "lon": -3.6883,
                        },
                        "intermediateStops": [
                            {
                                "name": "Gran Vía",
                                "lat": 40.4200,
                                "lon": -3.7010,
                                "arrival": "2026-09-10T10:05:00Z",
                            },
                            {
                                "name": "Tribunal",
                                "lat": 40.4260,
                                "lon": -3.7010,
                                "arrival": "2026-09-10T10:08:00Z",
                            },
                            {
                                "name": "Alonso Martínez",
                                "lat": 40.4280,
                                "lon": -3.6950,
                                "arrival": "2026-09-10T10:10:00Z",
                            },
                        ],
                        "legGeometry": {"points": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    },
                    {
                        "mode": "WALK",
                        "duration": 180,
                        "distance": 150,
                        "from": {"name": "Santiago Bernabéu"},
                        "to": {"name": "END"},
                        "legGeometry": {"points": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    },
                ],
            }
        ]
    }

    mock_resp = httpx.Response(
        200,
        json=mock_motis_response,
        request=httpx.Request("GET", "https://api.transitous.org/api/v2/plan"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        leg = await TransitousService.plan_transit_route(
            origin, dest, departure_iso="2026-09-10T10:00", city="madrid"
        )

        assert leg is not None
        assert leg.mode == "transit"
        assert leg.duration_mins == 20
        assert len(leg.steps) >= 3

        # Check boarding step
        board_step = next(s for s in leg.steps if s.type == "transit_board")
        assert board_step.transit_line == "10"
        assert board_step.headsign == "Hospital Infanta Sofía"
        assert board_step.station_name == "Sol Station"
        assert board_step.route_color == "#001A9C"
        assert board_step.route_text_color == "#FFFFFF"
        assert len(board_step.intermediate_stops) == 3
        assert len(board_step.intermediate_stop_details) == 3
        assert board_step.intermediate_stop_details[0]["name"] == "Gran Vía"

        # Check alighting step
        alight_step = next(s for s in leg.steps if s.type == "transit_alight")
        assert alight_step.station_name == "Santiago Bernabéu"
        assert alight_step.route_color == "#001A9C"


@pytest.mark.asyncio
async def test_transitous_service_empty_itineraries():
    origin = {"name": "Sol", "city": "madrid", "lat": 40.4168, "lon": -3.7038}
    dest = {"name": "Bernabeu", "city": "madrid", "lat": 40.4530, "lon": -3.6883}

    mock_resp = httpx.Response(
        200,
        json={"itineraries": []},
        request=httpx.Request("GET", "https://api.transitous.org/api/v2/plan"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        leg = await TransitousService.plan_transit_route(origin, dest)
        assert leg is None


@pytest.mark.asyncio
async def test_transitous_service_http_error():
    origin = {"name": "Sol", "city": "madrid", "lat": 40.4168, "lon": -3.7038}
    dest = {"name": "Bernabeu", "city": "madrid", "lat": 40.4530, "lon": -3.6883}

    mock_resp = httpx.Response(
        500,
        content=b"Internal Server Error",
        request=httpx.Request("GET", "https://api.transitous.org/api/v2/plan"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        leg = await TransitousService.plan_transit_route(origin, dest)
        assert leg is None
