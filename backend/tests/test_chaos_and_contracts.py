"""
Phase 7 Integration Tests: Observability, Telemetry, Chaos, Contract Canary, and Property Tests.

Gates:
- P7.1 Daily Report API (/api/market/telemetry/daily-report)
- P7.2 Contract canary alerting on shape changes (ParseDriftError)
- P7.3 Chaos tests (429 storms, empty bodies, malformed JSON, slow responses, expired tokens)
- P7.4 Property tests: parsers never output fields absent from input
- P7.5 Extended provider health endpoint (/api/market/providers/health)
"""

import json
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models import (
    MarketPriceTickModel,
    MarketSweepRunModel,
    ProviderHealthModel,
    RouteMonthCoverageModel,
)
from app.db.session import async_session
from app.engine.market.config import config
from app.engine.market.providers.aviasales import AviasalesProvider
from app.engine.market.providers.base import (
    ParseDriftError,
    ProviderBlockedError,
)
from app.main import app


@pytest.mark.asyncio
async def test_daily_report_telemetry_endpoint():
    """Verify that GET /api/market/telemetry/daily-report returns complete telemetry schema."""
    now = datetime.now(timezone.utc)

    async with async_session() as session:
        # 1. Seed sweep run
        sweep_run = MarketSweepRunModel(
            run_id=f"test_run_{int(now.timestamp())}",
            started_at=now,
            finished_at=now + timedelta(minutes=5),
            provider="aviasales",
            routes_total=2,
            routes_ok=2,
            calls_made=22,
            calls_failed=0,
            status="completed",
        )
        session.add(sweep_run)

        # 2. Seed route month coverage
        cov = RouteMonthCoverageModel(
            id=f"test_cov_{int(now.timestamp())}",
            run_date=now.date(),
            origin="MAD",
            dest="BCN",
            month="2027-01",
            days_in_month=31,
            days_with_price=28,
            source="aviasales",
            market="es",
        )
        session.add(cov)

        # 3. Seed ticks with varying freshness
        t1 = MarketPriceTickModel(
            id=f"tick_fresh_{int(now.timestamp())}",
            asset_type="flight",
            origin_iata="MAD",
            destination_code="BCN",
            depart_date=now.date() + timedelta(days=30),
            base_price_cents=3500,
            currency="EUR",
            source="aviasales",
            source_class="cache",
            market="es",
            observed_at=now,
            source_observed_at=now - timedelta(hours=6),  # < 1d
            lead_time_days=30,
            content_hash=b"fresh_hash_123456789012345678901234",
        )
        t2 = MarketPriceTickModel(
            id=f"tick_stale_{int(now.timestamp())}",
            asset_type="flight",
            origin_iata="MAD",
            destination_code="BCN",
            depart_date=now.date() + timedelta(days=60),
            base_price_cents=4500,
            currency="EUR",
            source="aviasales",
            source_class="cache",
            market="es",
            observed_at=now,
            source_observed_at=now - timedelta(days=10),  # > 7d (stale)
            lead_time_days=60,
            content_hash=b"stale_hash_123456789012345678901234",
        )
        session.add_all([t1, t2])
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/market/telemetry/daily-report")
        assert resp.status_code == 200
        data = resp.json()

        # Check top-level keys
        assert "run_date" in data
        assert "calls_vs_limit" in data
        assert "provider_stats" in data
        assert "route_month_coverage" in data
        assert "freshness_histogram" in data
        assert "stale_rows_count" in data
        assert "verified_deals_drift" in data

        # Check calls vs limit
        calls_info = data["calls_vs_limit"]
        assert calls_info["calls_made_today"] >= 22
        assert calls_info["daily_limit"] == config.LIVE_DAILY_BUDGET_TIER2

        # Check freshness histogram bins
        hist = data["freshness_histogram"]
        assert "<1d" in hist
        assert "1-3d" in hist
        assert "3-7d" in hist
        assert ">7d" in hist
        assert hist["<1d"] >= 1
        assert hist[">7d"] >= 1
        assert data["stale_rows_count"] >= 1


@pytest.mark.asyncio
async def test_provider_health_extended_endpoint():
    """Verify that GET /api/market/providers/health returns consecutive_failure_days and last_coverage."""
    now = datetime.now(timezone.utc)
    provider_name = f"telemetry_prov_{int(now.timestamp())}"

    async with async_session() as session:
        health = ProviderHealthModel(
            provider=provider_name,
            asset_type="flight",
            status="ok",
            failure_count=0,
            consecutive_failures=0,
            consecutive_failure_days=0,
            last_coverage=85.5,
            last_run_id="run_123",
            last_ok_at=now,
        )
        session.add(health)
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/market/providers/health")
        assert resp.status_code == 200
        items = resp.json()
        target = next(
            (item for item in items if item["provider"] == provider_name), None
        )
        assert target is not None
        assert target["consecutive_failure_days"] == 0
        assert target["last_coverage"] == 85.5
        assert target["last_run_id"] == "run_123"


