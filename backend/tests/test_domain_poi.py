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
    assert "open_time_mins" in str(exc_info.value) or "close_time_mins" in str(
        exc_info.value
    )
    assert "open_time_mins must be before close_time_mins" in str(exc_info.value)
