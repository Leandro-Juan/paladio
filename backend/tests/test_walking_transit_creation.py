import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.transit_service import ensure_walking_legs_populated
from app.use_cases.upgrade_trip_transit import UpgradeTripTransitUseCase


@pytest.mark.asyncio
async def test_ensure_walking_legs_populated_distinguishes_walk_and_transit():
    """
    Verify that ensure_walking_legs_populated resolves real walking directions
    for close waypoints (<=1.2 km) and sets placeholder transit for distant waypoints.
    """
    mock_walk_leg = TransitLeg(
        duration_mins=8,
        cost_eur=0.0,
        cost_is_estimated=False,
        mode="pedestrian",
        steps=[
            TransitStep(
                type="walk",
                instruction="Walk west on Calle Mayor",
                duration_mins=8,
                distance_km=0.6,
            )
        ],
    )

    sample_itinerary = {
        "days": [
            {
                "day": 1,
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "name": "Puerta del Sol",
                                "location": {"latitude": 40.4169, "longitude": -3.7038},
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:00",
                        },
                        {
                            # ~0.5 km away (Walkable)
                            "poi": {
                                "name": "Mercado de San Miguel",
                                "location": {"latitude": 40.4154, "longitude": -3.7090},
                            },
                            "scheduled_start": "10:15",
                            "scheduled_end": "11:00",
                        },
                        {
                            # ~4.5 km away (Requires public transit)
                            "poi": {
                                "name": "Santiago Bernabéu",
                                "location": {"latitude": 40.4530, "longitude": -3.6883},
                            },
                            "scheduled_start": "11:30",
                            "scheduled_end": "13:00",
                        },
                    ]
                },
            }
        ]
    }

    with patch(
        "app.services.transit_service.get_detailed_walking_leg", new_callable=AsyncMock
    ) as mock_get_walk:
        mock_get_walk.return_value = mock_walk_leg
        result = await ensure_walking_legs_populated(sample_itinerary, city="Madrid")

        path = result["days"][0]["itinerary"]["path"]
        # Leg 1 (Sol -> San Miguel, ~0.5km): Walkable
        walk_leg = path[1]["transit_from_previous"]
        assert walk_leg is not None
        assert walk_leg["mode"] == "pedestrian"
        assert walk_leg["cost_eur"] == 0.0
        assert not walk_leg["cost_is_estimated"]
        assert len(walk_leg["steps"]) == 1
        assert walk_leg["steps"][0]["instruction"] == "Walk west on Calle Mayor"

        # Leg 2 (San Miguel -> Bernabéu, ~4.5km): Public transit
        trans_leg = path[2]["transit_from_previous"]
        assert trans_leg is not None
        assert trans_leg["mode"] == "transit"
        assert trans_leg["cost_is_estimated"] is True
        assert trans_leg["cost_eur"] > 0


