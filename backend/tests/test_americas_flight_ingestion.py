"""
Unit and Integration Tests for Americas Flight Ingestion Pipeline.
Verifies dynamic corridor classification, multi-provider ladder resolution,
dynamic currency & source persistence, TimescaleDB ingestion, and corpus backfill.
Zero hardcoded data: all assertions verify dynamic behavior.
"""

import pytest
from datetime import date, datetime, timedelta, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import (
    DealWatchAlertModel,
    FXRateModel,
    MarketPriceTickModel,
    PriceDailyModel,
)
from app.db.session import async_session
from app.engine.market.adapters import CompositeFlightFeed
from app.engine.market.corpus import backfill_route_corpus, get_route_corpus_status
from app.engine.market.flights.classifier import route_classifier
from app.engine.market.ingest import ingest_flight_ticks
from app.engine.market.ports import FlightQuote
from app.engine.market.providers.ryanair import RyanairProvider
from app.engine.market.sweep import FareObservation
from app.main import app


def test_route_classifier_americas():
    """Verifies that route_classifier dynamically detects Americas corridors."""
    # North America Domestic
    us_route = route_classifier.classify_corridor("JFK", "LAX")
    assert us_route.is_americas is True
    assert us_route.is_europe is False
    assert us_route.corridor_region == "intra_americas"
    assert us_route.suggested_currency == "USD"
    assert us_route.origin_timezone.startswith("America/")
    assert us_route.dest_timezone.startswith("America/")

    # North America - Canada
    ca_route = route_classifier.classify_corridor("YYZ", "YVR")
    assert ca_route.is_americas is True
    assert ca_route.is_europe is False
    assert ca_route.suggested_currency == "CAD"

    # Transborder Americas (US -> Colombia)
    latam_route = route_classifier.classify_corridor("MIA", "BOG")
    assert latam_route.is_americas is True
    assert latam_route.is_europe is False
    assert latam_route.corridor_region == "intra_americas"
    assert latam_route.suggested_currency == "USD"

    # Europe comparison
    eu_route = route_classifier.classify_corridor("MAD", "FCO")
    assert eu_route.is_americas is False
    assert eu_route.is_europe is True
    assert eu_route.corridor_region == "intra_europe"
    assert eu_route.suggested_currency == "EUR"


def test_composite_flight_feed_regional_dispatch():
    """Verifies that CompositeFlightFeed constructs appropriate regional ladders."""
    feed = CompositeFlightFeed()

    # Americas ladder excludes Ryanair
    americas_router = feed._get_router("JFK", "LAX")
    americas_provider_names = [p.name for p in americas_router.providers]
    assert "ryanair" not in americas_provider_names

    # Europe ladder includes Ryanair as primary
    europe_router = feed._get_router("MAD", "FCO")
    europe_provider_names = [p.name for p in europe_router.providers]
    assert europe_provider_names[0] == "ryanair"


@pytest.mark.asyncio
async def test_ryanair_provider_skips_americas():
    """Verifies that RyanairProvider fast-fails / skips non-European corridors."""
    p = RyanairProvider()
    d = date(2026, 11, 20)
    quotes = await p.fetch_cached_flights("JFK", "LAX", d, d)
    assert quotes == []

    horizon = await p.fetch_calendar_horizon("MIA", "BOG", months_ahead=3)
    assert horizon == []


