"""
Unit and contract tests for AviasalesProvider.
Uses real recorded fixtures from tests/fixtures/aviasales/ to guarantee zero synthetic data.
Complies with PLAN.md Phase 2 and strict verification standards.
"""

import json
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.engine.market.ports import FareObservation
from app.engine.market.providers.aviasales import AviasalesProvider
from app.engine.market.providers.base import (
    CircuitBreakerOpenError,
    ParseDriftError,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "aviasales"


def load_fixture(filename: str) -> dict:
    with open(FIXTURES_DIR / filename, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def provider():
    return AviasalesProvider(token="test_token_123", market="es", currency="EUR")


@pytest.mark.asyncio
async def test_provider_health(provider):
    assert await provider.is_healthy() is True
    no_token = AviasalesProvider(token="", market="es", currency="EUR")
    assert await no_token.is_healthy() is False


@pytest.mark.parametrize(
    "fixture_file,origin,dest,target_month,expected_min_count",
    [
        ("MAD_FCO_2026-12.json", "MAD", "FCO", date(2026, 12, 1), 1),
        ("MAD_FCO_2027-05.json", "MAD", "FCO", date(2027, 5, 1), 1),
        ("MAD_JFK_2026-12.json", "MAD", "JFK", date(2026, 12, 1), 1),
        (
            "MAD_JFK_2027-06.json",
            "MAD",
            "JFK",
            date(2027, 6, 1),
            0,
        ),  # Genuine empty month
        ("LHR_HND_2027-01.json", "LHR", "HND", date(2027, 1, 1), 1),
        ("CDG_BKK_2027-03.json", "CDG", "BKK", date(2027, 3, 1), 1),
        ("BER_OPO_2026-12.json", "BER", "OPO", date(2026, 12, 1), 1),
        ("BCN_EZE_2027-04.json", "BCN", "EZE", date(2027, 4, 1), 1),
        ("TFN_SPC_2027-01.json", "TFN", "SPC", date(2027, 1, 1), 1),
        ("LIS_RAK_2027-02.json", "LIS", "RAK", date(2027, 2, 1), 1),
        ("prices_for_dates_MAD_FCO_2026-12.json", "MAD", "FCO", date(2026, 12, 1), 1),
    ],
)
def test_parse_real_fixtures(
    provider, fixture_file, origin, dest, target_month, expected_min_count
):
    payload = load_fixture(fixture_file)
    ref_time = datetime(2026, 11, 12, 12, 0, 0, tzinfo=timezone.utc)
    observations = provider.parse_raw_payload(
        raw_payload=payload,
        origin=origin,
        dest=dest,
        month=target_month,
        trip_type="one_way",
        market="es",
        fetched_at=ref_time,
    )

    assert len(observations) >= expected_min_count
    for obs in observations:
        assert isinstance(obs, FareObservation)
        assert obs.origin == origin
        assert obs.price_cents > 0
        assert obs.currency == "EUR"
        assert obs.depart_date.year == target_month.year
        assert obs.depart_date.month == target_month.month
        assert obs.source == "aviasales"
        assert obs.source_class == "cache"
        assert obs.market == "es"
        assert obs.return_date is None
        assert obs.found_at is not None
        assert obs.fetched_at == ref_time
        assert obs.carrier is not None
        assert obs.flight_number is not None


def test_reject_substituted_dates(provider):
    raw = {
        "data": {
            "2026-12-05": {
                "departure_at": "2026-12-05T10:00:00+01:00",
                "price": 50,
                "airline": "FR",
                "origin_airport": "MAD",
                "destination_airport": "FCO",
            },
            "2027-01-02": {  # Outside requested month!
                "departure_at": "2027-01-02T10:00:00+01:00",
                "price": 20,
                "airline": "FR",
                "origin_airport": "MAD",
                "destination_airport": "FCO",
            },
        },
        "currency": "eur",
    }
    month = date(2026, 12, 1)
    obs = provider.parse_raw_payload(raw, "MAD", "FCO", month)
    assert len(obs) == 1
    assert obs[0].depart_date == date(2026, 12, 5)


def test_reject_zero_and_negative_prices(provider):
    raw = {
        "data": {
            "2026-12-01": {
                "departure_at": "2026-12-01T10:00:00+01:00",
                "price": 0,
                "airline": "IB",
            },
            "2026-12-02": {
                "departure_at": "2026-12-02T10:00:00+01:00",
                "price": -15,
                "airline": "IB",
            },
            "2026-12-03": {
                "departure_at": "2026-12-03T10:00:00+01:00",
                "price": 45,
                "airline": "IB",
            },
        },
        "currency": "eur",
    }
    obs = provider.parse_raw_payload(raw, "MAD", "FCO", date(2026, 12, 1))
    assert len(obs) == 1
    assert obs[0].price_cents == 4500


def test_extract_found_at_from_search_date(provider):
    raw = {
        "data": {
            "2026-12-01": {
                "departure_at": "2026-12-01T10:00:00+01:00",
                "price": 50,
                "airline": "FR",
                "link": "/search/MAD0112FCO1?t=FR123&search_date=05112026",
            }
        },
        "currency": "eur",
    }
    now = datetime(2026, 11, 12, tzinfo=timezone.utc)
    obs = provider.parse_raw_payload(
        raw, "MAD", "FCO", date(2026, 12, 1), fetched_at=now
    )
    assert len(obs) == 1
    # 05112026 -> 2026-11-05
    assert obs[0].found_at == datetime(2026, 11, 5, 0, 0, 0, tzinfo=timezone.utc)
    assert obs[0].flags["age_days"] == 7
    assert obs[0].flags["is_stale"] is False


def test_stale_flag_when_older_than_threshold(provider):
    raw = {
        "data": {
            "2026-12-01": {
                "departure_at": "2026-12-01T10:00:00+01:00",
                "price": 50,
                "airline": "FR",
                "link": "/search/MAD0112FCO1?t=FR123&search_date=01112026",
            }
        },
        "currency": "eur",
    }
    now = datetime(2026, 11, 12, tzinfo=timezone.utc)
    obs = provider.parse_raw_payload(
        raw, "MAD", "FCO", date(2026, 12, 1), fetched_at=now
    )
    assert len(obs) == 1
    # 01112026 is 11 days old (> 7 days) -> stale!
    assert obs[0].flags["is_stale"] is True


def test_schema_drift_raises_error(provider):
    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload("not a json dict", "MAD", "FCO", date(2026, 12, 1))

    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload({"result": []}, "MAD", "FCO", date(2026, 12, 1))

    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload(
            {"data": "invalid_type"}, "MAD", "FCO", date(2026, 12, 1)
        )


@pytest.mark.asyncio
async def test_circuit_breaker_on_consecutive_failures(provider):
    provider._consecutive_failures = 5
    with pytest.raises(CircuitBreakerOpenError):
        await provider._call_api_with_resilience("http://dummy", {})


@pytest.mark.asyncio
async def test_redis_cache_hit(provider):
    month = date(2026, 12, 1)
    mock_payload = {
        "data": {
            "2026-12-15": {
                "departure_at": "2026-12-15T08:00:00+01:00",
                "price": 29,
                "airline": "FR",
                "flight_number": "1234",
            }
        },
        "currency": "eur",
    }

    with patch.object(
        provider, "_get_cached_raw_response", new_callable=AsyncMock
    ) as mock_get:
        mock_get.return_value = mock_payload
        with patch.object(
            provider, "_call_api_with_resilience", new_callable=AsyncMock
        ) as mock_call:
            obs = await provider.fetch_month("MAD", "FCO", month)
            assert len(obs) == 1
            assert obs[0].price_cents == 2900
            # Ensure API was NOT called on cache hit
            mock_call.assert_not_called()
