"""
Tests for lodging normalization utilities.
Verifies locale-resilient currency & price parsing and property name canonicalization.
"""

from app.engine.market.lodging.normalize import (
    normalize_property_name,
    parse_money,
)


def test_parse_money_european_format():
    # 1.234,50 € -> 1234.50 EUR
    val, curr = parse_money("€1.234,50")
    assert val == 1234.50
    assert curr == "EUR"

    val, curr = parse_money("1.234,50 €")
    assert val == 1234.50
    assert curr == "EUR"

    # Decimal only: 120,50 €
    val, curr = parse_money("120,50 €")
    assert val == 120.50
    assert curr == "EUR"


def test_parse_money_anglo_format():
    # €1,234.50 -> 1234.50 EUR
    val, curr = parse_money("€1,234.50")
    assert val == 1234.50
    assert curr == "EUR"

    # $99.95 USD
    val, curr = parse_money("$99.95")
    assert val == 99.95
    assert curr == "USD"

    # £ 150 GBP
    val, curr = parse_money("£ 150")
    assert val == 150.0
    assert curr == "GBP"


def test_parse_money_plain_integers_and_edge_cases():
    val, curr = parse_money("75")
    assert val == 75.0
    assert curr == "EUR"

    val, curr = parse_money("   ")
    assert val is None

    val, curr = parse_money(None)
    assert val is None


def test_normalize_property_name():
    # Strips lodging noise (Hotel, Albergo, etc.), accents, punctuation
    name1 = "Grand Hotel Plaza & Suites"
    name2 = "grand hotel plaza"
    assert "plaza" in normalize_property_name(name1)
    assert "plaza" in normalize_property_name(name2)
    assert normalize_property_name("Hôtel de Paris") == "paris"
    assert normalize_property_name("Albergo Roma B&B") == "roma"
    assert normalize_property_name("The Ritz-Carlton Hotel") == "ritz carlton"
