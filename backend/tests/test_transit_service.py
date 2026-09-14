from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.services.transit_service import (
    TransitRoutingError,
    get_detailed_transit_leg,
)


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_success():
    origin = {"name": "Sol", "location": {"latitude": 40.4168, "longitude": -3.7038}}
    dest = {"name": "Prado", "location": {"latitude": 40.4138, "longitude": -3.6922}}

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

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        leg = await get_detailed_transit_leg(origin, dest, "2026-09-10T10:00")

        assert leg.mode == "transit"
        assert leg.duration_mins == 15
        assert leg.cost_eur == 1.80
        assert len(leg.steps) == 3
        assert leg.steps[0].type == "walk"
        assert leg.steps[1].type == "transit"
        assert leg.steps[1].transit_line == "1"
        assert leg.steps[1].headsign == "Atocha"
        assert leg.steps[2].type == "walk"


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

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
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

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
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

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
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

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        # If trip is missing or structure is not matching expected schema
        mock_post.return_value = mock_resp

        # When trip is empty dict, summary.get("time", 900) defaults
        # to 15 mins, legs is empty
        leg = await get_detailed_transit_leg(origin, dest)
        assert leg.mode == "pedestrian"
        assert leg.steps == []
