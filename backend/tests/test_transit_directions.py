import pytest
from unittest.mock import AsyncMock, patch

from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.transit_service import calculate_point_to_point_directions


@pytest.mark.asyncio
async def test_reasonable_route_heuristic_short_walk():
    """
    Verifies that for short journeys (<= 15 min walk), direct walking is prioritized
    as the primary route with transit as an alternative option.
    """
    mock_walk = TransitLeg(
        duration_mins=8,
        cost_eur=0.0,
        mode="pedestrian",
        steps=[TransitStep(type="walk", instruction="Walk 600m", duration_mins=8)],
        geometry=[[40.4168, -3.7038], [40.4150, -3.7070]],
    )
    mock_transit = TransitLeg(
        duration_mins=14,
        cost_eur=1.50,
        mode="transit",
        steps=[
            TransitStep(type="walk", instruction="Walk to station", duration_mins=4),
            TransitStep(
                type="transit",
                instruction="Metro Line 1",
                duration_mins=6,
                transit_line="1",
            ),
            TransitStep(
                type="walk", instruction="Walk to destination", duration_mins=4
            ),
        ],
        geometry=[[40.4168, -3.7038], [40.4150, -3.7070]],
    )

    with patch(
        "app.services.transit_service.get_detailed_walking_leg",
        new=AsyncMock(return_value=mock_walk),
    ), patch(
        "app.services.transit_service.get_detailed_transit_leg",
        new=AsyncMock(return_value=mock_transit),
    ):
        result = await calculate_point_to_point_directions(
            origin={"name": "Sol", "lat": 40.4168, "lon": -3.7038},
            destination={"name": "Plaza Mayor", "lat": 40.4150, "lon": -3.7070},
            city="Madrid",
        )

    assert result["primary_mode"] == "pedestrian"
    assert result["primary_leg"].duration_mins == 8
    assert result["alternative_leg"] is not None
    assert result["alternative_leg"].mode == "transit"
    assert "Direct walking" in result["recommendation_reason"]


@pytest.mark.asyncio
async def test_reasonable_route_heuristic_long_trip():
    """
    Verifies that for long journeys (> 20 min walk), public transit is prioritized
    as the primary route with direct walking as an alternative reference.
    """
    mock_walk = TransitLeg(
        duration_mins=65,
        cost_eur=0.0,
        mode="pedestrian",
        steps=[TransitStep(type="walk", instruction="Walk 5 km", duration_mins=65)],
        geometry=[[40.4168, -3.7038], [40.4531, -3.6883]],
    )
    mock_transit = TransitLeg(
        duration_mins=22,
        cost_eur=1.50,
        mode="transit",
        steps=[
            TransitStep(type="walk", instruction="Walk to Sol", duration_mins=3),
            TransitStep(
                type="transit",
                instruction="Metro Line 10",
                duration_mins=16,
                transit_line="10",
            ),
            TransitStep(type="walk", instruction="Walk to Bernabeu", duration_mins=3),
        ],
        geometry=[[40.4168, -3.7038], [40.4531, -3.6883]],
    )

    with patch(
        "app.services.transit_service.get_detailed_walking_leg",
        new=AsyncMock(return_value=mock_walk),
    ), patch(
        "app.services.transit_service.get_detailed_transit_leg",
        new=AsyncMock(return_value=mock_transit),
    ):
        result = await calculate_point_to_point_directions(
            origin={"name": "Sol", "lat": 40.4168, "lon": -3.7038},
            destination={"name": "Bernabeu", "lat": 40.4531, "lon": -3.6883},
            city="Madrid",
        )

    assert result["primary_mode"] == "transit"
    assert result["primary_leg"].duration_mins == 22
    assert result["alternative_leg"] is not None
    assert result["alternative_leg"].duration_mins == 65
    assert "saves 43 minutes" in result["recommendation_reason"]


@pytest.mark.asyncio
async def test_reasonable_route_heuristic_transit_has_no_transit_steps():
    """
    When the multimodal router only finds walking maneuvers, direct walking is used
    and no redundant alternative is displayed.
    """
    mock_walk = TransitLeg(
        duration_mins=12,
        cost_eur=0.0,
        mode="pedestrian",
        steps=[TransitStep(type="walk", instruction="Walk 900m", duration_mins=12)],
        geometry=[[40.4168, -3.7038], [40.4200, -3.7000]],
    )
    # Transit router only returned a walk maneuver
    mock_transit_walk_only = TransitLeg(
        duration_mins=12,
        cost_eur=0.0,
        mode="pedestrian",
        steps=[TransitStep(type="walk", instruction="Walk 900m", duration_mins=12)],
        geometry=[[40.4168, -3.7038], [40.4200, -3.7000]],
    )

    with patch(
        "app.services.transit_service.get_detailed_walking_leg",
        new=AsyncMock(return_value=mock_walk),
    ), patch(
        "app.services.transit_service.get_detailed_transit_leg",
        new=AsyncMock(return_value=mock_transit_walk_only),
    ):
        result = await calculate_point_to_point_directions(
            origin={"name": "Sol", "lat": 40.4168, "lon": -3.7038},
            destination={"name": "Gran Via", "lat": 40.4200, "lon": -3.7000},
            city="Madrid",
        )

    assert result["primary_mode"] == "pedestrian"
    assert result["alternative_leg"] is None


@pytest.mark.asyncio
async def test_transit_directions_api_endpoints(async_client):
    """
    Tests POST /api/transit/directions endpoint.
    """
    mock_walk = TransitLeg(
        duration_mins=10,
        cost_eur=0.0,
        mode="pedestrian",
        steps=[TransitStep(type="walk", instruction="Walk", duration_mins=10)],
        geometry=[[40.4168, -3.7038], [40.4180, -3.7050]],
    )
    mock_transit = TransitLeg(
        duration_mins=18,
        cost_eur=1.50,
        mode="transit",
        steps=[
            TransitStep(
                type="transit",
                instruction="Metro 1",
                duration_mins=12,
                transit_line="1",
            )
        ],
        geometry=[[40.4168, -3.7038], [40.4180, -3.7050]],
    )

    with patch(
        "app.services.transit_service.get_detailed_walking_leg",
        new=AsyncMock(return_value=mock_walk),
    ), patch(
        "app.services.transit_service.get_detailed_transit_leg",
        new=AsyncMock(return_value=mock_transit),
    ):
        resp = await async_client.post(
            "/api/transit/directions",
            json={
                "origin": {"name": "Sol", "lat": 40.4168, "lon": -3.7038},
                "destination": {"name": "Callao", "lat": 40.4180, "lon": -3.7050},
                "date_time": "2026-09-15T09:00:00",
                "date_time_type": 1,
                "city": "Madrid",
            },
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "primary_mode" in data
    assert "primary_leg" in data
    assert data["primary_leg"]["duration_mins"] == 10
    assert "recommendation_reason" in data


@pytest.mark.asyncio
async def test_locations_places_api_endpoint(async_client):
    """
    Tests GET /api/locations/places endpoint.
    """
    resp = await async_client.get("/api/locations/places?q=Prado&city=Madrid&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
