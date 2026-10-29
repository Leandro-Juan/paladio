import pytest
from app.api.currency import get_live_rates
from app.domain.reference.iso_currencies import (
    from_minor_units,
    get_country_currency,
    get_currency_exponent,
    to_minor_units,
)
from app.schemas.user import UserPreferences


def test_user_preferences_default_currency():
    prefs = UserPreferences()
    assert prefs.default_currency == "EUR"

    custom_prefs = UserPreferences(default_currency="USD")
    assert custom_prefs.default_currency == "USD"


def test_country_currency_resolution_global():
    # Major world currencies
    assert get_country_currency("JP") == "JPY"
    assert get_country_currency("GB") == "GBP"
    assert get_country_currency("ES") == "EUR"
    assert get_country_currency("US") == "USD"
    # Americas, Middle East, Africa, Asia
    assert get_country_currency("AE") == "AED"
    assert get_country_currency("CL") == "CLP"
    assert get_country_currency("EG") == "EGP"
    assert get_country_currency("VN") == "VND"
    assert get_country_currency("ZA") == "ZAR"
    assert get_country_currency("IN") == "INR"
    assert get_country_currency("AU") == "AUD"
    assert get_country_currency("BR") == "BRL"


def test_currency_minor_units():
    # 0 decimals
    assert get_currency_exponent("JPY") == 0
    assert to_minor_units(100.0, "JPY") == 100
    assert from_minor_units(100, "JPY") == 100.0

    # 3 decimals
    assert get_currency_exponent("KWD") == 3
    assert to_minor_units(12.345, "KWD") == 12345
    assert from_minor_units(12345, "KWD") == 12.345

    # 2 decimals (standard)
    assert get_currency_exponent("EUR") == 2
    assert to_minor_units(42.50, "EUR") == 4250
    assert from_minor_units(4250, "EUR") == 42.50


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
