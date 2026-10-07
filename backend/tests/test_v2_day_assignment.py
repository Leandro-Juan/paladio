"""Unit and integration tests for Paladio Itinerary v2 Day Assignment."""

from datetime import date

from app.domain.entities.poi import Poi, PoiLocation
from app.engine.v2.candidate_pool import _poi_to_candidate
from app.engine.v2.day_assignment import (
    _select_anchor_seeds,
    assign_pois_to_days,
    bundle_nearby_pois,
    get_effective_time_window,
)
from app.engine.v2.selection import SelectedPoi, SelectionReasonCode
from app.engine.v2.trip_frame import DayFrame, TripFrame
from app.schemas.itinerary import PacePreference, TravelConstraints


def _make_poi(
    name: str,
    lat: float,
    lon: float,
    duration: int = 90,
    cost: float = 15.0,
    tier: int = 1,
    category: str = "art_culture",
    iconicity: float = 0.9,
    is_mandatory: bool = False,
    closed_weekdays: list[int] | None = None,
) -> SelectedPoi:
    open_vec = [540] * 7
    close_vec = [1140] * 7
    if closed_weekdays:
        for w in closed_weekdays:
            open_vec[w] = -1
            close_vec[w] = -1

    p = Poi(
        id=name.lower().replace(" ", "_"),
        name=name,
        city="Paris",
        category="attraction",
        location=PoiLocation(latitude=lat, longitude=lon),
        open_time_mins_by_day=open_vec,
        close_time_mins_by_day=close_vec,
        duration_mins=duration,
        cost_eur=cost,
        tier=tier,
        iconicity_score=iconicity,
        taxonomy_category=category,
        category_id=0,
    )
    cand = _poi_to_candidate(p, taste_score=85.0, is_mandatory=is_mandatory)
    return SelectedPoi(
        poi=cand,
        reason_code=SelectionReasonCode.SELECTED_TIER_1_MUST_SEE,
        visit_mode="full",
        effective_duration_mins=duration,
        marginal_gain=50.0,
    )


def test_bundle_nearby_pois():
    # Louvre and Arc du Carrousel (~240m apart)
    p1 = _make_poi("Louvre", 48.8606, 2.3358)
    p2 = _make_poi("Arc du Carrousel", 48.8618, 2.3330)
    # Sacré-Cœur (~3.5km away in Montmartre)
    p3 = _make_poi("Sacre-Coeur", 48.8867, 2.3431)

    bundles = bundle_nearby_pois([p1, p2, p3], threshold_km=0.35)
    # Louvre and Carrousel should be bundled together
    assert len(bundles) == 2
    b1_names = {p.poi.name for p in bundles[0]}
    b2_names = {p.poi.name for p in bundles[1]}

    if "Louvre" in b1_names:
        assert "Arc du Carrousel" in b1_names
        assert "Sacre-Coeur" in b2_names
    else:
        assert "Arc du Carrousel" in b2_names
        assert "Sacre-Coeur" in b1_names


def test_select_anchor_seeds_farthest_point():
    # 3 distant bundles
    p1 = _make_poi("Louvre", 48.8606, 2.3376, tier=1, iconicity=0.95)
    p2 = _make_poi("Eiffel Tower", 48.8584, 2.2945, tier=1, iconicity=0.99)
    p3 = _make_poi("Sacre-Coeur", 48.8867, 2.3431, tier=2, iconicity=0.85)

    bundles = [[p1], [p2], [p3]]
    seeds = _select_anchor_seeds(bundles, k=2)

    assert len(seeds) == 2
    # Seed 0 should be Eiffel Tower (highest iconicity)
    assert seeds[0] == 1
    # Seed 1 should be the farthest from Eiffel Tower (Sacré-Cœur or Louvre)
    assert seeds[1] in (0, 2)


