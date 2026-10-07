"""Unit and integration tests for Phase 5b: Budget, Meals, Feasibility, and Pipeline."""

from unittest.mock import AsyncMock

import pytest
from app.domain.entities.poi import Poi, PoiLocation
from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.v2.budget import (
    allocate_trip_budget,
    convert_currency,
    redistribute_budget_slack,
)
from app.engine.v2.candidate_pool import CandidatePoi, _poi_to_candidate
from app.engine.v2.day_assignment import AssignedDay
from app.engine.v2.feasibility import probe_mandatory_feasibility
from app.engine.v2.meals import select_daily_meal_candidates
from app.engine.v2.pipeline import run_itinerary_v2_pipeline
from app.engine.v2.selection import SelectedPoi, SelectionReasonCode
from app.engine.v2.solver import solve_day_v2
from app.schemas.itinerary import PacePreference, TravelConstraints


def _make_candidate(
    name: str,
    lat: float,
    lon: float,
    duration: int = 90,
    cost: float = 15.0,
    tier: int = 1,
    is_mandatory: bool = False,
    is_meal: bool = False,
) -> CandidatePoi:
    p = Poi(
        id=name.lower().replace(" ", "_"),
        name=name,
        city="Paris",
        category="RESTAURANT" if is_meal else "attraction",
        location=PoiLocation(latitude=lat, longitude=lon),
        open_time_mins_by_day=[540] * 7,
        close_time_mins_by_day=[1200] * 7,
        duration_mins=duration,
        cost_eur=cost,
        tier=tier,
        iconicity_score=0.9 if tier == 1 else 0.5,
        taxonomy_category="food_culinary" if is_meal else "art_culture",
        category_id=5 if is_meal else 0,
    )
    return _poi_to_candidate(p, taste_score=85.0, is_mandatory=is_mandatory)


def test_currency_conversion_and_budget_allocation():
    # 1. Currency conversion test
    eur = convert_currency(
        100.0, from_currency="USD", to_currency="EUR", exchange_rate=0.92
    )
    assert eur == 92.0

    # 2. Pro-rata budget allocation
    c1 = _make_candidate("Louvre", 48.86, 2.33, cost=20.0)
    c2 = _make_candidate("Orsay", 48.85, 2.32, cost=15.0)
    c3 = _make_candidate("Eiffel", 48.85, 2.29, cost=30.0)

    sel1 = SelectedPoi(
        poi=c1,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=50.0,
    )
    sel2 = SelectedPoi(
        poi=c2,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=50.0,
    )
    sel3 = SelectedPoi(
        poi=c3,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=50.0,
    )

    days = [
        AssignedDay(day_index=0, weekday=0, pois=[sel1, sel2]),  # base ~35 + 25 = 60
        AssignedDay(day_index=1, weekday=1, pois=[sel3]),  # base ~30 + 25 = 55
    ]

    allocated = allocate_trip_budget(days, total_budget_usd=200.0, exchange_rate=0.92)
    assert len(allocated) == 2
    assert allocated[0].daily_budget_eur > 0
    assert allocated[1].daily_budget_eur > 0
    # Total budget in EUR is 184.0, day 0 should receive slightly more than day 1
    assert allocated[0].daily_budget_eur >= allocated[1].daily_budget_eur
    assert (
        round(allocated[0].daily_budget_eur + allocated[1].daily_budget_eur, 1) == 184.0
    )

    # 3. Slack redistribution
    day1_before = allocated[1].daily_budget_eur
    redistribute_budget_slack(unspent_eur=20.0, subsequent_days=allocated[1:])
    assert allocated[1].daily_budget_eur == round(day1_before + 20.0, 2)


def test_probe_mandatory_feasibility():
    # Feasible mandatory
    p_feas = Poi(
        name="Valid Museum",
        city="Paris",
        category="attraction",
        open_time_mins_by_day=[600] * 7,
        close_time_mins_by_day=[1100] * 7,
        duration_mins=120,
    )
    p_feas.is_mandatory = True

    # Closed on Monday (weekday=0)
    p_closed = Poi(
        name="Closed Museum",
        city="Paris",
        category="attraction",
        open_time_mins_by_day=[-1, 600, 600, 600, 600, 600, 600],
        close_time_mins_by_day=[-1, 1100, 1100, 1100, 1100, 1100, 1100],
        duration_mins=60,
    )
    p_closed.is_mandatory = True

    # Window outside day schedule
    p_outside = Poi(
        name="Night Club",
        city="Paris",
        category="attraction",
        open_time_mins_by_day=[1300] * 7,
        close_time_mins_by_day=[1440] * 7,
        duration_mins=60,
    )
    p_outside.is_mandatory = True

    res = probe_mandatory_feasibility(
        pois=[p_feas, p_closed, p_outside],
        day_start_mins=540,
        day_end_mins=1080,
        day_weekday=0,
    )

    assert "Valid Museum" in res.feasible_mandatory_ids
    assert "Closed Museum" in res.infeasible_mandatory_ids
    assert "Night Club" in res.infeasible_mandatory_ids
    assert len(res.warnings) >= 2