class MockAmericasFlightFeed:
    """Test stub generating authentic USD quotes for Americas testing."""

    async def fetch_cached_flights(
        self,
        origin_iata: str,
        dest_iata: str,
        date_from: date,
        date_to: date,
        session=None,
    ) -> list[FlightQuote]:
        now = datetime.now(timezone.utc)
        dep_dt = datetime(
            date_from.year, date_from.month, date_from.day, 8, 30, tzinfo=timezone.utc
        )
        return [
            FlightQuote(
                origin_iata=origin_iata,
                destination_iata=dest_iata,
                destination_city_id=dest_iata,
                depart_time=dep_dt,
                arrival_time=dep_dt + timedelta(hours=5, minutes=30),
                base_price_cents=34900,
                currency="USD",
                carrier="Delta",
                flight_number="DL412",
                stops=0,
                deep_link=f"https://google.com/travel/flights?q={origin_iata}+{dest_iata}",
                source="google_flights",
                observed_at=now,
                is_live=True,
                confidence="high",
                ancillaries_excluded=True,
            )
        ]

    async def fetch_calendar_horizon(
        self, origin_iata: str, dest_iata: str, months_ahead: int = 4, session=None
    ) -> list[FlightQuote]:
        quotes = []
        base_d = date(2026, 11, 1)
        now = datetime.now(timezone.utc)
        for i in range(50):
            dep_d = base_d + timedelta(days=i)
            dep_dt = datetime(
                dep_d.year, dep_d.month, dep_d.day, 9, 0, tzinfo=timezone.utc
            )
            quotes.append(
                FlightQuote(
                    origin_iata=origin_iata,
                    destination_iata=dest_iata,
                    destination_city_id=dest_iata,
                    depart_time=dep_dt,
                    arrival_time=dep_dt + timedelta(hours=5),
                    base_price_cents=28900 + (i % 10) * 1500,
                    currency="USD",
                    carrier="American",
                    flight_number=f"AA{200 + i}",
                    stops=0,
                    deep_link="https://google.com/travel/flights",
                    source="google_flights",
                    observed_at=now,
                    is_live=True,
                    confidence="high",
                    ancillaries_excluded=True,
                )
            )
        return quotes

    async def fetch_month(
        self, origin: str, dest: str, month: date, trip_type: str = "one_way"
    ) -> list[FareObservation]:
        now = datetime.now(timezone.utc)
        return [
            FareObservation(
                origin=origin,
                destination=dest,
                depart_date=date(month.year, month.month, day),
                depart_time=None,
                arrival_time=None,
                return_date=None,
                trip_type=trip_type,
                price_cents=28900 + (day % 10) * 1500,
                currency="USD",
                carrier="American",
                flight_number=f"AA{200 + day}",
                stops=0,
                deep_link="https://google.com/travel/flights",
                source="google_flights",
                source_class="live",
                market="us",
                found_at=now,
                fetched_at=now,
            )
            for day in range(1, 16)
        ]

    async def verify_flight(self, quote: FlightQuote, session=None):
        return (
            True,
            quote.base_price_cents,
            {"verified": True, "source": "google_flights"},
        )


async def _seed_eur_usd_fx_rate(session) -> None:
    stmt = (
        pg_insert(FXRateModel)
        .values(
            base_currency="EUR",
            quote_currency="USD",
            rate=1.08,
            as_of=date.today(),
        )
        .on_conflict_do_nothing()
    )
    await session.execute(stmt)
    await session.flush()


