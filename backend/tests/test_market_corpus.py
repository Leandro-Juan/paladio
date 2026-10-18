"""Unit & integration tests for Route Market Corpus Ingestion."""

import pytest
from datetime import date, datetime, timedelta, timezone
from app.engine.market.corpus import backfill_route_corpus, get_route_corpus_status
from app.engine.market.ports import FlightQuote


class MockTestFlightFeed:
    """Test-only stub provider delivering deterministic calendar quotes across 4 months."""

    async def fetch_calendar_horizon(
        self, origin_iata: str, dest_iata: str, months_ahead: int = 11, session=None
    ) -> list[FlightQuote]:
        quotes = []
        base_d = date(2026, 11, 1)
        # Generate 60 test quotes
        for i in range(60):
            dep_d = base_d + timedelta(days=i)
            # Price between 20 EUR and 80 EUR
            price_cents = 2000 + (i % 15) * 400
            dep_dt = datetime(
                dep_d.year, dep_d.month, dep_d.day, 10, 0, 0, tzinfo=timezone.utc
            )
            quotes.append(
                FlightQuote(
                    origin_iata=origin_iata,
                    destination_iata=dest_iata,
                    destination_city_id=dest_iata,
                    depart_time=dep_dt,
                    arrival_time=dep_dt + timedelta(hours=2),
                    base_price_cents=price_cents,
                    currency="EUR",
                    carrier="TestAir",
                    flight_number=f"TA{100 + i}",
                    stops=0,
                    deep_link=f"https://test.com/flight/{i}",
                    source="test_feed",
                    observed_at=datetime.now(timezone.utc),
                    is_live=True,
                    confidence="high",
                    ancillaries_excluded=True,
                )
            )
        return quotes


@pytest.mark.asyncio
async def test_backfill_route_corpus(db_session):
    test_feed = MockTestFlightFeed()
    res = await backfill_route_corpus(
        session=db_session,
        origin_iata="MAD",
        destination_code="FCO",
        months_ahead=4,
        feed=test_feed,
    )

    assert res["status"] == "ready"
    assert res["ticks_ingested"] == 60
    assert res["depart_dates_count"] == 60
    assert res["min_price_eur"] == 20.0
    assert res["confidence"] in ("provisional", "established")

    # Check status reader
    status = await get_route_corpus_status(db_session, "MAD", "FCO")
    assert status["status"] == "ready"
    assert status["ticks_ingested"] >= 60
    assert status["depart_dates_count"] >= 60
    assert status["min_price_eur"] is not None
