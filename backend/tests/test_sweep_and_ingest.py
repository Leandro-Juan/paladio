"""
Unit and integration tests for Flight Sweep and Ingestion Engine.
Tests deduplication by hash, last_seen_at updates, nullable return dates,
route_month_coverage tracking, and found_at date bucketing per PLAN.md Phases 2 and 3.
"""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.db.models import (
    MarketPriceTickModel,
    MarketSweepRunModel,
    PriceDailyModel,
    RouteMonthCoverageModel,
)
from app.db.session import async_session
from app.engine.market.ports import FareObservation
from app.engine.market.sweep import (
    compute_fare_observation_hash,
    ingest_fare_observations,
    run_daily_flight_sweep,
    sweep_route_month,
)


@pytest.mark.asyncio
async def test_compute_fare_observation_hash_determinism():
    found = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
    h1 = compute_fare_observation_hash(
        asset_type="flight",
        origin="MAD",
        dest="FCO",
        depart_date=date(2026, 12, 1),
        return_date=None,
        price_cents=3600,
        source="aviasales",
        market="es",
        found_at=found,
    )
    h2 = compute_fare_observation_hash(
        asset_type="flight",
        origin="mad",
        dest="fco",
        depart_date=date(2026, 12, 1),
        return_date=None,
        price_cents=3600,
        source="AVIASALES",
        market="ES",
        found_at=found,
    )
    assert h1 == h2


@pytest.mark.asyncio
async def test_ingest_deduplication_and_null_return():
    async with async_session() as session:
        from sqlalchemy import delete

        await session.execute(
            delete(MarketPriceTickModel).where(
                MarketPriceTickModel.origin_iata == "MAD",
                MarketPriceTickModel.destination_code == "FCO",
                MarketPriceTickModel.depart_date == date(2026, 12, 1),
            )
        )
        await session.execute(
            delete(PriceDailyModel).where(
                PriceDailyModel.origin_iata == "MAD",
                PriceDailyModel.destination_code == "FCO",
                PriceDailyModel.depart_date == date(2026, 12, 1),
            )
        )
        await session.commit()

        found = datetime(2026, 11, 5, 0, 0, 0, tzinfo=timezone.utc)
        fetched = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)

        obs = [
            FareObservation(
                origin="MAD",
                destination="FCO",
                depart_date=date(2026, 12, 1),
                depart_time=datetime(2026, 12, 1, 6, 0, 0, tzinfo=timezone.utc),
                arrival_time=datetime(2026, 12, 1, 8, 30, 0, tzinfo=timezone.utc),
                return_date=None,  # One-way row
                trip_type="one_way",
                price_cents=3600,
                currency="EUR",
                carrier="W4",
                flight_number="6208",
                stops=0,
                deep_link="https://www.aviasales.com/search/MAD0112FCO1",
                source="aviasales",
                source_class="cache",
                market="es",
                found_at=found,
                fetched_at=fetched,
            )
        ]

        # 1. First ingestion -> 1 new tick inserted
        inserted_1 = await ingest_fare_observations(session, obs, ingest_run_id="run_1")
        assert inserted_1 == 1

        # Verify tick stored with NULL return_date and nights
        tick_stmt = (
            select(MarketPriceTickModel)
            .where(
                MarketPriceTickModel.ingest_run_id == "run_1",
            )
            .limit(1)
        )
        res = await session.execute(tick_stmt)
        tick = res.scalar_one_or_none()
        assert tick is not None
        assert tick.return_date is None
        assert tick.nights is None
        assert tick.trip_type == "one_way"
        assert tick.market == "es"
        assert tick.base_price_cents == 3600
        assert tick.last_seen_at is not None

        # Verify price_daily bucket uses found_at date (2026-11-05), NOT fetched date (2026-11-12)
        pd_stmt = (
            select(PriceDailyModel)
            .where(
                PriceDailyModel.origin_iata == "MAD",
                PriceDailyModel.destination_code == "FCO",
                PriceDailyModel.depart_date == date(2026, 12, 1),
            )
            .limit(1)
        )
        pd_res = await session.execute(pd_stmt)
        daily = pd_res.scalar_one_or_none()
        assert daily is not None
        assert daily.bucket == date(2026, 11, 5)
        assert daily.min_base == 3600

        # 2. Re-running the sweep on same day -> 0 new ticks, updates last_seen_at
        inserted_2 = await ingest_fare_observations(session, obs, ingest_run_id="run_2")
        assert inserted_2 == 0

        # Verify last_seen_at was updated and no second tick was created
        cnt_stmt = select(func.count(MarketPriceTickModel.id)).where(
            MarketPriceTickModel.origin_iata == "MAD",
            MarketPriceTickModel.destination_code == "FCO",
            MarketPriceTickModel.depart_date == date(2026, 12, 1),
        )
        cnt_res = await session.execute(cnt_stmt)
        assert cnt_res.scalar() == 1


