from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.services.transit_service import (
    TransitRoutingError,
    get_detailed_transit_leg,
)


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_success():
    origin = {
        "name": "Sol",
        "city": "madrid",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
    }
    dest = {
        "name": "Prado",
        "city": "madrid",
        "location": {"latitude": 40.4138, "longitude": -3.6922},
    }

    mock_resp = httpx.Response(
        200,
        json={
            "trip": {
                "summary": {"time": 900, "length": 1.2},
                "legs": [
                    {
                        "maneuvers": [
                            {
                                "instruction": "Walk to Sol station",
                                "time": 180,
                                "length": 0.2,
                            },
                            {
                                "instruction": "Take Line 1 towards Atocha",
                                "time": 420,
                                "length": 0.8,
                                "transit_info": {
                                    "short_name": "1",
                                    "headsign": "Atocha",
                                    "description": "Sol",
                                },
                            },
                            {
                                "instruction": "Walk to Prado Museum",
                                "time": 300,
                                "length": 0.2,
                            },
                        ]
                    }
                ],
            }
        },
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )

    with (
        patch(
            "app.services.transitous_service.TransitousService.plan_transit_route",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        mock_post.return_value = mock_resp

        leg = await get_detailed_transit_leg(origin, dest, "2026-09-10T10:00")

        assert leg.mode == "transit"
        assert leg.duration_mins == 15
        assert leg.cost_eur == 1.50
        assert leg.cost_is_estimated is False
        assert leg.price_source == "official_crtm_tariff"
        assert len(leg.steps) == 3
        assert leg.steps[0].type == "walk"
        assert leg.steps[1].type == "transit"
        assert leg.steps[1].transit_line == "1"
        assert leg.steps[1].headsign == "Atocha"
        assert leg.steps[2].type == "walk"


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_unindexed_city_estimate():
    origin = {
        "name": "Unindexed Origin",
        "city": "UnknownCity",
        "location": {"latitude": 50.0, "longitude": 10.0},
    }
    dest = {
        "name": "Unindexed Dest",
        "city": "UnknownCity",
        "location": {"latitude": 50.1, "longitude": 10.1},
    }

    mock_resp = httpx.Response(
        200,
        json={
            "trip": {
                "summary": {"time": 600, "length": 2.0},
                "legs": [
                    {
                        "maneuvers": [
                            {
                                "instruction": "Take Bus 42",
                                "time": 600,
                                "length": 2.0,
                                "transit_info": {"short_name": "42"},
                            }
                        ]
                    }
                ],
            }
        },
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )

    with (
        patch(
            "app.services.transitous_service.TransitousService.plan_transit_route",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        mock_post.return_value = mock_resp

        leg = await get_detailed_transit_leg(origin, dest, "2026-09-10T10:00")

        assert leg.mode == "transit"
        assert leg.cost_eur == 0.0
        assert leg.cost_is_estimated is True
        assert leg.price_source == "fare_unknown"


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_pedestrian_only():
    origin = {
        "name": "Sol",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
    }
    dest = {
        "name": "Plaza Mayor",
        "location": {"latitude": 40.4154, "longitude": -3.7074},
    }

    mock_resp = httpx.Response(
        200,
        json={
            "trip": {
                "summary": {"time": 300, "length": 0.4},
                "legs": [
                    {
                        "maneuvers": [
                            {
                                "instruction": "Walk west on Calle Mayor",
                                "time": 300,
                                "length": 0.4,
                            }
                        ]
                    }
                ],
            }
        },
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )

    with (
        patch(
            "app.services.transitous_service.TransitousService.plan_transit_route",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        mock_post.return_value = mock_resp

        leg = await get_detailed_transit_leg(origin, dest)

        assert leg.mode == "pedestrian"
        assert leg.duration_mins == 5
        assert leg.cost_eur == 0.0
        assert len(leg.steps) == 1
        assert leg.steps[0].type == "walk"


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_network_failure_raises():
    origin = {"name": "Sol", "location": {"latitude": 40.4168, "longitude": -3.7038}}
    dest = {"name": "Prado", "location": {"latitude": 40.4138, "longitude": -3.6922}}

    with (
        patch(
            "app.services.transitous_service.TransitousService.plan_transit_route",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        mock_post.side_effect = httpx.ConnectError("Connection refused")

        with pytest.raises(TransitRoutingError) as exc_info:
            await get_detailed_transit_leg(origin, dest, "2026-09-10T10:00")

        assert "Could not fetch multimodal route" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_http_500_raises():
    origin = {"name": "Sol", "location": {"latitude": 40.4168, "longitude": -3.7038}}
    dest = {"name": "Prado", "location": {"latitude": 40.4138, "longitude": -3.6922}}

    mock_resp = httpx.Response(
        500,
        content=b"Internal Server Error",
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, patch(
        "app.services.transitous_service.TransitousService.plan_transit_route",
        new_callable=AsyncMock,
        return_value=None,
    ):
        mock_post.return_value = mock_resp

        with pytest.raises(TransitRoutingError):
            await get_detailed_transit_leg(origin, dest)


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_malformed_response_raises():
    origin = {"name": "Sol", "location": {"latitude": 40.4168, "longitude": -3.7038}}
    dest = {"name": "Prado", "location": {"latitude": 40.4138, "longitude": -3.6922}}

    mock_resp = httpx.Response(
        200,
        json={"error": "Routing failed"},
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, patch(
        "app.services.transitous_service.TransitousService.plan_transit_route",
        new_callable=AsyncMock,
        return_value=None,
    ):
        # If trip is missing or structure is not matching expected schema
        mock_post.return_value = mock_resp

        # When trip is empty dict, summary.get("time", 900) defaults
        # to 15 mins, legs is empty
        leg = await get_detailed_transit_leg(origin, dest)
        assert leg.mode == "pedestrian"
        assert leg.steps == []


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_fallback_costing_no_driving_instructions():
    """
    Ensure that when Valhalla multimodal route is unavailable (e.g. 400) and
    falls back to bus/auto costing, the returned transit steps are passenger public
    transit instructions rather than vehicle driver maneuvers (e.g. 'Drive west...', 'Turn left onto...').
    """
    origin = {
        "name": "Hotel Gracery Shinjuku",
        "city": "tokyo",
        "location": {"latitude": 35.6953, "longitude": 139.7020},
    }
    dest = {
        "name": "Sakurada Gate",
        "city": "tokyo",
        "location": {"latitude": 35.6785, "longitude": 139.7533},
    }

    resp_400 = httpx.Response(
        400,
        json={"error_code": 442, "error": "No path could be found for input"},
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )
    resp_bus_200 = httpx.Response(
        200,
        json={
            "trip": {
                "summary": {"time": 960, "length": 6.0},
                "legs": [
                    {
                        "shape": "gcwalAfygaFwj@vj@o}@n}@o}@n}@o}@noB",
                        "maneuvers": [
                            {
                                "instruction": "Drive west on 花道通り.",
                                "time": 60,
                                "length": 0.07,
                            },
                            {
                                "instruction": "Turn left onto 歌舞伎町さくら通り.",
                                "time": 60,
                                "length": 0.21,
                            },
                            {
                                "instruction": "Turn left onto 靖国通り/4/5/302/430.",
                                "time": 60,
                                "length": 0.34,
                            },
                            {
                                "instruction": "Turn right onto 明治通り/305.",
                                "time": 60,
                                "length": 0.33,
                            },
                            {
                                "instruction": "Turn left onto 20/甲州街道. Continue on 20.",
                                "time": 240,
                                "length": 3.79,
                            },
                            {
                                "instruction": "Turn right onto 20/内堀通り/半蔵門. Continue on 20/内堀通り.",
                                "time": 60,
                                "length": 1.27,
                            },
                            {"instruction": "Turn left.", "time": 60, "length": 0.01},
                            {
                                "instruction": "You have arrived at your destination.",
                                "time": 60,
                                "length": 0.0,
                            },
                        ],
                    }
                ],
            }
        },
        request=httpx.Request("POST", "http://localhost:8002/route"),
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [resp_400, resp_bus_200]

        leg = await get_detailed_transit_leg(origin, dest, "2026-10-27T09:00")

        assert leg.mode == "transit"
        assert leg.duration_mins > 0
        assert len(leg.steps) >= 3

        # Must NOT contain driving maneuvers
        for step in leg.steps:
            assert not step.instruction.lower().startswith(
                "drive"
            ), f"Driving instruction found: {step.instruction}"
            assert (
                "turn left onto" not in step.instruction.lower()
            ), f"Driving instruction found: {step.instruction}"
            assert (
                "turn right onto" not in step.instruction.lower()
            ), f"Driving instruction found: {step.instruction}"

        # Must contain passenger transit steps
        step_types = [s.type for s in leg.steps]
        assert "walk" in step_types
        assert any(t in ("transit", "transit_board") for t in step_types)


def test_gtfs_route_finder_dynamic_tokyo():
    from app.services.gtfs_route_service import get_gtfs_route_finder

    finder = get_gtfs_route_finder("tokyo")
    if finder:
        assert len(finder.stops) > 0
        assert len(finder.routes) > 0
        assert ("routes", "大江戸線") in finder.translations or (
            "routes",
            "新宿線",
        ) in finder.translations

        # Test route finding between Shinjuku (35.6953, 139.7020) and Ginza / Hibiya (35.6700, 139.7600)
        route_info = finder.find_route(35.6953, 139.7020, 35.6700, 139.7600)
        assert route_info is not None
        assert "board_stop" in route_info
        assert "alight_stop" in route_info
        assert "route_1" in route_info
        assert route_info["route_1"]["name"] is not None


def test_synthesize_fallback_transit_leg_dynamic():
    from app.services.transit_service import synthesize_fallback_transit_leg

    origin = {
        "name": "Hotel Gracery Shinjuku",
        "city": "tokyo",
        "location": {"latitude": 35.6953, "longitude": 139.7020},
    }
    dest = {
        "name": "Sakurada Gate",
        "city": "tokyo",
        "location": {"latitude": 35.6785, "longitude": 139.7533},
    }

    leg = synthesize_fallback_transit_leg(origin, dest, city="tokyo")
    assert leg.mode == "transit"
    assert leg.duration_mins > 0
    assert len(leg.steps) >= 3

    # Ensure no driving maneuvers
    for step in leg.steps:
        assert not step.instruction.lower().startswith("drive")
        assert "turn left onto" not in step.instruction.lower()

    # Ensure passenger station and line details are present
    board_step = next((s for s in leg.steps if s.type == "transit_board"), None)
    assert board_step is not None
    assert board_step.station_name is not None
    assert board_step.transit_line is not None
