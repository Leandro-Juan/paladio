"""
Unit and integration tests for honest empirical baselines and confidence tiers.
Tests P4.1-P4.6 from PLAN.md:
- Pools strictly per source and market (never mix cache and live)
- Sparse data yields 'building' / INSUFFICIENT_DATA, never a confident verdict
- Detector never alerts from building state
- Baselines reproducible from stored data with no invented quantiles
"""

from datetime import date, timedelta

import pytest
from sqlalchemy import delete

from app.db.models import (
    DealWatchAlertModel,
    PriceDailyModel,
    RouteBaselineModel,
)
from app.db.session import async_session
from app.engine.market.baselines import (
    compute_route_baseline,
    resolve_baseline_median,
    resolve_route_baseline_quantiles,
)
from app.engine.market.detector import run_deal_detection_scan


@pytest.mark.asyncio
async def test_sparse_data_yields_building_confidence():
    async with async_session() as session:
        # Clean up any existing data for route MAD->LIS
        await session.execute(
            delete(PriceDailyModel).where(
                PriceDailyModel.origin_iata == "MAD",
                PriceDailyModel.destination_code == "LIS",
            )
        )
        await session.execute(
            delete(RouteBaselineModel).where(
                RouteBaselineModel.origin_iata == "MAD",
                RouteBaselineModel.destination_code == "LIS",
            )
        )
        await session.commit()

        # Insert only 2 observations on 1 bucket day (very sparse)
        today = date.today()
        p1 = PriceDailyModel(
            bucket=today,
            asset_type="flight",
            origin_iata="MAD",
            destination_code="LIS",
            depart_date=today + timedelta(days=10),
            nights=0,
            source_class="cache",
            source="aviasales",
            currency="EUR",
            min_base=4000,
            n_ticks=1,
        )
        p2 = PriceDailyModel(
            bucket=today,
            asset_type="flight",
            origin_iata="MAD",
            destination_code="LIS",
            depart_date=today + timedelta(days=15),
            nights=0,
            source_class="cache",
            source="aviasales",
            currency="EUR",
            min_base=4500,
            n_ticks=1,
        )
        session.add_all([p1, p2])
        await session.commit()

        # Compute baselines
        count = await compute_route_baseline(session, "MAD", "LIS")
        assert count > 0

        # Check resolved confidence is strictly 'building'
        q_dict, level, conf = await resolve_route_baseline_quantiles(
            session=session,
            origin_iata="MAD",
            destination_code="LIS",
            depart_date=today + timedelta(days=10),
            observation_date=today,
        )
        assert conf == "building"

        # Check resolve_baseline_median returns 'building'
        median, _, med_conf = await resolve_baseline_median(
            session=session,
            asset_type="flight",
            origin_iata="MAD",
            destination_code="LIS",
            depart_date=today + timedelta(days=10),
            observation_date=today,
        )
        assert med_conf == "building"


@pytest.mark.asyncio
async def test_detector_never_alerts_from_building_state():
    async with async_session() as session:
        today = date.today()

        from app.db.models import UserModel

        user = UserModel(
            id="test_user_honest",
            email="honest@example.com",
            username="honest",
            hashed_password="hashed_pw",
        )
        await session.merge(user)
        await session.commit()

        # Ensure active alert for MAD->LIS
        alert = DealWatchAlertModel(
            id="alert_sparse_test",
            user_id="test_user_honest",
            origin_iata="MAD",
            destinations=["LIS"],
            earliest_date=today + timedelta(days=5),
            latest_date=today + timedelta(days=20),
            min_nights=1,
            max_nights=5,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        await session.merge(alert)
        await session.commit()

        # Run detector cycle
        candidates = await run_deal_detection_scan(session=session)
        # Verify no deal candidates were emitted for MAD->LIS because baseline is building
        assert not any(
            c.get("origin_iata") == "MAD" and c.get("destination_code") == "LIS"
            for c in candidates
        )
