"""Unit and fail-fast tests for Phase 7: RoutingService & Fare Honesty."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.engine.exceptions import RoutingUnavailable
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


@pytest.mark.asyncio
async def test_routing_service_pedestrian_matrix_payload_and_modes():
    """Verify get_transit_matrix uses pedestrian costing on Valhalla matrix endpoint and correctly partitions pedestrian vs transit legs."""
    pois = [
        {"location": {"latitude": 40.4138, "longitude": -3.6921}},
        {"location": {"latitude": 40.4153, "longitude": -3.6845}},
        {"location": {"latitude": 40.4500, "longitude": -3.6800}},
    ]

    mock_resp = {
        "sources_to_targets": [
            [
                {"time": 0, "distance": 0.0},
                {
                    "time": 480,
                    "distance": 0.8,
                },  # <= 1.0 km: pedestrian mode, 8 mins, 0 cost
                {
                    "time": 3000,
                    "distance": 4.5,
                },  # > 1.0 km: transit mode, (4.5 / 25 * 60) + 6 = 16 mins, fare
            ],
            [
                {"time": 480, "distance": 0.8},
                {"time": 0, "distance": 0.0},
                {"time": 2400, "distance": 3.8},
            ],
            [
                {"time": 3000, "distance": 4.5},
                {"time": 2400, "distance": 3.8},
                {"time": 0, "distance": 0.0},
            ],
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

    # 1. Assert pedestrian costing sent to matrix API
    call_json = mock_post.call_args[1]["json"]
    assert call_json["costing"] == "pedestrian"
    assert "date_time" not in call_json

    # 2. Short leg (0, 1): 0.8km <= 1.0km -> pedestrian
    assert matrix[0][1]["mode"] == "pedestrian"
    assert matrix[0][1]["duration_mins"] == 8
    assert matrix[0][1]["cost_eur"] == 0.0

    # 3. Long leg (0, 2): 4.5km > 1.0km -> transit
    assert matrix[0][2]["mode"] == "transit"
    assert (
        matrix[0][2]["duration_mins"] == 16
    )  # int(4.5 / 25.0 * 60) + 6 = 10.8 + 6 = 16
    assert matrix[0][2]["cost_eur"] == 1.50


@pytest.mark.asyncio
async def test_routing_service_includes_response_body_on_http_error():
    """Verify HTTPStatusError includes Valhalla response text for clear error reporting."""
    from unittest.mock import MagicMock

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = (
        '{"error_code": 140, "error": "Action does not support multimodal costing"}'
    )
    http_err = httpx.HTTPStatusError(
        "Client error '400 Bad Request'", request=MagicMock(), response=mock_resp
    )

    with (
        patch("httpx.AsyncClient.post", side_effect=http_err),
        pytest.raises(RoutingUnavailable) as exc_info,
    ):
        await RoutingService.get_transit_matrix(
            pois=[{"location": {"latitude": 40.4, "longitude": -3.7}}],
            city_name="Sevilla",
            plan_mode="real",
        )

    assert 'Body: {"error_code": 140' in str(exc_info.value)