def test_hungarian_matching_avoids_closures():
    # Day 0: Monday (weekday=0), Day 1: Tuesday (weekday=1)
    # Louvre is closed on Tuesdays (weekday=1)
    louvre = _make_poi("Louvre", 48.8606, 2.3376, closed_weekdays=[1])
    # Orsay is closed on Mondays (weekday=0)
    orsay = _make_poi("Musee d'Orsay", 48.8599, 2.3265, closed_weekdays=[0])

    constraints = TravelConstraints(pace=PacePreference.BALANCED)
    trip_frame = TripFrame(
        city="Paris",
        days=[
            DayFrame(
                day_index=0,
                calendar_date=date(2026, 10, 5),  # Monday
                target_active_mins=360,
                max_anchors=3,
            ),
            DayFrame(
                day_index=1,
                calendar_date=date(2026, 10, 6),  # Tuesday
                target_active_mins=360,
                max_anchors=3,
            ),
        ],
        constraints=constraints,
    )

    result = assign_pois_to_days([louvre, orsay], trip_frame)

    assert result.closure_violations == 0
    assert len(result.assigned_days) == 2

    monday_pois = {p.poi.name for p in result.assigned_days[0].pois}
    tuesday_pois = {p.poi.name for p in result.assigned_days[1].pois}

    assert "Louvre" in monday_pois
    assert "Musee d'Orsay" in tuesday_pois


def test_arrival_departure_light_load():
    # 3-day trip: Day 0 arrival (short), Day 1 full, Day 2 departure (short)
    p1 = _make_poi("P1", 48.860, 2.330, duration=60)
    p2 = _make_poi("P2", 48.861, 2.331, duration=60)
    p3 = _make_poi("P3", 48.870, 2.310, duration=120)
    p4 = _make_poi("P4", 48.871, 2.311, duration=120)
    p5 = _make_poi("P5", 48.850, 2.290, duration=60)

    constraints = TravelConstraints(pace=PacePreference.BALANCED)
    trip_frame = TripFrame(
        city="Paris",
        days=[
            DayFrame(
                day_index=0,
                calendar_date=date(2026, 10, 5),
                is_arrival_day=True,
                target_active_mins=120,
                max_anchors=1,
            ),
            DayFrame(
                day_index=1,
                calendar_date=date(2026, 10, 6),
                target_active_mins=360,
                max_anchors=4,
            ),
            DayFrame(
                day_index=2,
                calendar_date=date(2026, 10, 7),
                is_departure_day=True,
                target_active_mins=120,
                max_anchors=1,
            ),
        ],
        constraints=constraints,
    )

    result = assign_pois_to_days([p1, p2, p3, p4, p5], trip_frame)

    assert len(result.assigned_days) == 3
    day0_dur = result.assigned_days[0].total_active_mins
    day1_dur = result.assigned_days[1].total_active_mins
    day2_dur = result.assigned_days[2].total_active_mins

    assert day1_dur >= day0_dur
    assert day1_dur >= day2_dur


def test_edge_case_fewer_pois_than_days():
    p1 = _make_poi("Louvre", 48.8606, 2.3376)
    p2 = _make_poi("Eiffel Tower", 48.8584, 2.2945)

    constraints = TravelConstraints(pace=PacePreference.BALANCED)
    trip_frame = TripFrame(
        city="Paris",
        days=[
            DayFrame(day_index=i, calendar_date=date(2026, 10, 5 + i)) for i in range(5)
        ],
        constraints=constraints,
    )

    result = assign_pois_to_days([p1, p2], trip_frame)

    assert len(result.assigned_days) == 5
    assigned_count = sum(len(d.pois) for d in result.assigned_days)
    assert assigned_count == 2


def test_effective_time_windows():
    poi = _make_poi("Louvre", 48.8606, 2.3376)
    earliest, latest = get_effective_time_window(
        poi, day_weekday=0, day_start_mins=600, day_end_mins=1020
    )
    assert earliest == 600
    assert latest == 1020