def test_select_daily_meal_candidates():
    # Anchor near Louvre
    anchor_lat = 48.8606
    anchor_lon = 2.3376

    m1 = _make_candidate("Bistrot Louvre", 48.8610, 2.3380, is_meal=True)
    m2 = _make_candidate("Cafe Palais", 48.8615, 2.3370, is_meal=True)
    m3 = _make_candidate("Brasserie Tuileries", 48.8620, 2.3360, is_meal=True)
    m4 = _make_candidate("Distant Restaurant", 48.9000, 2.4000, is_meal=True)

    candidates = select_daily_meal_candidates(
        anchor_lat=anchor_lat,
        anchor_lon=anchor_lon,
        candidate_pool=[m1, m2, m3, m4],
        requested_slots=["lunch", "dinner"],
        candidates_per_slot=2,
    )

    assert len(candidates) == 4
    names = [c.name for c in candidates]
    assert any("Lunch" in n for n in names)
    assert any("Dinner" in n for n in names)


@pytest.mark.asyncio
async def test_solve_day_v2_with_arrival_times():
    # Mock fast transit matrix
    def mock_transit(pois, city):
        n = len(pois)
        return [
            [{"duration_mins": 10, "cost_eur": 1.50} for _ in range(n)]
            for _ in range(n)
        ]

    depot = Poi(
        id="hotel_depot",
        name="Hotel Depot",
        city="Paris",
        category="HOTEL",
        location=PoiLocation(latitude=48.8566, longitude=2.3522),
        open_time_mins_by_day=[0] * 7,
        close_time_mins_by_day=[1440] * 7,
        duration_mins=1,
    )

    c1 = _make_candidate("Louvre", 48.8606, 2.3376, duration=90, tier=1)
    sel1 = SelectedPoi(
        poi=c1,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=50.0,
    )

    assigned_day = AssignedDay(
        day_index=0,
        weekday=1,
        start_time_mins=540,
        end_time_mins=1080,
        anchor_poi=sel1,
        pois=[sel1],
        daily_budget_eur=80.0,
        theme="Art & Masterpieces",
    )

    constraints = TravelConstraints(pace=PacePreference.BALANCED)

    res = await solve_day_v2(
        assigned_day=assigned_day,
        city="Paris",
        constraints=constraints,
        depot_poi=depot,
        candidate_pool=[c1],
        transit_matrix_fn=mock_transit,
    )

    assert res.day_index == 0
    assert len(res.itinerary.path) >= 2
    # Verify arrival times are formatted correctly
    for step in res.itinerary.path:
        assert ":" in step.scheduled_start
        assert ":" in step.scheduled_end


@pytest.mark.asyncio
async def test_run_itinerary_v2_pipeline_paris():
    def mock_transit(pois, city):
        n = len(pois)
        return [
            [{"duration_mins": 10, "cost_eur": 1.50} for _ in range(n)]
            for _ in range(n)
        ]

    # Mock POI repository
    mock_repo = AsyncMock(spec=IPoiRepository)
    p1 = Poi(
        id="louvre",
        name="Louvre",
        city="Paris",
        category="attraction",
        location=PoiLocation(latitude=48.8606, longitude=2.3376),
        open_time_mins_by_day=[540] * 7,
        close_time_mins_by_day=[1200] * 7,
        duration_mins=120,
        cost_eur=22.0,
        tier=1,
        iconicity_score=0.99,
        taxonomy_category="art_culture",
    )
    p2 = Poi(
        id="eiffel",
        name="Eiffel Tower",
        city="Paris",
        category="attraction",
        location=PoiLocation(latitude=48.8584, longitude=2.2945),
        open_time_mins_by_day=[540] * 7,
        close_time_mins_by_day=[1320] * 7,
        duration_mins=90,
        cost_eur=25.0,
        tier=1,
        iconicity_score=0.98,
        taxonomy_category="scenic_views",
    )
    mock_repo.find_tiered_pois.return_value = [p1, p2]
    mock_repo.find_semantic_candidates.return_value = []

    constraints = TravelConstraints(
        city="Paris",
        days=2,
        pace=PacePreference.BALANCED,
        budget_usd=300.0,
    )

    result = await run_itinerary_v2_pipeline(
        city="Paris",
        constraints=constraints,
        poi_repo=mock_repo,
        transit_matrix_fn=mock_transit,
    )

    assert result.city == "Paris"
    assert len(result.days) == 2
    assert result.summary.closure_violations == 0
    assert result.summary.total_cost_eur >= 0.0
    for day in result.days:
        assert "theme" in day
        assert "itinerary" in day


