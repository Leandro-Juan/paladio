"""Unit and integration tests for Phase 6: Corridor Meal Snapping + Verification Loop."""

import pytest
from app.domain.entities.poi import (
    Itinerary,
    Poi,
    PoiLocation,
    ScheduledPoi,
    TransitLeg,
)
from app.engine.v2.candidate_pool import CandidatePoi, _poi_to_candidate
from app.engine.v2.day_assignment import AssignedDay
from app.engine.v2.exceptions import ItineraryInfeasible
from app.engine.v2.meals import (
    _cand_to_meal_poi,
    snap_corridor_meals,
    verify_day_schedule,
)
from app.engine.v2.selection import SelectedPoi, SelectionReasonCode
from app.engine.v2.solver import solve_day_v2
from app.quality.itinerary_metrics import _has_data_provenance
from app.schemas.itinerary import PacePreference, TravelConstraints


def _make_dining_cand(
    name: str,
    lat: float,
    lon: float,
    cost: float = 18.0,
    taste_score: float = 75.0,
    open_time: int = 720,  # 12:00
    close_time: int = 1380,  # 23:00
    is_closed_today: bool = False,
) -> CandidatePoi:
    open_hours = [-1] * 7 if is_closed_today else [open_time] * 7
    close_hours = [-1] * 7 if is_closed_today else [close_time] * 7
    poi = Poi(
        id=f"osm_{name.lower().replace(' ', '_')}",
        name=name,
        city="Madrid",
        category="RESTAURANT",
        location=PoiLocation(latitude=lat, longitude=lon),
        open_time_mins_by_day=open_hours,
        close_time_mins_by_day=close_hours,
        duration_mins=60,
        cost_eur=cost,
        cost_source="real_poi",
        cost_is_estimated=False,
        tier=2,
        iconicity_score=0.7,
        taxonomy_category="food_culinary",
        category_id=4,
    )
    return _poi_to_candidate(poi, taste_score=taste_score)


def _make_sight_poi(
    name: str,
    lat: float,
    lon: float,
    duration: int = 90,
    open_time: int = 540,
    close_time: int = 1200,
    is_mandatory: bool = False,
) -> Poi:
    p = Poi(
        id=f"sight_{name.lower().replace(' ', '_')}",
        name=name,
        city="Madrid",
        category="ATTRACTION",
        location=PoiLocation(latitude=lat, longitude=lon),
        open_time_mins_by_day=[open_time] * 7,
        close_time_mins_by_day=[close_time] * 7,
        duration_mins=duration,
        cost_eur=15.0,
        cost_source="real_poi",
        tier=1,
        iconicity_score=0.9,
        taxonomy_category="art_culture",
        category_id=0,
    )
    if is_mandatory:
        p.is_user_mandatory = True
    return p


def test_snap_corridor_meals_attaches_primary_and_backup():
    """Verify snap_corridor_meals replaces virtual meals with real candidates and attaches backup."""
    # Sights from Prado (40.4138, -3.6921) to Retiro (40.4153, -3.6845)
    sight_a = _make_sight_poi("Prado Museum", 40.4138, -3.6921)
    sight_b = _make_sight_poi("Retiro Park", 40.4153, -3.6845)
    hotel = Poi(
        id="hotel_depot",
        name="Hotel",
        city="Madrid",
        category="HOTEL",
        location=PoiLocation(latitude=40.4140, longitude=-3.7000),
        duration_mins=1,
    )

    virtual_lunch = Poi(
        id="virtual_meal_lunch",
        name="Virtual Lunch",
        city="Madrid",
        category="RESTAURANT",
        duration_mins=60,
        cost_eur=0.0,
    )

    itin = Itinerary(
        total_score=50.0,
        total_cost_eur=15.0,
        total_time_mins=300,
        path=[
            ScheduledPoi(poi=hotel, scheduled_start="09:00", scheduled_end="09:00"),
            ScheduledPoi(poi=sight_a, scheduled_start="09:15", scheduled_end="10:45"),
            ScheduledPoi(
                poi=virtual_lunch, scheduled_start="13:00", scheduled_end="14:00"
            ),
            ScheduledPoi(poi=sight_b, scheduled_start="14:15", scheduled_end="15:45"),
            ScheduledPoi(poi=hotel, scheduled_start="16:00", scheduled_end="16:00"),
        ],
    )

    # Candidates: primary (close to corridor), backup (slightly further), far away, and closed
    cand_primary = _make_dining_cand(
        "Tapas Bar Central", 40.4145, -3.6880, taste_score=90.0
    )
    cand_backup = _make_dining_cand(
        "Taberna El Retiro", 40.4150, -3.6870, taste_score=80.0
    )
    cand_closed = _make_dining_cand(
        "Closed Bistro", 40.4142, -3.6890, is_closed_today=True
    )
    cand_far = _make_dining_cand(
        "Distant Restaurant", 40.5000, -3.5000, taste_score=95.0
    )

    pool = [cand_primary, cand_backup, cand_closed, cand_far]

    snapped = snap_corridor_meals(
        day_itinerary=itin,
        candidate_pool=pool,
        city="Madrid",
        depot_poi=hotel,
    )

    meal_step = snapped.path[2]
    # Virtual node must be replaced by real primary candidate
    assert meal_step.poi.id == cand_primary.id
    assert "Tapas Bar Central" in meal_step.poi.name
    assert _has_data_provenance(meal_step.poi.model_dump())
    assert meal_step.shortfall_notice is None

    # Backup POI must be attached
    assert meal_step.backup_poi is not None
    assert meal_step.backup_poi.id == cand_backup.id
    assert "Taberna El Retiro" in meal_step.backup_poi.name
    assert _has_data_provenance(meal_step.backup_poi.model_dump())

    # Transit legs must be updated to pedestrian
    assert meal_step.transit_from_previous is not None
    assert meal_step.transit_from_previous.mode == "pedestrian"
    assert meal_step.transit_from_previous.duration_mins > 0


