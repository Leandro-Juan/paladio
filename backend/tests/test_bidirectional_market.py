"""Unit & integration tests for Bi-directional Route Monitoring & Round-Trip Calendar Matrix."""

import pytest
from datetime import date, datetime, timedelta, timezone
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.engine.market.corpus import backfill_route_corpus
from app.engine.market.ports import FlightQuote


class MockTestFlightFeed:
    """Test-only stub provider delivering deterministic calendar quotes across 4 months."""

    async def fetch_calendar_horizon(
        self, origin_iata: str, dest_iata: str, months_ahead: int = 11, session=None
    ) -> list[FlightQuote]:
        quotes = []
        base_d = date.today()
        for i in range(90):
            dep_d = base_d + timedelta(days=i)
            price_cents = 2500 + (i % 12) * 350
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

    async def fetch_cached_flights(
        self,
        origin_iata: str,
        dest_iata: str,
        date_from: date,
        date_to: date,
        session=None,
    ) -> list[FlightQuote]:
        return await self.fetch_calendar_horizon(origin_iata, dest_iata)


@pytest.mark.asyncio
async def test_bidirectional_corpus_backfill(db_session):
    """Verifies that backfill_route_corpus sweeps both outbound and inbound corridors."""
    test_feed = MockTestFlightFeed()
    res = await backfill_route_corpus(
        session=db_session,
        origin_iata="MAD",
        destination_code="FCO",
        months_ahead=4,
        feed=test_feed,
        bidirectional=True,
    )

    assert res["status"] == "ready"
    assert res["origin_iata"] == "MAD"
    assert res["destination_code"] == "FCO"
    assert res["return_leg"] is not None
    assert res["return_leg"]["origin_iata"] == "FCO"
    assert res["return_leg"]["destination_code"] == "MAD"
    assert res["return_leg"]["status"] == "ready"


@pytest.mark.asyncio
async def test_bidirectional_calendar_and_history_endpoints(db_session):
    """Tests the /routes/{id}/calendar with outbound, inbound, and roundtrip views, plus history."""
    test_feed = MockTestFlightFeed()
    # Populate both corridors
    await backfill_route_corpus(
        session=db_session,
        origin_iata="MAD",
        destination_code="FCO",
        months_ahead=4,
        feed=test_feed,
        bidirectional=True,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        today = date.today()
        payload = {
            "origin_iata": "MAD",
            "destination_code": "FCO",
            "earliest_date": (today + timedelta(days=7)).isoformat(),
            "latest_date": (today + timedelta(days=60)).isoformat(),
            "min_nights": 2,
            "max_nights": 5,
            "travelers": 1,
            "max_budget_eur": 250.0,
        }
        create_res = await client.post("/api/market/routes", json=payload)
        assert create_res.status_code == 201
        route_id = create_res.json()["id"]

        # 1. Test outbound calendar
        cal_out = await client.get(
            f"/api/market/routes/{route_id}/calendar?view=outbound&months=4"
        )
        assert cal_out.status_code == 200
        data_out = cal_out.json()
        assert data_out["view"] == "outbound"
        assert len(data_out["months"]) == 4

        # 2. Test inbound calendar
        cal_in = await client.get(
            f"/api/market/routes/{route_id}/calendar?view=inbound&months=4"
        )
        assert cal_in.status_code == 200
        data_in = cal_in.json()
        assert data_in["view"] == "inbound"

        # 3. Test roundtrip flights calendar
        cal_rt = await client.get(
            f"/api/market/routes/{route_id}/calendar?view=roundtrip&pricing=flights&months=4"
        )
        assert cal_rt.status_code == 200
        data_rt = cal_rt.json()
        assert data_rt["view"] == "roundtrip"
        assert data_rt["pricing"] == "flights"
        assert "⇄" in data_rt["route_label"]

        # 4. Test roundtrip package calendar (flights + hotel)
        cal_pkg = await client.get(
            f"/api/market/routes/{route_id}/calendar?view=roundtrip&pricing=package&months=4"
        )
        assert cal_pkg.status_code == 200
        data_pkg = cal_pkg.json()
        assert data_pkg["pricing"] == "package"

        # 5. Test history dual forward curve
        hist_res = await client.get(f"/api/market/routes/{route_id}/history?range=30d")
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert "forward_curve" in hist_data
        assert "return_points" in hist_data
