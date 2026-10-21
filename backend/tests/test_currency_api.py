import pytest
from app.api.currency import CITY_TO_COUNTRY_CODE, get_live_rates
from app.domain.reference.iso_currencies import get_country_currency
from app.schemas.user import UserPreferences


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


def test_resolve_target_currency_hierarchy():
    from app.api.market import _resolve_target_currency
    from app.db.models import UserModel

    # 1. Fallback to default when no param or user
    assert _resolve_target_currency(None, None, default="EUR") == "EUR"
    assert _resolve_target_currency(None, None, default="GBP") == "GBP"

    # 2. User preference takes precedence over default
    mock_user = UserModel(
        id="usr_1", username="test", preferences={"default_currency": "USD"}
    )
    assert _resolve_target_currency(None, mock_user, default="EUR") == "USD"

    # 3. Explicit query parameter overrides user preference and default
    assert _resolve_target_currency("PLN", mock_user, default="EUR") == "PLN"
    assert _resolve_target_currency("chf", mock_user, default="EUR") == "CHF"


def test_market_cvt_money():
    from app.api.market import _cvt_money

    assert _cvt_money(None, "USD") is None
    assert _cvt_money(100.0, "EUR") == 100.0
    usd_val = _cvt_money(100.0, "USD")
    assert usd_val is not None
    assert usd_val > 0
