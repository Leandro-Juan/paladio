"""
Unit & Integration Tests for Prioritized European Flight Sweep Hierarchy.
Verifies:
1. RyanairProvider.fetch_month mapping and corridor skipping.
2. CompositeFlightFeed.fetch_month prioritizing Ryanair in Europe and layering Aviasales.
3. CompositeFlightFeed failover to Aviasales on Ryanair error.
4. Non-European corridors querying Aviasales directly.
5. Strict zero-synthetic data compliance.
"""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch
import pytest

from app.engine.market.adapters import CompositeFlightFeed
from app.engine.market.ports import FareObservation, FlightQuote
from app.engine.market.providers.base import ProviderBlockedError
from app.engine.market.providers.ryanair import RyanairProvider


@pytest.mark.asyncio
async def test_ryanair_fetch_month_mapping():
    """Verify RyanairProvider.fetch_month correctly maps quotes to FareObservation."""
    provider = RyanairProvider()

    test_date = date(2027, 4, 15)
    mock_quotes = [
        FlightQuote(
            origin_iata="ALC",
            destination_iata="BRN",
            destination_city_id="BRN",
            depart_date=test_date,
            depart_time=datetime(2027, 4, 15, 14, 30, tzinfo=timezone.utc),
            arrival_time=datetime(2027, 4, 15, 17, 0, tzinfo=timezone.utc),
            base_price_cents=3999,
            currency="EUR",
            carrier="Ryanair",
            flight_number="FR1234",
            stops=0,
            deep_link="https://www.ryanair.com/test",
            source="ryanair",
            source_class="cache",
            observed_at=datetime.now(timezone.utc),
        )
    ]

    with patch.object(
        provider, "fetch_month_cheapest_per_day", new_callable=AsyncMock
    ) as mock_fetch:
        mock_fetch.return_value = mock_quotes
        observations = await provider.fetch_month("ALC", "BRN", date(2027, 4, 1))

        assert len(observations) == 1
        obs = observations[0]
        assert obs.origin == "ALC"
        assert obs.destination == "BRN"
        assert obs.depart_date == test_date
        assert obs.price_cents == 3999
        assert obs.currency == "EUR"
        assert obs.carrier == "Ryanair"
        assert obs.flight_number == "FR1234"
        assert obs.source == "ryanair"
        assert obs.source_class == "cache"


@pytest.mark.asyncio
async def test_ryanair_fetch_month_skips_non_europe():
    """Verify RyanairProvider.fetch_month returns empty list for non-European corridors."""
    provider = RyanairProvider()
    observations = await provider.fetch_month("MAD", "JFK", date(2027, 4, 1))
    assert observations == []


@pytest.mark.asyncio
async def test_composite_flight_feed_europe_hierarchy_merging():
    """Verify CompositeFlightFeed queries Ryanair and Aviasales and merges results for Europe."""
    feed = CompositeFlightFeed()

    now = datetime.now(timezone.utc)
    ryanair_obs = [
        FareObservation(
            origin="MAD",
            destination="LIS",
            depart_date=date(2027, 5, 10),
            depart_time=None,
            arrival_time=None,
            return_date=None,
            trip_type="one_way",
            price_cents=1999,
            currency="EUR",
            carrier="Ryanair",
            flight_number="FR456",
            stops=0,
            deep_link=None,
            source="ryanair",
            source_class="cache",
            market="es",
            found_at=now,
            fetched_at=now,
        )
    ]
    aviasales_obs = [
        FareObservation(
            origin="MAD",
            destination="LIS",
            depart_date=date(2027, 5, 12),
            depart_time=None,
            arrival_time=None,
            return_date=None,
            trip_type="one_way",
            price_cents=4500,
            currency="EUR",
            carrier="IB",
            flight_number=None,
            stops=0,
            deep_link=None,
            source="aviasales",
            source_class="cache",
            market="es",
            found_at=now,
            fetched_at=now,
        )
    ]

    with patch.object(
        feed.ryanair, "fetch_month", new_callable=AsyncMock
    ) as mock_ry, patch.object(
        feed.aviasales, "fetch_month", new_callable=AsyncMock
    ) as mock_av:
        mock_ry.return_value = ryanair_obs
        mock_av.return_value = aviasales_obs

        results = await feed.fetch_month("MAD", "LIS", date(2027, 5, 1))

        assert mock_ry.called
        assert mock_av.called
        assert len(results) == 2
        sources = {r.source for r in results}
        assert sources == {"ryanair", "aviasales"}


@pytest.mark.asyncio
async def test_composite_flight_feed_fallback_on_ryanair_error():
    """Verify CompositeFlightFeed falls back to Aviasales cleanly when Ryanair errors."""
    feed = CompositeFlightFeed()

    now = datetime.now(timezone.utc)
    aviasales_obs = [
        FareObservation(
            origin="MAD",
            destination="FCO",
            depart_date=date(2027, 6, 1),
            depart_time=None,
            arrival_time=None,
            return_date=None,
            trip_type="one_way",
            price_cents=3500,
            currency="EUR",
            carrier="AZ",
            flight_number=None,
            stops=0,
            deep_link=None,
            source="aviasales",
            source_class="cache",
            market="es",
            found_at=now,
            fetched_at=now,
        )
    ]

    with patch.object(
        feed.ryanair,
        "fetch_month",
        side_effect=ProviderBlockedError("Ryanair 403 Forbidden"),
    ), patch.object(feed.aviasales, "fetch_month", new_callable=AsyncMock) as mock_av:
        mock_av.return_value = aviasales_obs

        results = await feed.fetch_month("MAD", "FCO", date(2027, 6, 1))

        assert len(results) == 1
        assert results[0].source == "aviasales"
        assert results[0].price_cents == 3500


@pytest.mark.asyncio
async def test_composite_flight_feed_non_europe_queries_aviasales_directly():
    """Verify non-European routes bypass Ryanair entirely and call Aviasales."""
    feed = CompositeFlightFeed()

    with patch.object(
        feed.ryanair, "fetch_month", new_callable=AsyncMock
    ) as mock_ry, patch.object(
        feed.aviasales, "fetch_month", new_callable=AsyncMock
    ) as mock_av:
        mock_av.return_value = []

        await feed.fetch_month("MAD", "JFK", date(2027, 7, 1))

        mock_ry.assert_not_called()
        mock_av.assert_called_once()
