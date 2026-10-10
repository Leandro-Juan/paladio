from datetime import date, time
from typing import Any
import pytest

from app.domain.entities.poi import Poi, PoiLocation
from app.engine.v2.day_assignment import AssignedDay
from app.engine.v2.solver import _normalize_meal_slot, solve_day_v2
from app.engine.v2.trip_frame import build_trip_frame
from app.schemas.itinerary import MealRequirement, PacePreference, TravelConstraints
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase


def test_meal_requirement_defense_in_depth():
    """Verify MealRequirement supports .lower() and .upper() and helper normalizes correctly."""
    meal = MealRequirement(
        meal_type="BREAKFAST",
        start_time=time(8, 0),
        end_time=time(10, 0),
    )
    assert meal.lower() == "breakfast"
    assert meal.upper() == "BREAKFAST"

    assert _normalize_meal_slot(meal) == "breakfast"
    assert _normalize_meal_slot({"meal_type": "LUNCH"}) == "lunch"
    assert _normalize_meal_slot({"type": "DINNER"}) == "dinner"
    assert _normalize_meal_slot("Dinner") == "dinner"


@pytest.mark.asyncio
async def test_solve_day_v2_with_meal_requirements():
    """Verify solve_day_v2 runs without AttributeError when constraints contain MealRequirement objects."""
    depot = Poi(
        id="hotel_depot",
        name="Hotel Santa Cruz",
        city="Sevilla",
        category="HOTEL",
        location=PoiLocation(latitude=37.3891, longitude=-5.9845),
        open_time_mins_by_day=[0] * 7,
        close_time_mins_by_day=[1440] * 7,
        duration_mins=1,
        cost_eur=0.0,
    )

    from app.engine.v2.candidate_pool import CandidatePoi
    from app.engine.v2.selection import SelectedPoi, SelectionReasonCode

    c_poi = CandidatePoi(
        id="poi_alcazar",
        name="Real Alcazar de Sevilla",
        city="Sevilla",
        category="ATTRACTION",
        location={"latitude": 37.3838, "longitude": -5.9912},
        open_time_mins_by_day=[540] * 7,
        close_time_mins_by_day=[1140] * 7,
        duration_mins=90,
        cost_eur=14.5,
        tier=1,
        iconicity_score=1.0,
    )
    sel_poi = SelectedPoi(
        poi=c_poi,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=50.0,
    )

    assigned_day = AssignedDay(
        day_index=0,
        weekday=0,
        start_time_mins=540,  # 09:00
        end_time_mins=1380,  # 23:00
        anchor_poi=sel_poi,
        pois=[sel_poi],
        zone_candidates=[],
        daily_budget_eur=150.0,
        requested_meals=["breakfast", "lunch", "dinner"],
    )

    constraints = TravelConstraints(
        destination_city="Sevilla",
        pace=PacePreference.BALANCED,
        meals=[
            MealRequirement(
                meal_type="BREAKFAST", start_time=time(8, 0), end_time=time(10, 0)
            ),
            MealRequirement(
                meal_type="LUNCH", start_time=time(12, 0), end_time=time(14, 30)
            ),
            MealRequirement(
                meal_type="DINNER", start_time=time(19, 30), end_time=time(22, 0)
            ),
        ],
    )

    def mock_transit(pois: list[dict[str, Any]], city: str) -> list[list[Any]]:
        n = len(pois)
        return [
            [{"duration_mins": 5, "cost_eur": 0.0} for _ in range(n)] for _ in range(n)
        ]

    res = await solve_day_v2(
        assigned_day=assigned_day,
        city="Sevilla",
        constraints=constraints,
        depot_poi=depot,
        candidate_pool=[],
        transit_matrix_fn=mock_transit,
    )

    assert res is not None
    assert len(res.itinerary.path) > 0


def test_trip_frame_distributes_meals_dynamically():
    """Verify TripFrame dynamically schedules meal windows without hardcoding."""
    constraints = TravelConstraints(
        origin_city="Madrid",
        destination_city="Sevilla",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 3),
        meals=[
            MealRequirement(
                meal_type="BREAKFAST", start_time=time(8, 0), end_time=time(10, 0)
            ),
            MealRequirement(
                meal_type="LUNCH", start_time=time(12, 0), end_time=time(14, 30)
            ),
            MealRequirement(
                meal_type="DINNER", start_time=time(19, 30), end_time=time(22, 0)
            ),
        ],
    )

    # Simulate evening arrival flight on day 0 (18:00 -> 1080 mins)
    outbound_flight = {"arrival_time": "18:00"}
    frame = build_trip_frame(
        constraints,
        outbound_flight=outbound_flight,
        city_center=(37.3891, -5.9845),
    )

    assert len(frame.days) == 3
    # Day 0: Arrives at 18:00, cannot have breakfast or lunch
    assert "breakfast" not in frame.days[0].requested_meals
    assert "lunch" not in frame.days[0].requested_meals
    assert "dinner" in frame.days[0].requested_meals

    # Day 1: Full day (starts 09:00, 540 mins), has lunch and dinner
    assert "lunch" in frame.days[1].requested_meals
    assert "dinner" in frame.days[1].requested_meals


@pytest.mark.asyncio
async def test_optimize_daily_itinerary_dynamic_sevilla():
    """End-to-end test with OptimizeDailyItineraryUseCase for Sevilla and MealRequirements."""
    constraints = TravelConstraints(
        origin_city="Madrid",
        destination_city="Sevilla",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 2),
        budget_usd=1000.0,
        meals=[
            MealRequirement(
                meal_type="BREAKFAST", start_time=time(8, 0), end_time=time(10, 0)
            ),
            MealRequirement(
                meal_type="LUNCH", start_time=time(12, 0), end_time=time(14, 30)
            ),
            MealRequirement(
                meal_type="DINNER", start_time=time(19, 30), end_time=time(22, 0)
            ),
        ],
    )

    pois_data = [
        [
            {
                "name": "Hotel Sevilla",
                "category": "HOTEL",
                "city": "Sevilla",
                "cost_eur": 50.0,
                "duration_mins": 10,
                "open_time_mins_by_day": [0] * 7,
                "close_time_mins_by_day": [1440] * 7,
                "location": {"latitude": 37.3891, "longitude": -5.9845},
                "poi_id": "hotel1",
            },
            {
                "name": "Alcazar",
                "category": "ATTRACTION",
                "city": "Sevilla",
                "cost_eur": 15.0,
                "duration_mins": 90,
                "open_time_mins_by_day": [540] * 7,
                "close_time_mins_by_day": [1200] * 7,
                "location": {"latitude": 37.3838, "longitude": -5.9912},
                "poi_id": "poi1",
            },
            {
                "name": "Catedral",
                "category": "ATTRACTION",
                "city": "Sevilla",
                "cost_eur": 12.0,
                "duration_mins": 90,
                "open_time_mins_by_day": [540] * 7,
                "close_time_mins_by_day": [1200] * 7,
                "location": {"latitude": 37.3858, "longitude": -5.9931},
                "poi_id": "poi2",
            },
        ]
    ]

    def mock_transit(pois: list[dict[str, Any]], city: str) -> list[list[Any]]:
        n = len(pois)
        return [
            [{"duration_mins": 5, "cost_eur": 0.0} for _ in range(n)] for _ in range(n)
        ]

    uc = OptimizeDailyItineraryUseCase(transit_matrix_fn=mock_transit)
    res = await uc.execute(constraints, daily_pois_data=pois_data)

    assert "days" in res
    assert len(res["days"]) > 0
