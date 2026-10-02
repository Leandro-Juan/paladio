"""Unit tests for Paladio Itinerary v2 Trip Frame and Submodular Selection."""

from datetime import date

import pytest

from app.engine.v2.candidate_pool import CandidatePoi, build_candidate_pool
from app.engine.v2.selection import (
    SelectionReasonCode,
    select_trip_pois,
)
from app.engine.v2.trip_frame import (
    DayFrame,
    TripFrame,
    build_trip_frame,
    eur_to_usd,
    usd_to_eur,
)
from app.schemas.itinerary import (
    BookingAnchors,
    FlightSegment,
    NodeConstraint,
    TravelConstraints,
)
from app.schemas.user import PacePreference


def test_currency_conversion():
    """Verify standard FX conversion rates."""
    assert usd_to_eur(100.0) == 92.0
    assert eur_to_usd(92.0) == 100.0


def test_build_trip_frame_balanced():
    """Verify trip frame calculation for a balanced 3-day trip."""
    tc = TravelConstraints(
        destination_city="Paris",
        pace=PacePreference.BALANCED,
        budget_usd=1200.0,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
    )
    tf = build_trip_frame(tc)
    assert tf.city == "Paris"
    assert len(tf.days) == 3
    # Arrival: 2, Middle: 3, Departure: 2 -> Total = 7
    assert tf.total_anchor_slots == 7
    assert tf.max_tier1_slots == 3
    assert tf.total_budget_eur == 1104.0
    assert tf.days[0].is_arrival_day is True
    assert tf.days[1].is_arrival_day is False
    assert tf.days[2].is_departure_day is True


def test_build_trip_frame_flight_shrinkage():
    """Verify flight buffers shrink arrival and departure windows."""
    anchors = BookingAnchors(
        outbound_flight=FlightSegment(
            origin_iata="JFK",
            destination_iata="CDG",
            departure_time="2026-10-01T06:00:00",
            arrival_time="2026-10-01T13:00:00",  # 13:00 = 780m
        ),
        return_flight=FlightSegment(
            origin_iata="CDG",
            destination_iata="JFK",
            departure_time="2026-10-03T17:00:00",  # 17:00 = 1020m
        ),
    )
    tc = TravelConstraints(
        destination_city="Paris",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        booking_anchors=anchors,
    )
    tf = build_trip_frame(tc)
    # Arrival: 780m + 120m buffer = 900m (15:00)
    assert tf.days[0].start_time_mins == 900
    # Departure: 1020m - 180m buffer = 840m (14:00)
    assert tf.days[2].end_time_mins == 840


def test_submodular_selection_forced_user_mandatory():
    """Verify user mandatory POIs are forced into the selection with typed reason code."""
    day = DayFrame(day_index=0, max_anchors=3, target_active_mins=360)
    tf = TripFrame(
        city="Paris",
        days=[day],
        total_anchor_slots=3,
        max_tier1_slots=2,
    )

    cands = [
        CandidatePoi(
            id="p1",
            name="Ordinary Park",
            city="Paris",
            tier=3,
            is_mandatory=True,
            duration_mins=60,
            taste_score=30.0,
        ),
        CandidatePoi(
            id="p2",
            name="Iconic Tower",
            city="Paris",
            tier=1,
            iconicity_score=0.95,
            duration_mins=90,
            taste_score=95.0,
        ),
    ]

    res = select_trip_pois(cands, tf)
    selected_ids = [s.poi.id for s in res.selected_pois]
    assert "p1" in selected_ids
    p1_sel = next(s for s in res.selected_pois if s.poi.id == "p1")
    assert p1_sel.reason_code == SelectionReasonCode.SELECTED_USER_MANDATORY


def test_submodular_selection_diversity_penalty():
    """Verify category penalty prevents filling slots with identical categories."""
    day = DayFrame(day_index=0, max_anchors=3, target_active_mins=360)
    tf = TripFrame(
        city="Paris",
        days=[day],
        total_anchor_slots=3,
        max_tier1_slots=1,
    )

    cands = [
        CandidatePoi(
            id="m1",
            name="Museum A",
            city="Paris",
            tier=2,
            category_id=0,
            taxonomy_category="art_culture",
            taste_score=80.0,
            duration_mins=60,
        ),
        CandidatePoi(
            id="m2",
            name="Museum B",
            city="Paris",
            tier=2,
            category_id=0,
            taxonomy_category="art_culture",
            taste_score=78.0,
            duration_mins=60,
        ),
        CandidatePoi(
            id="m3",
            name="Museum C",
            city="Paris",
            tier=2,
            category_id=0,
            taxonomy_category="art_culture",
            taste_score=76.0,
            duration_mins=60,
        ),
        CandidatePoi(
            id="v1",
            name="Panoramic Viewpoint",
            city="Paris",
            tier=2,
            category_id=7,
            taxonomy_category="scenic_views",
            taste_score=72.0,
            duration_mins=45,
        ),
    ]

    res = select_trip_pois(cands, tf)
    categories = [s.poi.taxonomy_category for s in res.selected_pois]
    # Viewpoint must be chosen over the 3rd museum due to category diversity penalty
    assert "scenic_views" in categories