def test_snap_corridor_meals_shortfall_notice_when_empty():
    """Verify snap_corridor_meals honestly records shortfall notice if no venues exist."""
    hotel = Poi(
        id="hotel_depot",
        name="Hotel",
        city="Madrid",
        category="HOTEL",
        location=PoiLocation(latitude=40.4140, longitude=-3.7000),
    )
    virtual_lunch = Poi(
        id="virtual_meal_lunch",
        name="Virtual Lunch",
        city="Madrid",
        category="RESTAURANT",
        duration_mins=60,
    )
    itin = Itinerary(
        total_score=50.0,
        total_cost_eur=0.0,
        total_time_mins=120,
        path=[
            ScheduledPoi(poi=hotel, scheduled_start="09:00", scheduled_end="09:00"),
            ScheduledPoi(
                poi=virtual_lunch, scheduled_start="13:00", scheduled_end="14:00"
            ),
            ScheduledPoi(poi=hotel, scheduled_start="14:15", scheduled_end="14:15"),
        ],
    )

    # Empty candidate pool: never invent synthetic venues!
    snapped = snap_corridor_meals(
        day_itinerary=itin,
        candidate_pool=[],
        city="Madrid",
        depot_poi=hotel,
    )

    meal_step = snapped.path[1]
    assert meal_step.backup_poi is None
    assert meal_step.shortfall_notice is not None
    assert "No open dining venues found" in meal_step.shortfall_notice


def test_verify_day_schedule_swaps_to_backup_when_primary_closes():
    """Verify verify_day_schedule automatically swaps to backup_poi when primary is closed."""
    hotel = Poi(
        id="hotel_depot",
        name="Hotel",
        city="Madrid",
        category="HOTEL",
        location=PoiLocation(latitude=40.4140, longitude=-3.7000),
    )
    # Primary restaurant closes at 13:00 (780 mins), but scheduled visit arrives at 13:30 (810 mins)
    primary_cand = _make_dining_cand(
        "Early Closer", 40.4145, -3.6880, open_time=600, close_time=780
    )
    backup_cand = _make_dining_cand(
        "Open Late", 40.4150, -3.6870, open_time=600, close_time=1320
    )

    p_poi = _cand_to_meal_poi(primary_cand, slot="lunch")
    b_poi = _cand_to_meal_poi(backup_cand, slot="lunch")

    meal_step = ScheduledPoi(
        poi=p_poi,
        scheduled_start="13:30",
        scheduled_end="14:30",
        backup_poi=b_poi,
        transit_from_previous=TransitLeg(
            duration_mins=10, cost_eur=0.0, mode="pedestrian"
        ),
    )

    itin = Itinerary(
        total_score=30.0,
        total_cost_eur=18.0,
        total_time_mins=180,
        path=[
            ScheduledPoi(poi=hotel, scheduled_start="13:00", scheduled_end="13:00"),
            meal_step,
            ScheduledPoi(
                poi=hotel,
                scheduled_start="14:40",
                scheduled_end="14:40",
                transit_from_previous=TransitLeg(
                    duration_mins=10, cost_eur=0.0, mode="pedestrian"
                ),
            ),
        ],
    )

    verified = verify_day_schedule(itin, day_weekday=0, day_end_mins=1440)

    # Primary must have been swapped to backup
    assert verified.path[1].poi.id == backup_cand.id
    assert "Open Late" in verified.path[1].poi.name
    # Verification updated timeline sequentially
    assert verified.path[1].scheduled_start == "13:10"  # 13:00 + 10 mins transit
    assert verified.path[1].scheduled_end == "14:10"  # 13:10 + 60 mins duration


