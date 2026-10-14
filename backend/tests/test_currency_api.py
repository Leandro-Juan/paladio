import pytest
from app.schemas.user import UserPreferences
from app.api.v1.currency import get_live_rates, CITY_TO_COUNTRY_CODE
from app.domain.reference.iso_currencies import get_country_currency


def test_user_preferences_default_currency():
    prefs = UserPreferences()
    assert prefs.default_currency == "EUR"

    custom_prefs = UserPreferences(default_currency="USD")
    assert custom_prefs.default_currency == "USD"


def test_city_and_country_currency_resolution():
    assert CITY_TO_COUNTRY_CODE["tokyo"] == "JP"
    assert get_country_currency("JP") == "JPY"

    assert CITY_TO_COUNTRY_CODE["london"] == "GB"
    assert get_country_currency("GB") == "GBP"

    assert CITY_TO_COUNTRY_CODE["madrid"] == "ES"
    assert get_country_currency("ES") == "EUR"

    assert CITY_TO_COUNTRY_CODE["new york"] == "US"
    assert get_country_currency("US") == "USD"


@pytest.mark.asyncio
async def test_get_live_rates_endpoint():
    res = await get_live_rates(base="EUR")
    assert res.base == "EUR"
    assert isinstance(res.rates, dict)
    assert len(res.rates) > 0