def test_integrated_day_assignment_paris():
    pois = [
        _make_poi(
            "Louvre",
            48.8606,
            2.3376,
            duration=150,
            closed_weekdays=[1],
            category="art_culture",
        ),
        _make_poi(
            "Tuileries Garden", 48.8635, 2.3270, duration=60, category="nature_outdoors"
        ),
        _make_poi(
            "Musee d'Orsay",
            48.8599,
            2.3265,
            duration=120,
            closed_weekdays=[0],
            category="art_culture",
        ),
        _make_poi(
            "Eiffel Tower", 48.8584, 2.2945, duration=120, category="scenic_views"
        ),
        _make_poi(
            "Arc de Triomphe", 48.8738, 2.2950, duration=75, category="history_heritage"
        ),
        _make_poi(
            "Sacre-Coeur", 48.8867, 2.3431, duration=90, category="history_heritage"
        ),
        _make_poi(
            "Sainte-Chapelle", 48.8554, 2.3450, duration=60, category="architecture"
        ),
        _make_poi(
            "Centre Pompidou",
            48.8606,
            2.3522,
            duration=120,
            closed_weekdays=[1],
            category="art_culture",
        ),
    ]

    constraints = TravelConstraints(pace=PacePreference.BALANCED)
    trip_frame = TripFrame(
        city="Paris",
        days=[
            DayFrame(
                day_index=0, calendar_date=date(2026, 10, 5), target_active_mins=300
            ),  # Mon
            DayFrame(
                day_index=1, calendar_date=date(2026, 10, 6), target_active_mins=360
            ),  # Tue
            DayFrame(
                day_index=2, calendar_date=date(2026, 10, 7), target_active_mins=300
            ),  # Wed
        ],
        constraints=constraints,
    )

    result = assign_pois_to_days(pois, trip_frame)

    assert len(result.assigned_days) == 3
    assert result.closure_violations == 0
    total_assigned = sum(len(d.pois) for d in result.assigned_days)
    assert total_assigned == 8

    for d in result.assigned_days:
        assert d.anchor_poi is not None
        assert d.theme != ""
        assert len(d.effective_time_windows) == len(d.pois)


def test_dynamic_bundling_threshold_scales():
    """Verify dynamic bundling threshold adapts to spatial dispersion."""
    from app.engine.v2.day_assignment import compute_dynamic_bundling_threshold

    # Dense historic center POIs (100-200m apart)
    dense_pois = [
        _make_poi("D1", 48.8600, 2.3300),
        _make_poi("D2", 48.8610, 2.3310),
        _make_poi("D3", 48.8605, 2.3305),
        _make_poi("D4", 48.8615, 2.3320),
    ]
    t_dense = compute_dynamic_bundling_threshold(dense_pois)
    assert 0.20 <= t_dense <= 0.25

    # Sparse metropolitan POIs (3-5km apart)
    sparse_pois = [
        _make_poi("S1", 48.8500, 2.2900),
        _make_poi("S2", 48.8800, 2.3400),
        _make_poi("S3", 48.8300, 2.3800),
        _make_poi("S4", 48.8100, 2.2500),
    ]
    t_sparse = compute_dynamic_bundling_threshold(sparse_pois)
    assert t_sparse == 0.60  # Upper clamp


def test_taste_aware_anchor_seed_selection():
    """Verify anchor seed 0 incorporates user taste score above generic tier."""
    p_museum = _make_poi("Classical Museum", 48.860, 2.330, tier=1, iconicity=0.95)
    p_museum.poi.taste_score = 15.0  # Disliked by user prompt

    p_view = _make_poi("Rooftop View", 48.850, 2.290, tier=2, iconicity=0.75)
    p_view.poi.taste_score = 98.0  # Highly aligned with user prompt

    bundles = [[p_museum], [p_view]]
    seeds = _select_anchor_seeds(bundles, k=2)

    # p_view should be seed 0 because user taste score (98 vs 15) overrides lower tier
    assert seeds[0] == 1
    assert seeds[1] == 0


