"""Unit and fail-fast tests for Phase 7: RoutingService & Fare Honesty."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.engine.v2.exceptions import RoutingUnavailable
from app.services.routing_service import UNREACHABLE_DURATION_MINS, RoutingService
from app.services.transit_fare_service import TransitFareService


@pytest.mark.asyncio
async def test_routing_service_raises_routing_unavailable_when_valhalla_down():
    """Verify RoutingService strictly raises RoutingUnavailable if Valhalla is down in plan_mode='real'."""
    pois = [
        {"location": {"latitude": 40.4138, "longitude": -3.6921}},
        {"location": {"latitude": 40.4153, "longitude": -3.6845}},
    ]

    # Valhalla connection failure simulation
    with (
        patch(
            "httpx.AsyncClient.post",
            side_effect=httpx.ConnectError("Connection refused"),
        ),
        pytest.raises(RoutingUnavailable) as exc_info,
    ):
        await RoutingService.get_transit_matrix(
            pois=pois,
            city_name="Madrid",
            plan_mode="real",
        )

    assert "Valhalla routing engine is unavailable" in str(exc_info.value)
    assert "plan_mode='estimated'" in str(exc_info.value)


@pytest.mark.asyncio
async def test_routing_service_explicit_estimated_mode():
    """Verify plan_mode='estimated' generates an explicit, flagged estimated matrix via haversine."""
    pois = [
        {"location": {"latitude": 40.4138, "longitude": -3.6921}},
        {"location": {"latitude": 40.4153, "longitude": -3.6845}},
    ]

    # No Valhalla calls made in estimated mode
    matrix = await RoutingService.get_transit_matrix(
        pois=pois,
        city_name="Madrid",
        plan_mode="estimated",
    )

    assert len(matrix) == 2
    assert matrix[0][1]["duration_mins"] > 0
    assert matrix[0][1]["is_estimated"] is True
    assert matrix[1][0]["is_estimated"] is True


@pytest.mark.asyncio
async def test_routing_service_unreachable_pair_is_infinite_not_30_mins():
    """Verify unreachable pairs in Valhalla get 9999 mins (infinite), never fake 30 mins."""
    pois = [
        {"location": {"latitude": 40.4138, "longitude": -3.6921}},
        {"location": {"latitude": 40.4153, "longitude": -3.6845}},
    ]

    mock_resp = {
        "sources_to_targets": [
            [
                {"time": 0, "distance": 0.0},
                {"time": None},
            ],  # (0, 1) is disconnected / unreachable
            [{"time": 600, "distance": 0.8}, {"time": 0, "distance": 0.0}],
        ]
    }

    from unittest.mock import MagicMock

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_resp
    mock_post = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient.post", mock_post):
        matrix = await RoutingService.get_transit_matrix(
            pois=pois,
            city_name="Madrid",
            plan_mode="real",
        )

    # (0, 1) is unreachable: must be 9999 mins, not 30 mins
    assert matrix[0][1]["duration_mins"] == UNREACHABLE_DURATION_MINS
    assert matrix[0][1]["mode"] == "unreachable"
    assert matrix[0][1]["is_reachable"] is False

    # (1, 0) is reachable
    assert matrix[1][0]["duration_mins"] == 10
    assert matrix[1][0]["is_reachable"] is True


def test_transit_fare_service_unindexed_city_fare_honesty():
    """Verify unindexed cities return fare_unknown=True and 0.0 EUR, never invented 2.00 EUR."""
    fare = TransitFareService.get_city_transit_fare("NonExistentCityXYZ")

    assert fare.single_fare == 0.0
    assert fare.source == "fare_unknown"
    assert fare.fare_unknown is True
    assert fare.pass_24h_price is None
