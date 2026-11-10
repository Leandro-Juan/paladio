import pytest
from app.services.holiday_service import HolidayService
from app.api.calendar import get_calendar_holidays, get_supported_countries
from app.schemas.user import UserPreferences


def test_user_preferences_home_location():
    prefs = UserPreferences()
    assert prefs.home_city is None
    assert prefs.home_country is None

    custom = UserPreferences(
        home_city="Madrid",
        home_country="ES",
        home_country_name="Spain",
        home_subdivision="MD",
    )
    assert custom.home_city == "Madrid"
    assert custom.home_country == "ES"
    assert custom.home_country_name == "Spain"
    assert custom.home_subdivision == "MD"


def test_holiday_service_resolve_country_from_city():
    cc, name = HolidayService.resolve_country_from_city("Madrid")
    assert cc == "ES"
    assert name == "Spain"

    cc, name = HolidayService.resolve_country_from_city("Tokyo")
    assert cc == "JP"
    assert name == "Japan"

    cc, name = HolidayService.resolve_country_from_city("Paris")
    assert cc == "FR"
    assert name == "France"


def test_holiday_service_get_holidays_by_country():
    holidays_es = HolidayService.get_holidays(country_code="ES", year=2026)
    assert len(holidays_es) > 0
    # Jan 1 Año Nuevo
    new_years = [h for h in holidays_es if h.date == "2026-01-01"]
    assert len(new_years) == 1
    assert new_years[0].country_code == "ES"
    assert new_years[0].is_public_holiday is True


def test_holiday_service_get_holidays_by_city():
    holidays_de = HolidayService.get_holidays(city="Berlin", year=2026)
    assert len(holidays_de) > 0
    assert holidays_de[0].country_code == "DE"


def test_holiday_service_unsupported_country():
    res = HolidayService.get_holidays(country_code="XX", year=2026)
    assert res == []


def test_holiday_service_supported_countries():
    countries = HolidayService.get_supported_countries()
    assert len(countries) > 50
    codes = {c["code"] for c in countries}
    assert "ES" in codes
    assert "FR" in codes
    assert "US" in codes
    assert "JP" in codes


@pytest.mark.asyncio
async def test_calendar_holidays_api():
    # Direct country
    resp = await get_calendar_holidays(country="ES", year=2026)
    assert resp.country == "ES"
    assert resp.year == 2026
    assert resp.total > 0
    assert len(resp.holidays) == resp.total

    # Via city resolution
    resp_city = await get_calendar_holidays(city="Tokyo", year=2026)
    assert resp_city.country == "JP"
    assert resp_city.total > 0

    # Supported countries
    all_countries = await get_supported_countries()
    assert len(all_countries) > 50