def test_zone_sprawl_penalty_prevents_distant_bundle_merging():
    """Verify _calculate_insertion_cost strongly penalizes sprawling distant bundles (>2.8km)."""
    from app.engine.v2.day_assignment import _calculate_insertion_cost

    df = DayFrame(day_index=0, target_active_mins=360, max_anchors=4)

    # Base cluster around Notre-Dame
    cluster = [_make_poi("Notre-Dame", 48.8530, 2.3499)]

    # Nearby bundle: Sainte-Chapelle (~400m away)
    near_bundle = [_make_poi("Sainte-Chapelle", 48.8554, 2.3450)]
    cost_near = _calculate_insertion_cost(near_bundle, cluster, df)

    # Distant bundle: Sacré-Cœur (~4.2km away in Montmartre)
    far_bundle = [_make_poi("Sacre-Coeur", 48.8867, 2.3431)]
    cost_far = _calculate_insertion_cost(far_bundle, cluster, df)

    # Distant bundle should incur heavy sprawl penalty (> 4x nearby cost)
    assert cost_far > cost_near * 4.0


def test_hotel_proximity_matches_arrival_day():
    """Verify arrival day (Day 0) is matched to the zone closest to hotel/city center."""
    # Zone A: Near hotel (48.855, 2.350)
    p_near1 = _make_poi("Near Hotel 1", 48.856, 2.351)
    p_near2 = _make_poi("Near Hotel 2", 48.857, 2.352)

    # Zone B: Far from hotel (48.890, 2.320 - Montmartre)
    p_far1 = _make_poi("Far 1", 48.890, 2.320)
    p_far2 = _make_poi("Far 2", 48.891, 2.321)

    constraints = TravelConstraints(pace=PacePreference.BALANCED)
    trip_frame = TripFrame(
        city="Paris",
        city_center=(48.855, 2.350),  # Hotel is at city center
        days=[
            DayFrame(
                day_index=0,
                calendar_date=date(2026, 10, 5),
                is_arrival_day=True,
                target_active_mins=240,
                max_anchors=2,
            ),
            DayFrame(
                day_index=1,
                calendar_date=date(2026, 10, 6),
                is_arrival_day=False,
                target_active_mins=360,
                max_anchors=3,
            ),
        ],
        constraints=constraints,
    )

    result = assign_pois_to_days([p_near1, p_near2, p_far1, p_far2], trip_frame)

    assert len(result.assigned_days) == 2
    # Day 0 (arrival) must contain the Near Hotel POIs
    day0_names = {p.poi.name for p in result.assigned_days[0].pois}
    assert "Near Hotel 1" in day0_names
    assert "Near Hotel 2" in day0_names


def test_zone_surplus_candidates_populated():
    """Verify assign_pois_to_days populates zone_candidates from candidate_pool for full-day solver."""
    from app.engine.v2.candidate_pool import CandidatePoi

    # 1 primary POI per day
    p1 = _make_poi("Louvre", 48.8606, 2.3376)
    p2 = _make_poi("Eiffel Tower", 48.8584, 2.2945)

    # Wider candidate pool containing surplus neighborhood options
    pool = [
        CandidatePoi(
            id="tuileries",
            name="Tuileries Garden",
            city="Paris",
            location={"latitude": 48.8635, "longitude": 2.3270},
            taste_score=80.0,
            tier=2,
        ),
        CandidatePoi(
            id="orsay",
            name="Musee d'Orsay",
            city="Paris",
            location={"latitude": 48.8599, "longitude": 2.3265},
            taste_score=75.0,
            tier=1,
        ),
        CandidatePoi(
            id="champ_mars",
            name="Champ de Mars",
            city="Paris",
            location={"latitude": 48.8556, "longitude": 2.2986},
            taste_score=85.0,
            tier=2,
        ),
    ]

    trip_frame = TripFrame(
        city="Paris",
        days=[
            DayFrame(
                day_index=0, calendar_date=date(2026, 10, 5), target_active_mins=300
            ),
            DayFrame(
                day_index=1, calendar_date=date(2026, 10, 6), target_active_mins=300
            ),
        ],
    )

    result = assign_pois_to_days([p1, p2], trip_frame, candidate_pool=pool)

    assert len(result.assigned_days) == 2
    # Both days should have zone_candidates attached
    total_surplus = sum(len(d.zone_candidates) for d in result.assigned_days)
    assert total_surplus > 0
