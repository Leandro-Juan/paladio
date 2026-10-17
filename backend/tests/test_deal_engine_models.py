"""
Unit tests for Paladio Deal Engine Models & Constraints (Phase 1).
Verifies schema round-trip, check constraints, deduplication, and price_daily queries.
"""

import hashlib
import uuid
from datetime import date, datetime, timezone

import pytest
from app.db.models import (
    CityModel,
    DealCandidateModel,
    DealEventModel,
    DealWatchAlertModel,
    DestinationAirportModel,
    FeeModel,
    MarketPriceTickModel,
    PriceDailyModel,
    RouteBaselineModel,
    UserModel,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_deal_engine_schema_round_trip(db_session: AsyncSession):
    # 1. Setup prerequisite User and City
    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        email=f"test_{user_id[:8]}@paladio.local",
        username=f"user_{user_id[:8]}",
    )
    db_session.add(user)

    city_id = f"test_city_{uuid.uuid4().hex[:6]}"
    city = CityModel(
        id=city_id,
        name="Testopolis",
        country_code="ES",
        center_lat=40.4168,
        center_lon=-3.7038,
        bbox=[40.3, -3.8, 40.5, -3.6],
        currency="EUR",
    )
    db_session.add(city)
    await db_session.flush()

    # 2. DestinationAirportModel
    dest_airport = DestinationAirportModel(city_id=city_id, iata="XYZ", is_primary=True)
    db_session.add(dest_airport)

    # 3. MarketPriceTickModel
    now = datetime.now(timezone.utc)
    content = b"flight:MAD:XYZ:2026-11-01:2026-11-05:5000:ryanair"
    content_hash = hashlib.sha256(content).digest()
    tick = MarketPriceTickModel(
        id=str(uuid.uuid4()),
        observed_at=now,
        asset_type="flight",
        origin_iata="MAD",
        destination_code=city_id,
        dest_airport_iata="XYZ",
        depart_date=date(2026, 11, 1),
        return_date=date(2026, 11, 5),
        nights=4,
        lead_time_days=16,
        currency="EUR",
        base_price_cents=5000,
        stat="single",
        source="ryanair",
        source_class="cache",
        content_hash=content_hash,
    )
    db_session.add(tick)

    # 4. PriceDailyModel
    daily = PriceDailyModel(
        bucket=now.date(),
        asset_type="flight",
        origin_iata="MAD",
        destination_code=city_id,
        depart_date=date(2026, 11, 1),
        nights=4,
        source_class="cache",
        source="ryanair",
        currency="EUR",
        min_base=5000,
        n_ticks=1,
    )
    db_session.add(daily)

    # 5. RouteBaselineModel
    baseline = RouteBaselineModel(
        asset_type="flight",
        origin_iata="MAD",
        destination_code=city_id,
        depart_month=11,
        lead_bucket="8-21",
        source_class="cache",
        currency="EUR",
        level="full",
        n_rows=10,
        n_obs_days=5,
        n_depart_dates=3,
        q02=4000,
        q05=4200,
        q10=4500,
        q25=5000,
        q50=6000,
        q75=7500,
        window_start=date(2026, 1, 1),
        window_end=date(2026, 11, 1),
    )
    db_session.add(baseline)

    # 6. FeeModel
    fee = FeeModel(
        asset_type="flight",
        source="ryanair",
        destination_code=city_id,
        ratio_p50=1.125,
        n=50,
    )
    db_session.add(fee)

    # 7. DealWatchAlertModel
    alert = DealWatchAlertModel(
        id=str(uuid.uuid4()),
        user_id=user_id,
        origin_iata="MAD",
        destinations=[city_id],
        earliest_date=date(2026, 11, 1),
        latest_date=date(2026, 11, 30),
        min_nights=3,
        max_nights=5,
        travelers=1,
        bags_needed=0,
        max_budget_cents=20000,
        currency="EUR",
        max_package_ratio=0.75,
        is_active=True,
    )

    # 8. DealCandidateModel
    cand_id = str(uuid.uuid4())
    cand = DealCandidateModel(
        id=cand_id,
        idempotency_key=f"cand:{cand_id}",
        asset_type="package",
        origin_iata="MAD",
        destination_code=city_id,
        depart_date=date(2026, 11, 1),
        return_date=date(2026, 11, 5),
        currency="EUR",
        cached_flight_base_cents=5000,
        lodging_estimate_cents=10000,
        est_total_cents=15000,
        est_savings_cents=5000,
        package_ratio=0.65,
        baseline_level_used="full",
        confidence="high",
        detector_version="v3",
        status="candidate",
    )
    db_session.add(alert)
    db_session.add(cand)
    await db_session.flush()

    # 9. DealEventModel
    event = DealEventModel(
        id=str(uuid.uuid4()),
        candidate_id=cand_id,
        alert_id=alert.id,
        user_id=user_id,
        status="pending",
        package_json={"total": 15000},
    )
    db_session.add(event)
    await db_session.flush()

    # Query back to verify round-trip
    res = await db_session.execute(select(DealCandidateModel).filter_by(id=cand_id))
    fetched_cand = res.scalar_one()
    assert fetched_cand.est_total_cents == 15000
    assert fetched_cand.package_ratio == 0.65


@pytest.mark.asyncio
async def test_deal_watch_alerts_check_constraints(db_session: AsyncSession):
    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id, email=f"user_{user_id[:8]}@test.local", username=f"u_{user_id[:8]}"
    )
    db_session.add(user)
    await db_session.flush()

    # 1. Invalid dates: earliest > latest
    bad_dates = DealWatchAlertModel(
        id=str(uuid.uuid4()),
        user_id=user_id,
        origin_iata="MAD",
        destinations=["BCN"],
        earliest_date=date(2026, 12, 10),
        latest_date=date(2026, 12, 1),
        max_budget_cents=10000,
    )
    db_session.add(bad_dates)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 2. Invalid budget: <= 0
    bad_budget = DealWatchAlertModel(
        id=str(uuid.uuid4()),
        user_id=user_id,
        origin_iata="MAD",
        destinations=["BCN"],
        earliest_date=date(2026, 12, 1),
        latest_date=date(2026, 12, 10),
        max_budget_cents=0,
    )
    db_session.add(bad_budget)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_market_price_ticks_deduplication(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    content_hash = hashlib.sha256(b"duplicate_content").digest()

    tick1 = MarketPriceTickModel(
        id=str(uuid.uuid4()),
        observed_at=now,
        asset_type="flight",
        origin_iata="MAD",
        destination_code="FCO",
        depart_date=date(2026, 11, 1),
        return_date=date(2026, 11, 5),
        nights=4,
        lead_time_days=16,
        currency="EUR",
        base_price_cents=4500,
        source="ryanair",
        content_hash=content_hash,
    )
    db_session.add(tick1)
    await db_session.flush()

    # Duplicate content_hash at exact same observed_at must violate unique index
    tick2 = MarketPriceTickModel(
        id=str(uuid.uuid4()),
        observed_at=now,
        asset_type="flight",
        origin_iata="MAD",
        destination_code="FCO",
        depart_date=date(2026, 11, 1),
        return_date=date(2026, 11, 5),
        nights=4,
        lead_time_days=16,
        currency="EUR",
        base_price_cents=4500,
        source="ryanair",
        content_hash=content_hash,
    )
    db_session.add(tick2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()