def test_submodular_selection_visit_mode_downgrade():
    """Verify visit mode is downgraded to quick when time budget is tight before dropping."""
    day = DayFrame(day_index=0, max_anchors=3, target_active_mins=100)
    tf = TripFrame(
        city="Paris",
        days=[day],
        total_anchor_slots=2,
        max_tier1_slots=1,
    )

    cands = [
        CandidatePoi(
            id="p1",
            name="First Place",
            city="Paris",
            tier=2,
            duration_mins=60,
            taste_score=90.0,
        ),
        CandidatePoi(
            id="p2",
            name="Grand Landmark",
            city="Paris",
            tier=2,
            duration_mins=90,  # 60 + 90 = 150 > 100 limit, but 60 + 30 = 90 <= 100!
            visit_mode="full",
            taste_score=85.0,
        ),
    ]

    res = select_trip_pois(cands, tf)
    assert len(res.selected_pois) == 2
    p2_sel = next(s for s in res.selected_pois if s.poi.id == "p2")
    assert p2_sel.visit_mode == "quick"
    assert p2_sel.reason_code == SelectionReasonCode.DOWNGRADED_VISIT_MODE_TIME_BUDGET


def test_submodular_selection_dropped_reasons():
    """Verify all unselected candidates receive a typed reason code and description."""
    day = DayFrame(day_index=0, max_anchors=1, target_active_mins=60)
    tf = TripFrame(
        city="Paris",
        days=[day],
        total_anchor_slots=1,
        max_tier1_slots=1,
    )

    cands = [
        CandidatePoi(
            id="p1",
            name="Winner POI",
            city="Paris",
            tier=1,
            iconicity_score=0.98,
            duration_mins=60,
            taste_score=95.0,
        ),
        CandidatePoi(
            id="p2",
            name="Loser POI",
            city="Paris",
            tier=4,
            duration_mins=60,
            taste_score=15.0,
        ),
    ]

    res = select_trip_pois(cands, tf)
    assert len(res.selected_pois) == 1
    assert len(res.dropped_pois) == 1
    dropped = res.dropped_pois[0]
    assert dropped.poi.id == "p2"
    assert dropped.reason_code == SelectionReasonCode.DROPPED_LOW_TASTE_AND_TIER
    assert len(dropped.explanation) > 0


@pytest.mark.asyncio
async def test_candidate_pool_builder_unit():
    """Verify build_candidate_pool combines tiered POIs, semantics, and mandatories."""
    from unittest.mock import AsyncMock
    from app.domain.entities.poi import Poi
    from app.domain.interfaces.poi_repository import IPoiRepository

    mock_repo = AsyncMock(spec=IPoiRepository)
    mock_repo.find_tiered_pois.return_value = [
        Poi(
            id="t1",
            city="Paris",
            name="Tier 1 Icon",
            category="attraction",
            tier=1,
            iconicity_score=0.95,
        ),
        Poi(
            id="t2",
            city="Paris",
            name="Tier 2 Anchor",
            category="attraction",
            tier=2,
            iconicity_score=0.75,
        ),
    ]
    mock_repo.find_semantic_candidates.return_value = [
        (
            Poi(
                id="s1",
                city="Paris",
                name="Semantic Hit",
                category="attraction",
                tier=3,
            ),
            0.88,
        )
    ]

    tc = TravelConstraints(
        destination_city="Paris",
        nodes=[NodeConstraint(poi_id="t1", mandatory=True)],
    )

    user_vec = [0.1] * 768
    pool = await build_candidate_pool(
        "Paris", mock_repo, user_vector=user_vec, constraints=tc
    )
    assert len(pool) == 3
    t1_item = next(p for p in pool if p.id == "t1")
    assert t1_item.is_mandatory is True
    assert t1_item.tier == 1

    s1_item = next(p for p in pool if p.id == "s1")
    assert s1_item.taste_score == 88.0