def test_verify_day_schedule_raises_infeasible_on_mandatory_sight_closure():
    """Verify verify_day_schedule raises ItineraryInfeasible if a mandatory sight closes."""
    hotel = Poi(
        id="hotel_depot",
        name="Hotel",
        city="Madrid",
        category="HOTEL",
        location=PoiLocation(latitude=40.4140, longitude=-3.7000),
    )
    # Mandatory sight closes at 11:00 (660 mins), but scheduled visit is 12:00-13:30
    mand_sight = _make_sight_poi(
        "Prado",
        40.4138,
        -3.6921,
        duration=90,
        open_time=540,
        close_time=660,
        is_mandatory=True,
    )

    itin = Itinerary(
        total_score=50.0,
        total_cost_eur=15.0,
        total_time_mins=300,
        path=[
            ScheduledPoi(poi=hotel, scheduled_start="11:30", scheduled_end="11:30"),
            ScheduledPoi(
                poi=mand_sight,
                scheduled_start="12:00",
                scheduled_end="13:30",
                transit_from_previous=TransitLeg(
                    duration_mins=30, cost_eur=0.0, mode="pedestrian"
                ),
            ),
            ScheduledPoi(poi=hotel, scheduled_start="14:00", scheduled_end="14:00"),
        ],
    )

    with pytest.raises(ItineraryInfeasible) as exc_info:
        verify_day_schedule(itin, day_weekday=0, day_end_mins=1440)

    assert "Mandatory sight 'Prado' closes" in str(exc_info.value)


@pytest.mark.asyncio
async def test_solve_day_v2_end_to_end_meal_snapping():
    """Verify solve_day_v2 seamlessly orienteers and snaps real dining candidates with provenance."""
    hotel = Poi(
        id="hotel_depot",
        name="Hotel",
        city="Madrid",
        category="HOTEL",
        location=PoiLocation(latitude=40.4140, longitude=-3.7000),
        duration_mins=1,
    )
    cand_sight = _make_sight_poi("Prado", 40.4138, -3.6921, duration=120)
    sel_sight = SelectedPoi(
        poi=_poi_to_candidate(cand_sight, taste_score=95.0),
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=120,
        marginal_gain=80.0,
    )

    cand_sight2 = _make_sight_poi("Retiro", 40.4150, -3.6840, duration=90)
    sel_sight2 = SelectedPoi(
        poi=_poi_to_candidate(cand_sight2, taste_score=85.0),
        reason_code=SelectionReasonCode.SELECTED_DIVERSE_ANCHOR,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=60.0,
    )

    cand_sight3 = _make_sight_poi("Reina Sofia", 40.4080, -3.6940, duration=90)
    sel_sight3 = SelectedPoi(
        poi=_poi_to_candidate(cand_sight3, taste_score=80.0),
        reason_code=SelectionReasonCode.SELECTED_DIVERSE_ANCHOR,
        visit_mode="full",
        effective_duration_mins=90,
        marginal_gain=50.0,
    )

    # Real dining candidates in Madrid
    cand_lunch = _make_dining_cand(
        "Restaurante Botanico", 40.4135, -3.6915, taste_score=88.0
    )
    cand_dinner = _make_dining_cand(
        "Cerveceria Plaza Mayor", 40.4150, -3.7070, taste_score=85.0
    )

    pool = [sel_sight.poi, sel_sight2.poi, sel_sight3.poi, cand_lunch, cand_dinner]

    assigned_day = AssignedDay(
        day_index=0,
        weekday=0,
        start_time_mins=540,
        end_time_mins=1380,
        anchor_poi=sel_sight,
        pois=[sel_sight],
        zone_candidates=[sel_sight2, sel_sight3],
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
        city="Madrid",
        constraints=constraints,
        depot_poi=hotel,
        candidate_pool=pool,
        transit_matrix_fn=mock_transit,
    )

    # Path must contain real meals with data provenance!
    meal_steps = [
        step
        for step in res.itinerary.path
        if step.poi.taxonomy_category == "food_culinary"
        or step.poi.category == "RESTAURANT"
    ]
    assert len(meal_steps) >= 1
    for m in meal_steps:
        # Cannot be virtual node after Phase 6 snapping
        assert not str(m.poi.id).startswith("virtual_meal_")
        assert _has_data_provenance(m.poi.model_dump())
        assert m.shortfall_notice is None
