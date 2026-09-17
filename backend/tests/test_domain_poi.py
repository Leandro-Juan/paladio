import pytest
from app.domain.entities.poi import Poi
from pydantic import ValidationError


def test_poi_duration_must_be_positive():
    with pytest.raises(ValidationError) as exc_info:
        Poi(city="Madrid", name="Museum", category="Art", duration_mins=0)
    assert "duration_mins" in str(exc_info.value)
    assert "must be strictly positive" in str(exc_info.value)


def test_poi_cost_must_be_non_negative():
    with pytest.raises(ValidationError) as exc_info:
        Poi(city="Madrid", name="Museum", category="Art", cost_eur=-5.0)
    assert "cost_eur" in str(exc_info.value)
    assert "must be greater than or equal to 0" in str(exc_info.value)


def test_poi_open_time_must_be_before_close_time():
    with pytest.raises(ValidationError) as exc_info:
        Poi(
            city="Madrid",
            name="Museum",
            category="Art",
            open_time_mins=1000,
            close_time_mins=800,
        )
    assert "open_time_mins must be before close_time_mins" in str(exc_info.value)


def test_poi_legacy_schedule_and_financials_parsing():
    raw = {
        "name": "Eiffel Tower",
        "city": "Paris",
        "category": "ATTRACTION",
        "schedule": {
            "open_time_mins": 540,
            "close_time_mins": 1380,
            "recommended_duration_minutes": 120,
        },
        "financials": {
            "estimated_cost": 25.0,
            "is_estimated": False,
            "price_source": "official_toureiffel",
        },
    }
    p = Poi(**raw)
    assert p.duration_mins == 120
    assert p.cost_eur == 25.0
    assert not p.cost_is_estimated
    assert p.cost_source == "official_toureiffel"
    assert p.open_time_mins == 540
    assert p.close_time_mins == 1380
    assert p.open_time_mins_by_day == [540] * 7
    assert p.close_time_mins_by_day == [1380] * 7
    # Ensure redundant dicts are dropped
    assert "schedule" not in p.model_dump()
    assert "financials" not in p.model_dump()


def test_poi_closed_monday_safe_fallback():
    # Museum closed on Monday (0): -1
    # Open Tue-Sun: 10:00 to 18:00 (600 to 1080)
    p = Poi(
        name="Museo Reina Sofía",
        city="Madrid",
        category="MUSEUM",
        open_time_mins_by_day=[-1, 600, 600, 600, 600, 600, 600],
        close_time_mins_by_day=[-1, 1080, 1080, 1080, 1080, 1080, 1080],
    )
    # open_time_mins must NOT return -1, but safely fallback to first open day (Tuesday: 600)
    assert p.open_time_mins == 600
    assert p.close_time_mins == 1080


def test_poi_all_days_closed_fallback():
    p = Poi(
        name="Abandoned Sight",
        city="Ghost Town",
        category="RUINS",
        open_time_mins_by_day=[-1] * 7,
        close_time_mins_by_day=[-1] * 7,
    )
    assert p.open_time_mins == 480
    assert p.close_time_mins == 1320


def test_poi_vector_length_must_be_7():
    with pytest.raises(ValidationError) as exc_info:
        Poi(
            city="Madrid",
            name="Museum",
            category="Art",
            open_time_mins_by_day=[480, 480],
            close_time_mins_by_day=[1320, 1320],
        )
    assert "must have length 7" in str(exc_info.value)