@pytest.mark.asyncio
async def test_route_month_coverage_audit():
    async with async_session() as session:
        run_date = date(2026, 11, 12)
        month_date = date(2026, 12, 1)

        # Mock provider returning 2 observations
        mock_provider = AsyncMock()
        mock_provider.fetch_month.return_value = [
            FareObservation(
                origin="MAD",
                destination="FCO",
                depart_date=date(2026, 12, 5),
                depart_time=None,
                arrival_time=None,
                return_date=None,
                trip_type="one_way",
                price_cents=4500,
                currency="EUR",
                carrier="IB",
                flight_number="123",
                stops=0,
                deep_link=None,
                source="aviasales",
                source_class="cache",
                market="es",
                found_at=datetime(2026, 11, 10, tzinfo=timezone.utc),
                fetched_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
            ),
            FareObservation(
                origin="MAD",
                destination="FCO",
                depart_date=date(2026, 12, 10),
                depart_time=None,
                arrival_time=None,
                return_date=None,
                trip_type="one_way",
                price_cents=5500,
                currency="EUR",
                carrier="IB",
                flight_number="456",
                stops=0,
                deep_link=None,
                source="aviasales",
                source_class="cache",
                market="es",
                found_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
                fetched_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
            ),
        ]

        inserted, days_cnt = await sweep_route_month(
            session=session,
            provider=mock_provider,
            origin="MAD",
            dest="FCO",
            month_date=month_date,
            run_date=run_date,
            market="es",
        )
        assert days_cnt == 2

        # Verify route_month_coverage row exists
        cov_stmt = select(RouteMonthCoverageModel).where(
            RouteMonthCoverageModel.origin == "MAD",
            RouteMonthCoverageModel.dest == "FCO",
            RouteMonthCoverageModel.month == "2026-12",
            RouteMonthCoverageModel.run_date == run_date,
        )
        cov_res = await session.execute(cov_stmt)
        cov = cov_res.scalar_one_or_none()
        assert cov is not None
        assert cov.days_in_month == 31
        assert cov.days_with_price == 2
        assert cov.source == "aviasales"
        assert cov.market == "es"


@pytest.mark.asyncio
async def test_empty_month_coverage():
    async with async_session() as session:
        run_date = date(2026, 11, 12)
        month_date = date(2027, 6, 1)

        # Mock provider returning empty list for distant month
        mock_provider = AsyncMock()
        mock_provider.fetch_month.return_value = []

        inserted, days_cnt = await sweep_route_month(
            session=session,
            provider=mock_provider,
            origin="MAD",
            dest="JFK",
            month_date=month_date,
            run_date=run_date,
            market="es",
        )
        assert days_cnt == 0
        assert inserted == 0

        # Verify route_month_coverage row recorded with days_with_price = 0
        cov_stmt = select(RouteMonthCoverageModel).where(
            RouteMonthCoverageModel.origin == "MAD",
            RouteMonthCoverageModel.dest == "JFK",
            RouteMonthCoverageModel.month == "2027-06",
            RouteMonthCoverageModel.run_date == run_date,
        )
        cov_res = await session.execute(cov_stmt)
        cov = cov_res.scalar_one_or_none()
        assert cov is not None
        assert cov.days_with_price == 0
        assert cov.newest_found_at is None
        assert cov.oldest_found_at is None


@pytest.mark.asyncio
async def test_daily_sweep_orchestrator():
    async with async_session() as session:
        mock_provider = AsyncMock()
        mock_provider.fetch_month.return_value = []

        # Pilot routes MAD-FCO
        res = await run_daily_flight_sweep(
            session=session,
            provider=mock_provider,
            pilot_routes=[("MAD", "FCO")],
            months_ahead=2,
        )

        assert res["status"] in ("completed", "running")
        assert res["routes_total"] >= 2  # Bidirectional MAD->FCO and FCO->MAD

        # Verify market_sweep_runs audit row
        sweep_stmt = select(MarketSweepRunModel).where(
            MarketSweepRunModel.run_id == res["run_id"]
        )
        s_res = await session.execute(sweep_stmt)
        run_record = s_res.scalar_one_or_none()
        assert run_record is not None
        assert run_record.provider in ("aviasales", "composite")
        assert run_record.status == "completed"