@pytest.mark.asyncio
async def test_upgrade_transit_preserves_walking_legs():
    """
    Verify that UpgradeTripTransitUseCase preserves resolved walking legs
    and only calls get_detailed_transit_leg for public transit legs.
    """
    mock_trip = MagicMock()
    mock_trip.id = "trip-walk-and-transit"
    mock_trip.destination = "Madrid"
    mock_trip.itinerary_data = {
        "days": [
            {
                "day": 1,
                "date": "2026-09-23",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "name": "Start",
                                "location": {"latitude": 40.4169, "longitude": -3.7038},
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:00",
                        },
                        {
                            # Pre-existing real walking leg
                            "poi": {
                                "name": "Walk Stop",
                                "location": {"latitude": 40.4154, "longitude": -3.7090},
                            },
                            "scheduled_start": "10:10",
                            "scheduled_end": "11:00",
                            "transit_from_previous": {
                                "mode": "pedestrian",
                                "duration_mins": 10,
                                "cost_eur": 0.0,
                                "cost_is_estimated": False,
                                "steps": [
                                    {
                                        "type": "walk",
                                        "instruction": "Original walking directions",
                                        "duration_mins": 10,
                                    }
                                ],
                            },
                        },
                        {
                            # Public transit leg needing upgrade
                            "poi": {
                                "name": "Far Stop",
                                "location": {"latitude": 40.4530, "longitude": -3.6883},
                            },
                            "scheduled_start": "11:30",
                            "scheduled_end": "13:00",
                            "transit_from_previous": {
                                "mode": "transit",
                                "duration_mins": 20,
                                "cost_eur": 1.5,
                                "cost_is_estimated": True,
                            },
                        },
                    ]
                },
            }
        ]
    }

    mock_session = AsyncMock()
    mock_session.execute.return_value = MagicMock(scalar_one_or_none=lambda: mock_trip)

    upgraded_transit_leg = TransitLeg(
        duration_mins=18,
        cost_eur=1.5,
        cost_is_estimated=False,
        mode="transit",
        steps=[
            TransitStep(
                type="transit",
                instruction="Board Metro Line 10",
                duration_mins=18,
                transit_line="10",
            )
        ],
    )

    with patch(
        "app.use_cases.upgrade_trip_transit.get_detailed_transit_leg",
        new_callable=AsyncMock,
    ) as mock_get_transit:
        mock_get_transit.return_value = upgraded_transit_leg

        use_case = UpgradeTripTransitUseCase(mock_session)
        result = await use_case.execute("trip-walk-and-transit")

        assert result["status"] == "success"
        path = mock_trip.itinerary_data["days"][0]["itinerary"]["path"]

        # Only 1 call to get_detailed_transit_leg (for the transit leg, NOT for the walking leg!)
        assert mock_get_transit.call_count == 1

        # Walking leg preserved exactly
        walk_leg = path[1]["transit_from_previous"]
        assert walk_leg["mode"] == "pedestrian"
        assert walk_leg["steps"][0]["instruction"] == "Original walking directions"

        # Transit leg upgraded
        trans_leg = path[2]["transit_from_previous"]
        assert trans_leg["mode"] == "transit"
        assert trans_leg["steps"][0]["transit_line"] == "10"
        assert not trans_leg["cost_is_estimated"]


@pytest.mark.asyncio
async def test_upgrade_transit_all_walking_legs_succeeds_without_gtfs():
    """
    Verify that if a trip consists entirely of walking legs, UpgradeTripTransitUseCase
    preserves all walking legs and completes without raising TransitRoutingError.
    """
    mock_trip = MagicMock()
    mock_trip.id = "trip-all-walk"
    mock_trip.destination = "Madrid"
    mock_trip.itinerary_data = {
        "days": [
            {
                "day": 1,
                "date": "2026-09-23",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "name": "Start",
                                "location": {"latitude": 40.4169, "longitude": -3.7038},
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:00",
                        },
                        {
                            "poi": {
                                "name": "Stop 1",
                                "location": {"latitude": 40.4154, "longitude": -3.7090},
                            },
                            "scheduled_start": "10:10",
                            "scheduled_end": "11:00",
                            "transit_from_previous": {
                                "mode": "pedestrian",
                                "duration_mins": 10,
                                "cost_eur": 0.0,
                                "cost_is_estimated": False,
                                "steps": [
                                    {
                                        "type": "walk",
                                        "instruction": "Walk to Stop 1",
                                        "duration_mins": 10,
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
    mock_session.execute.return_value = MagicMock(scalar_one_or_none=lambda: mock_trip)

    with patch(
        "app.use_cases.upgrade_trip_transit.get_detailed_transit_leg",
        new_callable=AsyncMock,
    ) as mock_get_transit:
        use_case = UpgradeTripTransitUseCase(mock_session)
        result = await use_case.execute("trip-all-walk")

        assert result["status"] == "success"
        # get_detailed_transit_leg was never called because all legs were already walking!
        assert mock_get_transit.call_count == 0
