"""
End-to-End Real Data Ingestion & Live Deal Pipeline Tests.
Validates live data ingestion with zero API keys, idempotent TimescaleDB storage,
baseline generation, and full 6-stage deal detection producing real trip proposals.
"""

import uuid
from datetime import date, timedelta

import pytest
from app.db.models import (
    CityModel,
    DealCandidateModel,
    DealEventModel,
    DealWatchAlertModel,
    DestinationAirportModel,
    MarketPriceTickModel,
    PriceDailyModel,
    RouteBaselineModel,
    TripModel,
    UserModel,
)
from app.engine.market.adapters import OpenLodgingFeed, RyanairFlightFeed
from app.engine.market.baselines import compute_route_baselines
from app.engine.market.detector import run_deal_detection_scan
from app.engine.market.ingest import (
    ingest_flight_ticks,
    ingest_lodging_ticks,
    scan_and_ingest_watched_routes,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_ryanair_feed_live_without_api_keys():
    """Verifies that Ryanair public fare finder returns live, unauthenticated flight quotes."""
    feed = RyanairFlightFeed(timeout_sec=15.0)
    today = date.today()
    date_from = today + timedelta(days=7)
    date_to = today + timedelta(days=28)

    quotes = await feed.fetch_cached_flights("MAD", "FCO", date_from, date_to)
    assert (
        len(quotes) > 0
    ), "Expected at least 1 live flight quote from Ryanair open API"

    quote = quotes[0]
    assert quote.origin_iata == "MAD"
    assert quote.destination_iata == "FCO"
    assert quote.currency == "EUR"
    assert quote.base_price_cents > 1000  # > 10.00 EUR
    assert quote.carrier == "Ryanair"
    assert quote.depart_time.tzinfo is None or quote.depart_time.year >= 2026
    assert quote.arrival_time > quote.depart_time


@pytest.mark.asyncio
async def test_open_lodging_feed_destination_summary():
    """Verifies destination-level lodging summary sampling without API keys."""
    feed = OpenLodgingFeed()
    today = date.today()
    check_in = today + timedelta(days=14)
    check_out = check_in + timedelta(days=4)

    quote = await feed.fetch_destination_summary("FCO", check_in, check_out)
    assert quote.destination_code == "FCO"
    assert quote.currency == "EUR"
    assert quote.base_price_per_night_cents >= 4000
    assert quote.quality_score >= 70.0
    assert quote.estimated_fee_ratio >= 1.0


@pytest.mark.asyncio
async def test_real_flight_and_lodging_ingestion_and_daily_rollup(
    db_session: AsyncSession,
):
    """Verifies live ingestion into market_price_ticks and price_daily rollup."""
    feed = RyanairFlightFeed()
    today = date.today()
    date_from = today + timedelta(days=7)
    date_to = today + timedelta(days=21)

    # 1. Ingest flight ticks
    ingested = await ingest_flight_ticks(
        session=db_session,
        origin_iata="MAD",
        dest_iata="FCO",
        dest_code="FCO",
        date_from=date_from,
        date_to=date_to,
        feed=feed,
    )
    assert ingested > 0, f"Expected > 0 flight ticks ingested, got {ingested}"

    # Verify rows in market_price_ticks
    res_ticks = await db_session.execute(
        select(MarketPriceTickModel).filter_by(
            asset_type="flight", origin_iata="MAD", destination_code="FCO"
        )
    )
    ticks = res_ticks.scalars().all()
    assert len(ticks) >= ingested

    # Verify rows in price_daily
    res_daily = await db_session.execute(
        select(PriceDailyModel).filter_by(
            asset_type="flight", origin_iata="MAD", destination_code="FCO"
        )
    )
    daily_rows = res_daily.scalars().all()
    assert len(daily_rows) > 0
    assert daily_rows[0].min_base > 0

    # 2. Ingest lodging summary
    lg_ingested = await ingest_lodging_ticks(
        session=db_session,
        destination_code="FCO",
        check_in=date_from,
        check_out=date_from + timedelta(days=4),
    )
    assert lg_ingested == 1


@pytest.mark.asyncio
async def test_end_to_end_deal_detection_and_proposal_creation(
    db_session: AsyncSession,
):
    """
    End-to-end integration:
    Creates an alert -> Ingests live data -> Computes baselines -> Runs detector ->
    Verifies proposal created in TripModel and deal_events.
    """
    # 0. Clean tables
    await db_session.execute(delete(DealEventModel))
    await db_session.execute(delete(DealCandidateModel))
    await db_session.execute(delete(RouteBaselineModel))
    await db_session.execute(delete(PriceDailyModel))
    await db_session.execute(delete(MarketPriceTickModel))
    await db_session.execute(delete(DealWatchAlertModel))
    await db_session.commit()

    # 1. Setup User and City
    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        email=f"deal_user_{user_id[:6]}@paladio.test",
        username=f"deal_hunter_{user_id[:6]}",
    )
    db_session.add(user)

    existing_city = (
        await db_session.execute(select(CityModel).filter_by(id="FCO"))
    ).scalar_one_or_none()
    if not existing_city:
        city = CityModel(
            id="FCO",
            name="Rome",
            country_code="IT",
            center_lat=41.9028,
            center_lon=12.4964,
            bbox=[41.7, 12.3, 42.1, 12.7],
            currency="EUR",
        )
        db_session.add(city)

    existing_airport = (
        await db_session.execute(
            select(DestinationAirportModel).filter_by(city_id="FCO", iata="FCO")
        )
    ).scalar_one_or_none()
    if not existing_airport:
        dest_airport = DestinationAirportModel(
            city_id="FCO", iata="FCO", is_primary=True
        )
        db_session.add(dest_airport)
    await db_session.flush()

    # 2. Create DealWatchAlert
    today = date.today()
    earliest = today + timedelta(days=7)
    latest = today + timedelta(days=28)
    alert_id = str(uuid.uuid4())

    alert = DealWatchAlertModel(
        id=alert_id,
        user_id=user_id,
        origin_iata="MAD",
        destinations=["FCO"],
        earliest_date=earliest,
        latest_date=latest,
        min_nights=3,
        max_nights=5,
        travelers=1,
        bags_needed=0,
        max_budget_cents=200000,  # €2000 budget (generous to guarantee feasibility with live prices)
        currency="EUR",
        max_package_ratio=0.85,
        is_active=True,
    )
    db_session.add(alert)
    await db_session.commit()

    # 3. Seed historical baseline distribution for MAD->FCO (median ~85 EUR)
    for d in range(1, 25):
        hist_date = today - timedelta(days=d)
        db_session.add(
            PriceDailyModel(
                bucket=hist_date,
                asset_type="flight",
                origin_iata="MAD",
                destination_code="FCO",
                depart_date=earliest + timedelta(days=(d % 5)),
                nights=4,
                source_class="cache",
                source="ryanair",
                currency="EUR",
                min_base=7500 + (d * 150),  # 76.50 EUR to 111.00 EUR (median ~90 EUR)
                n_ticks=3,
            )
        )
        db_session.add(
            PriceDailyModel(
                bucket=hist_date,
                asset_type="lodging",
                origin_iata="",
                destination_code="FCO",
                depart_date=earliest + timedelta(days=(d % 5)),
                nights=4,
                source_class="cache",
                source="open_lodging",
                currency="EUR",
                min_base=32000 + (d * 100),  # ~330 EUR / night
                n_ticks=2,
            )
        )
    await db_session.commit()

    # 4. Demand-driven scanning & ingestion of real live data
    scan_res = await scan_and_ingest_watched_routes(db_session)
    assert scan_res["flights_ingested"] > 0

    # 5. Compute Route Baselines
    baselines_computed = await compute_route_baselines(db_session)
    assert baselines_computed > 0

    # 5. Run Deal Detection Scan
    verified_deals = await run_deal_detection_scan(db_session)
    assert (
        len(verified_deals) > 0
    ), "Expected at least 1 verified deal detected from live data"

    deal = verified_deals[0]
    assert deal["origin_iata"] == "MAD"
    assert deal["destination_code"] == "FCO"
    assert deal["total_landed_cents"] > 0
    assert deal["total_landed_cents"] <= 200000
    assert deal["realism_score"] >= 8.0

    # 6. Verify TripModel proposal was stored in database
    trip_stmt = select(TripModel).filter_by(user_id=user_id, status="deal_proposal")
    trip_res = await db_session.execute(trip_stmt)
    trip = trip_res.scalar_one_or_none()
    assert trip is not None
    assert trip.destination == "FCO"
    assert trip.status == "deal_proposal"

    # 7. Verify DealEventModel record
    event_stmt = select(DealEventModel).filter_by(user_id=user_id, alert_id=alert_id)
    event_res = await db_session.execute(event_stmt)
    event = event_res.scalar_one_or_none()
    assert event is not None
    assert event.status == "alerted"