@pytest.mark.asyncio
async def test_solve_day_v2_schedules_surplus_and_virtual_meals():
    """Verify solve_day_v2 orienteers surplus zone candidates and schedules virtual meals."""
    depot = Poi(
        id="hotel_depot",
        name="Hotel Depot",
        city="Paris",
        category="HOTEL",
        location=PoiLocation(latitude=48.86, longitude=2.33),
        open_time_mins_by_day=[0] * 7,
        close_time_mins_by_day=[1440] * 7,
        duration_mins=1,
    )

    # 1 Primary committed POI
    c_primary = _make_candidate("Louvre", 48.8606, 2.3376, duration=120)
    sel_primary = SelectedPoi(
        poi=c_primary,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=120,
        marginal_gain=50.0,
    )

    # 5 Surplus zone candidates nearby
    surplus_cands = [
        _make_candidate(
            f"Sight_{i}", 48.861 + i * 0.002, 2.338 + i * 0.002, duration=60
        )
        for i in range(5)
    ]
    surplus_sels = [
        SelectedPoi(
            poi=sc,
            reason_code=SelectionReasonCode.SELECTED_DIVERSE_ANCHOR,
            visit_mode="full",
            effective_duration_mins=60,
            marginal_gain=40.0,
        )
        for sc in surplus_cands
    ]

    assigned_day = AssignedDay(
        day_index=0,
        weekday=0,
        start_time_mins=540,  # 09:00
        end_time_mins=1380,  # 23:00 (full day)
        anchor_poi=sel_primary,
        pois=[sel_primary],
        zone_candidates=surplus_sels,
        daily_budget_eur=150.0,
        requested_meals=["lunch", "dinner"],
    )

    def mock_transit(pois, city):
        n = len(pois)
        return [
            [{"duration_mins": 5, "cost_eur": 0.0} for _ in range(n)] for _ in range(n)
        ]

    constraints = TravelConstraints(pace=PacePreference.BALANCED)

    res = await solve_day_v2(
        assigned_day=assigned_day,
        city="Paris",
        constraints=constraints,
        depot_poi=depot,
        candidate_pool=[],
        transit_matrix_fn=mock_transit,
    )

    # Path must contain more than just primary POI + depots: it must schedule surplus sights!
    path_names = [step.poi.name for step in res.itinerary.path]
    assert len(res.itinerary.path) >= 4
    # Must include primary
    assert any("Louvre" in n for n in path_names)
    # Must schedule at least 1 surplus sight
    assert any("Sight_" in n for n in path_names)
    # Must schedule virtual lunch or dinner
    assert any("Virtual" in n or "Lunch" in n or "Dinner" in n for n in path_names)


@pytest.mark.asyncio
async def test_solve_day_v2_fail_fast_on_infeasible_mandatory():
    """Verify solve_day_v2 raises ItineraryInfeasible if user mandatory is impossible."""
    from app.engine.v2.exceptions import ItineraryInfeasible

    depot = Poi(
        id="hotel",
        name="Hotel",
        city="Paris",
        category="HOTEL",
        location=PoiLocation(latitude=48.86, longitude=2.33),
        open_time_mins_by_day=[0] * 7,
        close_time_mins_by_day=[1440] * 7,
        duration_mins=1,
    )

    # POI closed on Monday (weekday=0)
    c_closed = _make_candidate("Closed Louvre", 48.86, 2.33, duration=120)
    c_closed.open_time_mins_by_day[0] = -1
    c_closed.close_time_mins_by_day[0] = -1
    c_closed.is_user_mandatory = True
    c_closed.is_mandatory = True

    sel_mand = SelectedPoi(
        poi=c_closed,
        reason_code=SelectionReasonCode.SELECTED_USER_MANDATORY,
        visit_mode="full",
        effective_duration_mins=120,
        marginal_gain=100.0,
    )

    assigned_day = AssignedDay(
        day_index=0,
        weekday=0,  # Monday
        start_time_mins=540,
        end_time_mins=1080,
        anchor_poi=sel_mand,
        pois=[sel_mand],
    )

    def mock_transit(pois, city):
        n = len(pois)
        return [
            [{"duration_mins": 5, "cost_eur": 0.0} for _ in range(n)] for _ in range(n)
        ]

    constraints = TravelConstraints()

    with pytest.raises(ItineraryInfeasible) as exc_info:
        await solve_day_v2(
            assigned_day=assigned_day,
            city="Paris",
            constraints=constraints,
            depot_poi=depot,
            candidate_pool=[],
            transit_matrix_fn=mock_transit,
        )

    assert "Mandatory attraction 'Closed Louvre' cannot be scheduled" in str(
        exc_info.value
    )
