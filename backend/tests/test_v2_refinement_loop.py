"""Unit tests for Itinerary v2 Phase 6 Refinement Loop (Critic & Repair)."""

import pytest
from app.schemas.itinerary import TravelConstraints
from app.schemas.user import PacePreference
from app.swarm.critic import (
    CriticIssueType,
    evaluate_itinerary_quality,
)
from app.swarm.repair import apply_repairs, planner_repair_node


def _make_dummy_day(day_idx: int, num_sights: int, has_lunch: bool = True) -> dict:
    path = [
        {
            "poi": {"name": "Hotel Depot", "category": "HOTEL", "duration_mins": 0},
            "scheduled_start": "09:00",
            "scheduled_end": "09:00",
        }
    ]
    for i in range(num_sights):
        path.append(
            {
                "poi": {
                    "name": f"Sight {day_idx}_{i + 1}",
                    "category": "ATTRACTION",
                    "duration_mins": 60,
                },
                "scheduled_start": f"{10 + i:02d}:00",
                "scheduled_end": f"{11 + i:02d}:00",
                "transit_from_previous": {"duration_mins": 10},
            }
        )
    if has_lunch:
        path.append(
            {
                "poi": {
                    "name": f"Lunch Bistro {day_idx + 1}",
                    "category": "RESTAURANT",
                    "duration_mins": 60,
                },
                "scheduled_start": "12:30",
                "scheduled_end": "13:30",
                "transit_from_previous": {"duration_mins": 5},
            }
        )
    return {
        "day": day_idx + 1,
        "itinerary": {"path": path, "total_cost_eur": 50.0, "total_time_mins": 240},
    }


def test_critic_detects_meal_gap_on_full_day():
    constraints = TravelConstraints(
        destination_city="Paris",
        origin_city="London",
        pace=PacePreference.BALANCED,
    )
    # Day 1: Edge day, Day 2: Full day (4 sights, NO lunch), Day 3: Edge day
    days = [
        _make_dummy_day(0, 2, has_lunch=True),
        _make_dummy_day(1, 4, has_lunch=False),
        _make_dummy_day(2, 2, has_lunch=True),
    ]
    itinerary = {"days": days}

    issues, j_score = evaluate_itinerary_quality(itinerary, constraints)

    meal_issues = [i for i in issues if i.issue_type == CriticIssueType.MEAL_GAP]
    assert len(meal_issues) == 1
    assert meal_issues[0].day_index == 1


def test_critic_detects_overloaded_day():
    constraints = TravelConstraints(
        destination_city="Paris",
        origin_city="London",
        pace=PacePreference.LEISURELY,  # Max 4 sights
    )
    days = [
        _make_dummy_day(0, 2),
        _make_dummy_day(1, 6),  # 6 sights > 4
        _make_dummy_day(2, 2),
    ]
    itinerary = {"days": days}

    issues, j_score = evaluate_itinerary_quality(itinerary, constraints)

    overloaded = [i for i in issues if i.issue_type == CriticIssueType.DAY_OVERLOADED]
    assert len(overloaded) == 1
    assert overloaded[0].day_index == 1


def test_repair_injects_lunch_on_meal_gap():
    day_0 = [
        {
            "name": "Hotel",
            "category": "HOTEL",
            "location": {"latitude": 48.8, "longitude": 2.3},
        },
        {"name": "Louvre", "category": "ATTRACTION", "duration_mins": 120, "tier": 1},
        {"name": "Orsay", "category": "ATTRACTION", "duration_mins": 90, "tier": 2},
        {"name": "Eiffel", "category": "ATTRACTION", "duration_mins": 60, "tier": 1},
    ]
    daily_pois = [day_0]
    issues = [
        {
            "issue_type": CriticIssueType.MEAL_GAP,
            "day_index": 0,
            "severity": 1.5,
            "details": "Missing lunch",
        }
    ]

    repaired, modified = apply_repairs(daily_pois, issues)

    assert modified is True
    assert len(repaired[0]) == 5
    injected = next(p for p in repaired[0] if "Lunch" in p["name"])
    assert injected["is_lunch_spot"] is True
    assert injected["open_time_mins_by_day"][0] == 690  # 11:30


def test_repair_relocates_sight_on_overloaded_day():
    day_0 = [
        {"name": "Hotel", "category": "HOTEL"},
        {"name": "Sight 1", "category": "ATTRACTION", "tier": 1},
        {"name": "Sight 2", "category": "ATTRACTION", "tier": 1},
        {"name": "Sight 3", "category": "ATTRACTION", "tier": 2},
        {"name": "Sight 4", "category": "ATTRACTION", "tier": 2},
        {"name": "Sight 5", "category": "ATTRACTION", "tier": 3},  # lowest priority
    ]
    day_1 = [
        {"name": "Hotel", "category": "HOTEL"},
        {"name": "Sight 6", "category": "ATTRACTION", "tier": 1},
    ]
    daily_pois = [day_0, day_1]
    issues = [
        {
            "issue_type": CriticIssueType.DAY_OVERLOADED,
            "day_index": 0,
            "severity": 2.0,
            "details": "Overloaded",
        }
    ]

    repaired, modified = apply_repairs(daily_pois, issues)

    assert modified is True
    # Sight 5 relocated from day 0 to day 1
    assert not any(p["name"] == "Sight 5" for p in repaired[0])
    assert any(p["name"] == "Sight 5" for p in repaired[1])


@pytest.mark.asyncio
async def test_repair_terminates_and_increments_iteration():
    daily_pois = [[{"name": "Hotel", "category": "HOTEL"}]]
    state = {
        "daily_pois_data": daily_pois,
        "critic_issues": [],
        "refinement_iteration": 2,
    }

    result = await planner_repair_node(state, {})

    assert result["refinement_iteration"] == 3
    assert result["critic_issues"] == []
