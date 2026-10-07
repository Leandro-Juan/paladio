"""Unit tests for Data-Driven Local Day Rhythm & Dining Windows (Phase 3)."""

from datetime import date

from app.domain.entities.poi import Poi
from app.engine.v2.rhythm import (
    RhythmProfile,
    compute_city_rhythm_profile,
    get_meal_time_window,
)
from app.engine.v2.trip_frame import build_trip_frame
from app.schemas.itinerary import TravelConstraints
from app.schemas.user import PacePreference


def test_default_rhythm_profile():
    """Verify standard default circadian windows when no empirical data exists."""
    r = RhythmProfile()
    assert r.is_empirical is False
    assert r.lunch_window == (720, 930)  # 12:00 - 15:30
    assert r.dinner_window == (1170, 1410)  # 19:30 - 23:30
    assert r.lunch_peak_min == 810  # 13:30
    assert r.dinner_peak_min == 1260  # 21:00
    assert r.evening_cutoff_min == 1380  # 23:00


def test_empirical_rhythm_spanish_hours():
    """Verify Spanish restaurant hours dynamically shift lunch to ~13:30 and dinner to ~21:00."""
    venues = [
        Poi(
            name="Taberna La Bola",
            city="Madrid",
            category="RESTAURANT",
            osm_opening_hours="Mo-Su 13:30-16:00, 20:30-23:30",
        ),
        Poi(
            name="Casa Lucio",
            city="Madrid",
            category="RESTAURANT",
            osm_opening_hours="Tu-Su 13:00-16:00, 21:00-24:00",
        ),
        Poi(
            name="Sobrino de Botín",
            city="Madrid",
            category="RESTAURANT",
            osm_opening_hours="Mo-Su 13:00-16:00, 20:00-23:30",
        ),
        Poi(
            name="Restaurante Amazonico",
            city="Madrid",
            category="RESTAURANT",
            osm_opening_hours="Mo-Su 13:30-16:30, 21:00-01:00",
        ),
    ]

    rhythm = compute_city_rhythm_profile(venues)
    assert rhythm.is_empirical is True
    assert rhythm.sample_size >= 4

    # Spanish lunch starts at 13:00-13:30 (>= 780m)
    assert rhythm.lunch_window[0] >= 780
    # Spanish lunch peak around 14:00-15:00
    assert rhythm.lunch_peak_min >= 840

    # Spanish dinner starts at 20:30-21:00 (>= 1230m)
    assert rhythm.dinner_window[0] >= 1200
    # Spanish dinner peak around 21:30-22:30
    assert rhythm.dinner_peak_min >= 1260

    # Evening cutoff extends late
    assert rhythm.evening_cutoff_min >= 1380


def test_empirical_rhythm_nordic_hours():
    """Verify Nordic restaurant hours dynamically shift lunch to ~11:30 and dinner to ~17:30."""
    venues = [
        Poi(
            name="Fiskeriet Youngstorget",
            city="Oslo",
            category="RESTAURANT",
            osm_opening_hours="Mo-Sa 11:30-14:30, 17:30-21:00",
        ),
        Poi(
            name="Kaffistova",
            city="Oslo",
            category="RESTAURANT",
            osm_opening_hours="Mo-Su 11:00-14:00, 17:00-20:30",
        ),
        Poi(
            name="Engebret Cafe",
            city="Oslo",
            category="RESTAURANT",
            osm_opening_hours="Mo-Sa 11:30-14:30, 17:30-21:30",
        ),
        Poi(
            name="Maaemo",
            city="Oslo",
            category="RESTAURANT",
            osm_opening_hours="We-Sa 12:00-15:00, 18:00-22:00",
        ),
    ]

    rhythm = compute_city_rhythm_profile(venues)
    assert rhythm.is_empirical is True

    # Nordic lunch starts around 11:30 (<= 700m)
    assert rhythm.lunch_window[0] <= 700

    # Nordic dinner starts around 17:30 (<= 1080m)
    assert rhythm.dinner_window[0] <= 1080
    assert rhythm.dinner_peak_min < 1230


