"""
Parser Security & Zero-Synthetic Tests (PLAN.md Phase 1.8).

Verifies that feeding:
1. An HTML shell
2. An empty JSON body ({})
3. A malformed body
to flight providers either returns [] or raises ParseDriftError,
and NEVER returns a fabricated/default quote.
"""

import pytest
from unittest.mock import AsyncMock, patch
import httpx
from datetime import date
from app.engine.market.providers.ryanair import RyanairProvider
from app.engine.market.providers.base import ParseDriftError


@pytest.mark.asyncio
async def test_ryanair_html_shell_raises_drift_or_empty():
    provider = RyanairProvider()
    d1 = date(2026, 11, 20)
    d2 = date(2026, 11, 25)

    fake_resp = httpx.Response(
        200,
        text="<html><body><title>Access Denied / Cloudflare</title><div>Blocked</div></body></html>",
        headers={"Content-Type": "text/html"},
        request=httpx.Request("GET", "https://example.com"),
    )

    with (
        patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=fake_resp),
        patch.object(
            provider,
            "_get_cached_raw_response",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        with pytest.raises(ParseDriftError):
            await provider.fetch_cached_flights("MAD", "FCO", d1, d2)

        with pytest.raises(ParseDriftError):
            await provider.fetch_month_cheapest_per_day("MAD", "FCO", d1)


@pytest.mark.asyncio
async def test_ryanair_empty_json_returns_no_quotes():
    provider = RyanairProvider()
    d1 = date(2026, 11, 20)
    d2 = date(2026, 11, 25)

    fake_resp = httpx.Response(
        200,
        json={},
        headers={"Content-Type": "application/json"},
        request=httpx.Request("GET", "https://example.com"),
    )

    with (
        patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=fake_resp),
        patch.object(
            provider,
            "_get_cached_raw_response",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        quotes = await provider.fetch_cached_flights("MAD", "FCO", d1, d2)
        assert quotes == []

        cheapest = await provider.fetch_month_cheapest_per_day("MAD", "FCO", d1)
        assert cheapest == []


@pytest.mark.asyncio
async def test_ryanair_malformed_body_raises_drift_or_empty():
    provider = RyanairProvider()
    d1 = date(2026, 11, 20)
    d2 = date(2026, 11, 25)

    fake_resp = httpx.Response(
        200,
        text="{fares: [invalid json unquoted",
        headers={"Content-Type": "application/json"},
        request=httpx.Request("GET", "https://example.com"),
    )

    with (
        patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=fake_resp),
        patch.object(
            provider,
            "_get_cached_raw_response",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        with pytest.raises(ParseDriftError):
            await provider.fetch_cached_flights("MAD", "FCO", d1, d2)

        with pytest.raises(ParseDriftError):
            await provider.fetch_month_cheapest_per_day("MAD", "FCO", d1)