@pytest.mark.asyncio
async def test_chaos_429_storm_and_rate_limit():
    """Verify that 429 Too Many Requests triggers ProviderBlockedError after retry budget."""
    provider = AviasalesProvider(token="test_token")

    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.headers = {"retry-after": "0.01"}
    mock_resp.text = "Too Many Requests"

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ProviderBlockedError):
            await provider._call_api_with_resilience(
                url="https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
                params={"origin": "MAD", "destination": "BCN"},
            )


@pytest.mark.asyncio
async def test_chaos_empty_bodies():
    """Verify that empty response bodies return empty list without crashing or synthesizing fake data."""
    provider = AviasalesProvider(token="test_token")

    # 1. Missing data key raises ParseDriftError
    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload({}, "MAD", "BCN", date(2027, 3, 1))

    # 2. Empty data array returns empty list
    assert (
        provider.parse_raw_payload(
            {"success": True, "data": []}, "MAD", "BCN", date(2027, 3, 1)
        )
        == []
    )

    # 3. Non-dict raises ParseDriftError
    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload([], "MAD", "BCN", date(2027, 3, 1))  # type: ignore


@pytest.mark.asyncio
async def test_chaos_malformed_json_and_html_error_page():
    """Verify that HTML error pages or malformed JSON payloads raise ParseDriftError in HTTP client."""
    provider = AviasalesProvider(token="test_token")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "<html><body>502 Bad Gateway</body></html>"
    mock_resp.json.side_effect = json.JSONDecodeError("Expecting value", "<html>", 0)

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ParseDriftError):
            await provider._call_api_with_resilience(
                url="https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
                params={"origin": "MAD", "destination": "BCN"},
            )


@pytest.mark.asyncio
async def test_chaos_slow_response_timeout():
    """Verify that upstream network timeouts raise httpx.TimeoutException cleanly."""
    provider = AviasalesProvider(token="test_token", timeout_sec=0.1)

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get = AsyncMock(
        side_effect=httpx.ReadTimeout("Read timed out after 0.1s")
    )

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(httpx.TimeoutException):
            await provider._call_api_with_resilience(
                url="https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
                params={"origin": "MAD", "destination": "BCN"},
            )


@pytest.mark.asyncio
async def test_chaos_expired_or_unauthorized_token():
    """Verify that 403 HTTP errors from expired or invalid credentials raise ProviderBlockedError."""
    provider = AviasalesProvider(token="expired_token")

    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.text = '{"error": "Forbidden"}'

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ProviderBlockedError) as exc_info:
            await provider._call_api_with_resilience(
                url="https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
                params={"origin": "MAD", "destination": "BCN"},
            )
        assert "403" in str(exc_info.value)


def test_property_parsers_never_invent_fields():
    """
    Property test: Ensure parsers NEVER invent fields that were absent in raw API payload.
    Specifically:
    - If flight_number is missing, output MUST have flight_number=None.
    - If depart_time is missing, output MUST have depart_time=None.
    - If arrival_time is missing, output MUST have arrival_time=None.
    - If stops is missing, output MUST have stops=None.
    """
    provider = AviasalesProvider(token="test_token")

    sparse_payload = {
        "success": True,
        "data": [
            {
                "price": 42,
                "airline": "IB",
                "departure_at": "2027-05-15",
                "origin": "MAD",
                "destination": "OPO",
                "link": "/search/MAD1505OPO",
            }
        ],
    }

    observations = provider.parse_raw_payload(
        sparse_payload, "MAD", "OPO", date(2027, 5, 1)
    )
    assert len(observations) == 1
    obs = observations[0]

    assert obs.depart_date == date(2027, 5, 15)
    assert obs.depart_time is None, "depart_time must NEVER be fabricated if absent!"
    assert obs.arrival_time is None, "arrival_time must NEVER be fabricated if absent!"
    assert (
        obs.flight_number is None
    ), "flight_number must NEVER be fabricated if absent!"
    assert obs.stops is None, "stops must NEVER be fabricated if absent!"
    assert obs.return_date is None, "return_date must NEVER be fabricated for one_way!"


def test_canary_parse_drift_detection():
    """
    Canary test: Alerts when upstream API payload changes structure.
    Simulates:
    1. 'data' field is string instead of list.
    2. 'departure_at' format altered or missing.
    3. 'price' field renamed or missing.
    """
    provider = AviasalesProvider(token="test_token")

    # 1. Non-list data
    drifted_data_type = {"success": True, "data": "unexpected string"}
    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload(drifted_data_type, "MAD", "OPO", date(2027, 5, 1))

    # 2. Missing required 'departure_at'
    missing_departure = {"success": True, "data": [{"price": 50, "airline": "IB"}]}
    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload(missing_departure, "MAD", "OPO", date(2027, 5, 1))

    # 3. Missing required 'price'
    missing_price = {
        "success": True,
        "data": [{"departure_at": "2027-05-15", "airline": "IB"}],
    }
    with pytest.raises(ParseDriftError):
        provider.parse_raw_payload(missing_price, "MAD", "OPO", date(2027, 5, 1))