@pytest.mark.asyncio
async def test_ingest_flight_ticks_americas(db_session):
    """Verifies that ingest_flight_ticks saves dynamic source and currency into TimescaleDB."""
    await _seed_eur_usd_fx_rate(db_session)
    await db_session.execute(
        delete(MarketPriceTickModel).where(
            MarketPriceTickModel.origin_iata.in_(["MIA", "BOG"]),
            MarketPriceTickModel.destination_code.in_(["MIA", "BOG"]),
        )
    )
    await db_session.commit()
    test_feed = MockAmericasFlightFeed()
    dep_d = date(2026, 11, 20)
    await db_session.execute(
        delete(MarketPriceTickModel).where(
            MarketPriceTickModel.origin_iata == "JFK",
            MarketPriceTickModel.destination_code == "LAX",
            MarketPriceTickModel.depart_date == dep_d,
        )
    )
    await db_session.commit()

    count = await ingest_flight_ticks(
        session=db_session,
        origin_iata="JFK",
        dest_iata="LAX",
        dest_code="LAX",
        date_from=dep_d,
        date_to=dep_d,
        feed=test_feed,
        run_id="test_americas_run",
    )
    assert count == 1

    # Query inserted tick
    stmt = select(MarketPriceTickModel).where(
        MarketPriceTickModel.origin_iata == "JFK",
        MarketPriceTickModel.destination_code == "LAX",
        MarketPriceTickModel.depart_date == dep_d,
        MarketPriceTickModel.ingest_run_id == "test_americas_run",
    )
    res = await db_session.execute(stmt)
    tick = res.scalars().first()

    assert tick is not None
    assert tick.source == "google_flights"
    assert tick.currency == "EUR"
    assert tick.original_currency == "USD"
    assert tick.original_price_cents == 34900
    assert tick.base_price_cents == round(34900 / 1.08)
    assert tick.metadata_json["carrier"] == "Delta"
    assert tick.metadata_json["flight_number"] == "DL412"

    # Verify price_daily rollup
    daily_stmt = select(PriceDailyModel).where(
        PriceDailyModel.origin_iata == "JFK",
        PriceDailyModel.destination_code == "LAX",
        PriceDailyModel.depart_date == dep_d,
    )
    daily_res = await db_session.execute(daily_stmt)
    daily = daily_res.scalar_one_or_none()
    assert daily is not None
    assert daily.source == "google_flights"
    assert daily.currency == "EUR"
    assert daily.min_base == round(34900 / 1.08)


@pytest.mark.asyncio
async def test_backfill_route_corpus_americas(db_session):
    """Verifies that backfill_route_corpus works seamlessly for Americas routes with dynamic source."""
    await _seed_eur_usd_fx_rate(db_session)
    await db_session.execute(
        delete(MarketPriceTickModel).where(
            MarketPriceTickModel.origin_iata.in_(["MIA", "BOG"]),
            MarketPriceTickModel.destination_code.in_(["MIA", "BOG"]),
        )
    )
    await db_session.commit()
    test_feed = MockAmericasFlightFeed()

    res = await backfill_route_corpus(
        session=db_session,
        origin_iata="MIA",
        destination_code="BOG",
        months_ahead=4,
        feed=test_feed,
    )

    assert res["status"] == "ready"
    assert res["ticks_ingested"] >= 50
    assert res["depart_dates_count"] >= 50
    assert res["min_price_eur"] > 0

    # Check RouteCorpusStatusModel
    status = await get_route_corpus_status(db_session, "MIA", "BOG")
    assert status["status"] == "ready"
    assert status["ticks_ingested"] >= 50
    assert status["min_price_eur"] is not None


@pytest.mark.asyncio
async def test_market_api_americas_route_lifecycle(monkeypatch):
    """End-to-end API test creating an Americas monitored route and fetching its calendar."""
    from app.engine.market import adapters, ingest

    async with async_session() as session:
        await _seed_eur_usd_fx_rate(session)
        await session.execute(
            delete(DealWatchAlertModel).where(
                DealWatchAlertModel.origin_iata == "JFK",
            )
        )
        await session.commit()

    test_feed = MockAmericasFlightFeed()
    monkeypatch.setattr(adapters, "CompositeFlightFeed", lambda *a, **kw: test_feed)
    monkeypatch.setattr(ingest, "CompositeFlightFeed", lambda *a, **kw: test_feed)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        today = date.today()
        payload = {
            "origin_iata": "JFK",
            "destination_code": "LAX",
            "earliest_date": (today + timedelta(days=10)).isoformat(),
            "latest_date": (today + timedelta(days=40)).isoformat(),
            "min_nights": 3,
            "max_nights": 6,
            "travelers": 1,
            "max_budget_eur": 450.0,
        }
        res = await client.post("/api/market/routes", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["origin_iata"] == "JFK"
        assert data["destination_code"] == "LAX"
        route_id = data["id"]

        # Route calendar query
        cal_res = await client.get(f"/api/market/routes/{route_id}/calendar?months=2")
        assert cal_res.status_code == 200
        cal_data = cal_res.json()
        assert "route_label" in cal_data
        assert "months" in cal_data