def test_trip_frame_includes_lunch_and_dinner_for_full_days():
    """Verify full days include both lunch and dinner by default and span to evening."""
    tc = TravelConstraints(
        destination_city="Madrid",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),  # 3 days: arrival, full day, departure
        pace=PacePreference.BALANCED,
    )

    spanish_rhythm = RhythmProfile(
        lunch_window=(780, 960),
        dinner_window=(1230, 1410),
        evening_cutoff_min=1410,  # 23:30
        is_empirical=True,
    )

    tf = build_trip_frame(
        tc,
        city_center=(40.4168, -3.7038),
        rhythm=spanish_rhythm,
    )

    assert len(tf.days) == 3
    day_middle = tf.days[1]  # Full day
    assert day_middle.is_arrival_day is False
    assert day_middle.is_departure_day is False

    # Agency standard: full day must carry both lunch and dinner
    assert "lunch" in day_middle.requested_meals
    assert "dinner" in day_middle.requested_meals

    # Day end time must extend to Spanish evening cutoff (23:30 = 1410m)
    assert day_middle.end_time_mins >= 1410


def test_meal_time_window_fallback_when_few_venues():
    """Verify safe fallback to default windows when venue sample size < 3."""
    few_venues = [
        Poi(
            name="Lone Cafe",
            city="TinyTown",
            category="RESTAURANT",
            osm_opening_hours="12:00-20:00",
        )
    ]
    rhythm = compute_city_rhythm_profile(few_venues)
    assert rhythm.is_empirical is False
    # Still provides safe, valid meal windows
    assert get_meal_time_window("lunch", rhythm) == (720, 930)
    assert get_meal_time_window("dinner", rhythm) == (1170, 1410)


def test_struct_mapper_respects_rhythm_profile():
    """Verify build_cpp_pois and build_optimization_config adapt windows from RhythmProfile."""
    from app.domain.entities.poi import ScoredPoi
    from app.infrastructure.engine.struct_mapper import (
        build_cpp_pois,
        build_optimization_config,
    )

    spanish_rhythm = RhythmProfile(
        lunch_window=(780, 960),  # 13:00 - 16:00
        dinner_window=(1230, 1410),  # 20:30 - 23:30
        evening_cutoff_min=1410,
        is_empirical=True,
    )

    lunch_spot = Poi(
        name="Tapas Delicioso (Lunch)",
        city="Madrid",
        category="RESTAURANT",
        open_time_mins=600,
        close_time_mins=1440,
        duration_mins=60,
    )
    dinner_spot = Poi(
        name="Taberna Nocturna (Dinner)",
        city="Madrid",
        category="RESTAURANT",
        open_time_mins=600,
        close_time_mins=1440,
        duration_mins=90,
    )

    scored = [
        ScoredPoi(poi=lunch_spot, score=80.0),
        ScoredPoi(poi=dinner_spot, score=85.0),
    ]

    cpp_pois = build_cpp_pois(
        scored,
        day_start_mins=540,
        rhythm=spanish_rhythm,
    )

    assert len(cpp_pois) == 2
    # Lunch spot should have earliest_time bounded by Spanish lunch window (780)
    assert cpp_pois[0].earliest_time == 780
    assert cpp_pois[0].latest_time == 960
    assert cpp_pois[0].is_lunch_spot is True

    # Dinner spot should have earliest_time bounded by Spanish dinner window (1230)
    assert cpp_pois[1].earliest_time == 1230
    assert cpp_pois[1].latest_time == 1410
    assert cpp_pois[1].is_dinner_spot is True

    # Optimization config should set lunch & dinner deadlines accordingly
    tc = TravelConstraints(destination_city="Madrid")
    cfg = build_optimization_config(
        constraints=tc,
        day_start_mins=540,
        day_end_mins=1410,
        start_node_index=0,
        end_node_index=1,
        cpp_pois=cpp_pois,
        enforce_default_meal_deadlines=True,
        rhythm=spanish_rhythm,
        requested_meals=["lunch", "dinner"],
    )

    assert cfg.lunch_deadline == 960
    assert cfg.dinner_deadline == 1410
