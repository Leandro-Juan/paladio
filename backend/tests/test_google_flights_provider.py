"""
Tests for GoogleFlightsProvider (fast-flights Protobuf ?tfs= + primp + defensive ds:1 parser)
and its #2 integration behind Ryanair (#1) in CompositeFlightFeed & DefaultLiveFareVerifier.

Strictly tests ONLY GoogleFlightsProvider and mocked wiring — never calls Ryanair,
Aviasales, or lodging scrapers live.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.engine.market.adapters import CompositeFlightFeed
from app.engine.market.config import config
from app.engine.market.ports import FareObservation, FlightQuote
from app.engine.market.providers.base import (
    DailyBudgetExhaustedError,
    ParseDriftError,
    ProviderBlockedError,
)
from app.engine.market.providers.google_flights import (
    GoogleFlightsProvider,
    ParsedGoogleItinerary,
    _TransientGoogleError,
    parse_google_flights_html,
)
from app.engine.market.verifier import (
    DefaultLiveFareVerifier,
    build_flight_feed_live_checker,
)


def _wrap_ds1_html(payload: object, *, trailing: str = "hash: '1'") -> str:
    body = json.dumps(payload)
    return (
        "<!doctype html><html><head></head><body>"
        f"<script class=\"ds:1\">AF_initDataCallback({{key: 'ds:1', {trailing}, data:{body}, sideChannel: {{}}}});</script>"
        "</body></html>"
    )


def _make_leg(
    origin: str,
    dest: str,
    dep_date: list[int],
    dep_time: list[int | None],
    arr_date: list[int],
    arr_time: list[int | None],
    duration_mins: int,
    carrier_code: str,
    flight_num: str,
    carrier_name: str,
) -> list[object]:
    leg: list[object] = [None] * 25
    leg[3] = origin
    leg[4] = f"{origin} Airport"
    leg[5] = f"{dest} Airport"
    leg[6] = dest
    leg[8] = dep_time
    leg[10] = arr_time
    leg[11] = duration_mins
    leg[17] = "Airbus A320"
    leg[20] = dep_date
    leg[21] = arr_date
    leg[22] = [carrier_code, flight_num, None, carrier_name]
    return leg


def _make_itinerary_item(
    carrier_code: str,
    airlines: list[str],
    legs: list[list[object]],
    price_units: float | None,
    total_duration: int | None = None,
) -> list[object]:
    flight: list[object] = [None] * 23
    flight[0] = carrier_code
    flight[1] = airlines
    flight[2] = legs
    flight[9] = total_duration
    flight[22] = [None] * 18
    price_block = [[None, price_units], "token123"] if price_units is not None else [[]]
    return [flight, price_block]


def test_parse_extracts_both_best_and_other_flights():
    dep = [2027, 2, 15]
    best_leg = _make_leg(
        "MAD", "LHR", dep, [None, 20], dep, [2, 5], 165, "IB", "721", "Iberia"
    )
    other_leg_1 = _make_leg(
        "MAD", "CDG", dep, [13], dep, [15, 10], 130, "AF", "1001", "Air France"
    )
    other_leg_2 = _make_leg(
        "CDG", "LHR", dep, [17, 5], dep, [17, 30], 85, "AF", "1680", "Air France"
    )

    payload: list[object] = [None] * 8
    payload[2] = [
        [_make_itinerary_item("IB", ["Iberia"], [best_leg], 43, total_duration=165)]
    ]
    payload[3] = [
        [
            _make_itinerary_item(
                "AF",
                ["Air France"],
                [other_leg_1, other_leg_2],
                128,
                total_duration=330,
            )
        ]
    ]
    payload[5] = [
        1,
        [None, 43],
        None,
        None,
        [None, 40],
        [None, 135],
        1,
        None,
        None,
        None,
        [[[1, 43], [2, 45]]],
    ]

    html = _wrap_ds1_html(payload)
    itineraries = parse_google_flights_html(
        html,
        origin_iata="MAD",
        dest_iata="LHR",
        depart_date=date(2027, 2, 15),
        currency="EUR",
        deep_link="https://www.google.com/travel/flights/search?tfs=abc",
    )

    assert len(itineraries) == 2
    first, second = itineraries[0], itineraries[1]

    assert first.is_best is True
    assert first.price_cents == 4300
    assert first.carrier == "Iberia"
    assert first.carrier_code == "IB"
    assert first.flight_number == "IB721"
    assert first.stops == 0
    assert first.duration_mins == 165
    assert first.depart_time == datetime(2027, 2, 15, 0, 20)
    assert first.arrival_time == datetime(2027, 2, 15, 2, 5)
    assert first.price_insights == {
        "price_level": 1,
        "typical_low_cents": 4000,
        "typical_high_cents": 13500,
        "history_points": 2,
    }

    assert second.is_best is False
    assert second.price_cents == 12800
    assert second.flight_number == "AF1001"
    assert second.stops == 1
    assert second.duration_mins == 330
    assert second.depart_time == datetime(2027, 2, 15, 13, 0)
    assert second.arrival_time == datetime(2027, 2, 15, 17, 30)


def test_parse_handles_consent_wall_and_captcha_as_provider_blocked():
    consent_html = (
        '<!doctype html><html><head><base href="https://consent.google.com/"></head>'
        "<body>Before you continue to Google</body></html>"
    )
    with pytest.raises(ProviderBlockedError, match="consent wall"):
        parse_google_flights_html(
            consent_html,
            origin_iata="MAD",
            dest_iata="LHR",
            depart_date=date(2027, 2, 15),
            currency="EUR",
            deep_link="https://example.com",
        )

    captcha_html = "<html><body>Our systems detected unusual traffic /sorry/index g-recaptcha</body></html>"
    with pytest.raises(ProviderBlockedError, match="anti-bot"):
        parse_google_flights_html(
            captcha_html,
            origin_iata="MAD",
            dest_iata="LHR",
            depart_date=date(2027, 2, 15),
            currency="EUR",
            deep_link="https://example.com",
        )

    broken_html = (
        "<html><body><div>Unexpected layout without data script</div></body></html>"
    )
    with pytest.raises(ParseDriftError):
        parse_google_flights_html(
            broken_html,
            origin_iata="MAD",
            dest_iata="LHR",
            depart_date=date(2027, 2, 15),
            currency="EUR",
            deep_link="https://example.com",
        )


def test_parse_handles_empty_invalid_and_missing_price_without_crashing():
    # Empty root list (bogus airport)
    assert (
        parse_google_flights_html(
            _wrap_ds1_html([]),
            origin_iata="MAD",
            dest_iata="ZZZ",
            depart_date=date(2027, 2, 15),
            currency="EUR",
            deep_link="https://example.com",
        )
        == []
    )

    # Valid payload with None groups (e.g. LPA->HND) and missing-price items
    dep = [2027, 3, 10]
    leg = _make_leg("LPA", "HND", dep, [8], dep, [22, 15], 855, "IB", "999", "Iberia")
    payload: list[object] = [None] * 8
    payload[2] = None
    payload[3] = [[_make_itinerary_item("IB", ["Iberia"], [leg], None)]]
    assert (
        parse_google_flights_html(
            _wrap_ds1_html(payload),
            origin_iata="LPA",
            dest_iata="HND",
            depart_date=date(2027, 3, 10),
            currency="EUR",
            deep_link="https://example.com",
        )
        == []
    )

    # ErrorResponse for future date triggers transient retry signal; past date returns []
    err_html = (
        "<script class=\"ds:1\">AF_initDataCallback({key: 'ds:1', "
        'data:[13,null,[["type.googleapis.com/travel.frontend.flights.ErrorResponse"]]],'
        "errorHasStatus: true,});</script>"
    )
    future_date = date.today() + timedelta(days=30)
    with pytest.raises(_TransientGoogleError):
        parse_google_flights_html(
            err_html,
            origin_iata="MAD",
            dest_iata="BCN",
            depart_date=future_date,
            currency="EUR",
            deep_link="https://example.com",
        )
    assert (
        parse_google_flights_html(
            err_html,
            origin_iata="MAD",
            dest_iata="BCN",
            depart_date=date(2020, 1, 1),
            currency="EUR",
            deep_link="https://example.com",
        )
        == []
    )


def test_google_flights_provider_cloud_guard_and_query_encoding():
    provider = GoogleFlightsProvider()
    assert provider.name == "google_flights"
    assert provider.asset_type == "flight"
    assert provider.cloud is False

    query, gl, deep_link = provider._build_query(
        "mad",
        "lhr",
        date(2027, 2, 15),
        return_date=date(2027, 2, 20),
        currency="eur",
    )
    params = query.params()
    assert gl == "ES"
    assert params["hl"] == "en-US"
    assert params["curr"] == "EUR"
    assert len(params["tfs"]) > 10
    assert "tfs=" in deep_link
    assert "&gl=ES" in deep_link


@pytest.mark.asyncio
async def test_google_flights_provider_daily_budget_and_range_cap(monkeypatch):
    provider = GoogleFlightsProvider()
    patched_cfg = replace(
        config,
        GOOGLE_FLIGHTS_DAILY_BUDGET=2,
        GOOGLE_FLIGHTS_MAX_RANGE_DAYS=4,
        GOOGLE_FLIGHTS_MONTH_SAMPLE_DAYS=3,
    )
    monkeypatch.setattr(
        "app.engine.market.providers.google_flights.config", patched_cfg
    )

    # Force Redis unavailable so local in-memory budget guard is exercised deterministically
    with patch("app.core.redis.get_redis", side_effect=RuntimeError("no redis")):
        await provider._consume_daily_budget()
        await provider._consume_daily_budget()
        with pytest.raises(DailyBudgetExhaustedError):
            await provider._consume_daily_budget()

    called_dates: list[date] = []

    async def fake_search_date(origin, dest, d, **kwargs):
        called_dates.append(d)
        return [
            ParsedGoogleItinerary(
                origin_iata=origin,
                destination_iata=dest,
                depart_date=d,
                depart_time=datetime(d.year, d.month, d.day, 9, 0),
                arrival_time=datetime(d.year, d.month, d.day, 11, 30),
                price_cents=5500,
                currency="EUR",
                carrier="Iberia",
                carrier_code="IB",
                flight_number="IB721",
                stops=0,
                duration_mins=150,
                is_best=True,
                deep_link="https://www.google.com/travel/flights/search?tfs=x",
            )
        ]

    start = date.today() + timedelta(days=10)
    end = start + timedelta(days=30)
    with patch.object(provider, "search_date", side_effect=fake_search_date):
        quotes = await provider.fetch_cached_flights("MAD", "LHR", start, end)
        assert len(called_dates) == 4
        assert called_dates[0] == start
        assert called_dates[-1] == end
        assert len(quotes) == 4
        assert all(q.source == "google_flights" and q.is_live for q in quotes)

        called_dates.clear()
        future_month = date(
            start.year + (1 if start.month == 12 else 0), (start.month % 12) + 1, 1
        )
        obs = await provider.fetch_month("MAD", "LHR", future_month)
        assert len(called_dates) == 3
        assert len(obs) == 3
        assert all(
            isinstance(o, FareObservation) and o.source == "google_flights" for o in obs
        )


@pytest.mark.asyncio
async def test_google_flights_verify_flight_exact_matching_and_tolerance():
    provider = GoogleFlightsProvider()
    dep_date = date.today() + timedelta(days=25)
    live_itineraries = [
        ParsedGoogleItinerary(
            origin_iata="MAD",
            destination_iata="LHR",
            depart_date=dep_date,
            depart_time=datetime(dep_date.year, dep_date.month, dep_date.day, 6, 45),
            arrival_time=datetime(dep_date.year, dep_date.month, dep_date.day, 8, 25),
            price_cents=4900,
            currency="EUR",
            carrier="Iberia",
            carrier_code="IB",
            flight_number="IB719",
            stops=0,
            duration_mins=160,
            is_best=True,
            deep_link="https://www.google.com/travel/flights/search?tfs=1",
        ),
        ParsedGoogleItinerary(
            origin_iata="MAD",
            destination_iata="LHR",
            depart_date=dep_date,
            depart_time=datetime(dep_date.year, dep_date.month, dep_date.day, 15, 50),
            arrival_time=datetime(dep_date.year, dep_date.month, dep_date.day, 17, 15),
            price_cents=6200,
            currency="EUR",
            carrier="Iberia",
            carrier_code="IB",
            flight_number="IB721",
            stops=0,
            duration_mins=145,
            is_best=False,
            deep_link="https://www.google.com/travel/flights/search?tfs=2",
        ),
    ]

    with patch.object(provider, "search_date", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = live_itineraries

        # 1. Exact flight number match within 5% tolerance
        quote_ok = FlightQuote(
            origin_iata="MAD",
            destination_iata="LHR",
            destination_city_id="LHR",
            depart_date=dep_date,
            base_price_cents=6000,
            currency="EUR",
            carrier="Iberia",
            flight_number="IB721",
        )
        ok, live_cents, details = await provider.verify_flight(quote_ok)
        assert ok is True
        assert live_cents == 6200
        assert details["match_type"] == "exact_flight_number"
        assert details["flight_number"] == "IB721"

        # 2. Same quote at old lower price fails tolerance
        quote_drift = FlightQuote(
            origin_iata="MAD",
            destination_iata="LHR",
            destination_city_id="LHR",
            depart_date=dep_date,
            base_price_cents=4000,
            currency="EUR",
            carrier="Iberia",
            flight_number="IB721",
        )
        ok_drift, live_cents_drift, details_drift = await provider.verify_flight(
            quote_drift
        )
        assert ok_drift is False
        assert live_cents_drift == 6200
        assert "exceeds tolerance" in details_drift["reason"]

        # 3. Empty live results -> unverified
        mock_search.return_value = []
        ok_empty, cents_empty, _ = await provider.verify_flight(quote_ok)
        assert ok_empty is False
        assert cents_empty == 0


@pytest.mark.asyncio
async def test_composite_flight_feed_keeps_ryanair_first_and_google_flights_second():
    feed = CompositeFlightFeed()

    eu_router = feed._get_router("MAD", "FCO")
    assert [p.name for p in eu_router.providers] == [
        "ryanair",
        "google_flights",
        "aviasales",
    ]

    global_router = feed._get_router("JFK", "LAX")
    assert [p.name for p in global_router.providers] == ["google_flights", "aviasales"]

    now = datetime.now(timezone.utc)
    sample_obs = FareObservation(
        origin="MAD",
        destination="FCO",
        depart_date=date(2027, 4, 10),
        depart_time=None,
        arrival_time=None,
        return_date=None,
        trip_type="one_way",
        price_cents=2900,
        currency="EUR",
        carrier="FR",
        flight_number="FR123",
        stops=0,
        deep_link=None,
        source="ryanair",
        source_class="cache",
        market="es",
        found_at=now,
        fetched_at=now,
    )

    # Europe fetch_month: when Ryanair succeeds, Google Flights is NOT called
    with (
        patch.object(
            feed.ryanair,
            "fetch_month",
            new_callable=AsyncMock,
            return_value=[sample_obs],
        ) as mock_ry,
        patch.object(
            feed.aviasales, "fetch_month", new_callable=AsyncMock, return_value=[]
        ) as mock_av,
        patch.object(
            feed.google_flights, "fetch_month", new_callable=AsyncMock
        ) as mock_gf,
    ):
        obs = await feed.fetch_month("MAD", "FCO", date(2027, 4, 1))
        assert len(obs) == 1
        assert obs[0].source == "ryanair"
        mock_ry.assert_called_once()
        mock_av.assert_called_once()
        mock_gf.assert_not_called()

    # Europe fetch_month: when both Ryanair and Aviasales return empty, Google Flights #2 fallback runs
    gf_obs = FareObservation(
        origin="MAD",
        destination="LHR",
        depart_date=date(2027, 4, 10),
        depart_time=None,
        arrival_time=None,
        return_date=None,
        trip_type="one_way",
        price_cents=4300,
        currency="EUR",
        carrier="IB",
        flight_number="IB721",
        stops=0,
        deep_link="https://www.google.com/travel/flights/search?tfs=abc",
        source="google_flights",
        source_class="live",
        market="es",
        found_at=now,
        fetched_at=now,
    )
    with (
        patch.object(
            feed.ryanair, "fetch_month", new_callable=AsyncMock, return_value=[]
        ),
        patch.object(
            feed.aviasales, "fetch_month", new_callable=AsyncMock, return_value=[]
        ),
        patch.object(
            feed.google_flights,
            "fetch_month",
            new_callable=AsyncMock,
            return_value=[gf_obs],
        ) as mock_gf2,
    ):
        obs2 = await feed.fetch_month("MAD", "LHR", date(2027, 4, 1))
        assert len(obs2) == 1
        assert obs2[0].source == "google_flights"
        mock_gf2.assert_called_once()

    # Verify _verify_with_session keeps Ryanair #1 and falls back to Google Flights #2 when Ryanair returns (False, 0)
    mock_session = AsyncMock()
    quote = FlightQuote(
        origin_iata="MAD",
        destination_iata="LHR",
        destination_city_id="LHR",
        depart_date=date(2027, 4, 10),
        base_price_cents=4300,
        currency="EUR",
        carrier="Iberia",
        flight_number="IB721",
        source="aviasales",
    )

    async def fake_execute_ladder(self_router, sess, op, q):
        pname = self_router.providers[0].name
        if pname == "ryanair":
            return (False, 0, {"reason": "Flight not found on live re-check"})
        return (True, 4300, {"source": "google_flights", "flight_number": "IB721"})

    with patch(
        "app.engine.market.providers.router.ProviderRouter.execute_ladder",
        new=fake_execute_ladder,
    ):
        ok, cents, details = await feed.verify_flight(quote, session=mock_session)
        assert ok is True
        assert cents == 4300
        assert details["source"] == "google_flights"


@pytest.mark.asyncio
async def test_build_flight_feed_live_checker_with_mock_feed():
    dep = date.today() + timedelta(days=20)
    ret = dep + timedelta(days=4)
    out_tick = SimpleNamespace(
        base_price_cents=4300,
        currency="EUR",
        source="aviasales",
        metadata_json={"carrier": "IB", "flight_number": "IB721"},
    )
    ret_tick = SimpleNamespace(
        base_price_cents=4500,
        currency="EUR",
        source="aviasales",
        metadata_json={"carrier": "IB", "flight_number": "IB722"},
    )
    candidate = {
        "orig": "MAD",
        "dest": "LHR",
        "dep_date": dep,
        "ret_date": ret,
        "outbound_tick": out_tick,
        "return_tick": ret_tick,
        "flight_price": 8800,
    }

    fake_feed = SimpleNamespace(
        verify_flight=AsyncMock(
            side_effect=[
                (True, 4400, {"source": "google_flights"}),
                (True, 4500, {"source": "google_flights"}),
            ]
        ),
        google_flights=SimpleNamespace(verify_round_trip=AsyncMock()),
    )

    verifier = DefaultLiveFareVerifier(
        tolerance=0.05,
        live_checker=build_flight_feed_live_checker(fake_feed),
    )
    verified, landed_cents, details = await verifier.verify(candidate)
    assert verified is True
    assert landed_cents == 8900
    assert details["status"] == "flight_deal_verified"
    assert details["is_bookable"] is True

    # Drift > tolerance reports honest unverified
    fake_feed_drift = SimpleNamespace(
        verify_flight=AsyncMock(
            side_effect=[
                (False, 7000, {"source": "google_flights"}),
                (True, 4500, {"source": "google_flights"}),
            ]
        ),
        google_flights=SimpleNamespace(
            verify_round_trip=AsyncMock(return_value=(False, 11500, {}))
        ),
    )
    verifier_drift = DefaultLiveFareVerifier(
        tolerance=0.05,
        live_checker=build_flight_feed_live_checker(fake_feed_drift),
    )
    verified_d, landed_d, details_d = await verifier_drift.verify(candidate)
    assert verified_d is False
    assert landed_d == 11500
    assert details_d["status"] == "flight_deal_unverified"
    assert "exceeds tolerance" in details_d["reason"]


@pytest.mark.live_integration
@pytest.mark.asyncio
async def test_live_google_flights_one_way_and_verify():
    """Isolated live smoke test hitting ONLY GoogleFlightsProvider."""
    provider = GoogleFlightsProvider(timeout_sec=20.0)
    dep_date = date.today() + timedelta(days=45)

    itineraries = await provider.search_date(
        "MAD", "LHR", dep_date, currency="EUR", bypass_cache=True
    )
    assert len(itineraries) > 0
    cheapest = itineraries[0]
    assert cheapest.price_cents > 0
    assert cheapest.currency == "EUR"
    assert any(it.flight_number for it in itineraries)
    assert any(it.is_best for it in itineraries)
    assert "tfs=" in cheapest.deep_link

    quote = FlightQuote(
        origin_iata="MAD",
        destination_iata="LHR",
        destination_city_id="LHR",
        depart_date=dep_date,
        depart_time=cheapest.depart_time,
        base_price_cents=cheapest.price_cents,
        currency="EUR",
        carrier=cheapest.carrier_code or cheapest.carrier,
        flight_number=cheapest.flight_number,
        source="google_flights",
    )
    verified, live_cents, details = await provider.verify_flight(quote)
    assert verified is True
    assert live_cents > 0
    assert details["source"] == "google_flights"


@pytest.mark.live_integration
@pytest.mark.asyncio
async def test_live_google_flights_americas_and_round_trip():
    """Isolated live smoke test for global one-way and round-trip via GoogleFlightsProvider."""
    provider = GoogleFlightsProvider(timeout_sec=20.0)
    dep_us = date.today() + timedelta(days=50)
    us_itineraries = await provider.search_date(
        "JFK", "LAX", dep_us, currency="USD", bypass_cache=True
    )
    assert len(us_itineraries) > 0
    assert us_itineraries[0].price_cents > 0
    assert us_itineraries[0].currency == "USD"

    dep_rt = date.today() + timedelta(days=50)
    ret_rt = dep_rt + timedelta(days=5)
    rt_itineraries = await provider.search_date(
        "MAD", "LHR", dep_rt, return_date=ret_rt, currency="EUR", bypass_cache=True
    )
    assert len(rt_itineraries) > 0
    rt_ok, rt_cents, rt_details = await provider.verify_round_trip(
        "MAD",
        "LHR",
        dep_rt,
        ret_rt,
        rt_itineraries[0].price_cents,
        currency="EUR",
    )
    assert rt_ok is True
    assert rt_cents > 0
    assert rt_details["match_type"] == "round_trip_cheapest"
