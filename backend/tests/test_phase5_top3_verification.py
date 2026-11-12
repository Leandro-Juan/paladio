"""
Tests for PLAN.md Phase 5:
- P5.1 Candidates ranked flight-only against baseline, diversity capped, top 3 per user per day
- P5.2 LiveFareVerifier (verified vs unverifiable; unverified is never bookable)
- P5.3 Feasibility gate returns 'unknown' when times are NULL; drops dead-window arrivals
- P5.4 Real hotels only for verified candidates; cleanly downgrades to flight-only if unavailable
- P5.5 Landed cost & quality gate on real hotel data
- P5.6 Itinerary gate uses real POIs or reports skipped
- P5.7 Deal states: flight_deal_unverified, flight_deal_verified, package_deal (Gate: no unverified bookable deals)
"""

import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.db.session import async_session
from app.db.models import (
    DealCandidateModel,
    DealWatchAlertModel,
    MarketPriceTickModel,
    RouteBaselineModel,
    UserModel,
)
from app.engine.market.config import config
from app.engine.market.detector import run_deal_detection_scan
from app.engine.market.providers.base import NoDataError
from app.engine.market.verifier import DefaultLiveFareVerifier
from sqlalchemy import select, delete


async def _setup_route_baseline(
    session, orig: str, dest: str, today: date, q50: int = 20000
):
    await session.execute(
        delete(RouteBaselineModel).where(
            RouteBaselineModel.origin_iata == orig,
            RouteBaselineModel.destination_code == dest,
        )
    )
    await session.execute(
        delete(MarketPriceTickModel).where(
            MarketPriceTickModel.origin_iata == orig,
            MarketPriceTickModel.destination_code == dest,
        )
    )
    b = RouteBaselineModel(
        asset_type="flight",
        origin_iata=orig,
        destination_code=dest,
        depart_month=0,
        lead_bucket="all",
        source_class="calendar",
        currency="EUR",
        level="drop_month",
        n_rows=250,
        n_obs_days=30,
        n_depart_dates=20,
        q02=int(q50 * 0.5),
        q05=int(q50 * 0.6),
        q10=int(q50 * 0.7),
        q25=int(q50 * 0.8),
        q50=q50,
        q75=int(q50 * 1.2),
        q90=int(q50 * 1.5),
        confidence="established",
        window_start=today - timedelta(days=180),
        window_end=today,
    )
    session.add(b)
    await session.commit()


@pytest.mark.asyncio
async def test_phase5_unverified_deal_is_never_bookable():
    """Gate test: no deal can reach user as bookable without live verification."""
    async with async_session() as session:
        today = date.today()
        user_id = f"user_unverified_{uuid.uuid4().hex[:6]}"
        user = UserModel(
            id=user_id,
            email=f"{user_id}@example.com",
            username=user_id,
            hashed_password="pw",
        )
        await session.merge(user)
        await session.commit()

        await _setup_route_baseline(session, "MAD", "FCO", today, q50=20000)

        dep_date = today + timedelta(days=25)
        ret_date = today + timedelta(days=29)

        # Candidate flight ticks: outbound 15 EUR (ratio 0.075 against 200 EUR baseline)
        h = hashlib.sha256(f"unver_{uuid.uuid4().hex}".encode()).digest()
        ft = MarketPriceTickModel(
            id=str(uuid.uuid4()),
            observed_at=datetime.now(timezone.utc),
            asset_type="flight",
            origin_iata="MAD",
            destination_code="FCO",
            depart_date=dep_date,
            return_date=ret_date,
            nights=4,
            lead_time_days=25,
            base_price_cents=1500,
            currency="EUR",
            source="aviasales",
            source_class="calendar",
            content_hash=h,
        )
        session.add(ft)

        alert = DealWatchAlertModel(
            id=f"alert_{user_id}",
            user_id=user_id,
            origin_iata="MAD",
            destinations=["FCO"],
            earliest_date=today + timedelta(days=20),
            latest_date=today + timedelta(days=40),
            min_nights=3,
            max_nights=5,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        session.add(alert)
        await session.commit()

        # Run detector with default unconfigured verifier (no partner key)
        verifier = DefaultLiveFareVerifier()
        deals = await run_deal_detection_scan(session=session, verifier=verifier)

        # Filter strictly for this user's deals
        user_deals = [
            d
            for d in deals
            if d.get("user_id") == user_id and d["destination_code"] == "FCO"
        ]
        assert len(user_deals) >= 1
        deal = user_deals[0]

        # Strictly unverified and NOT bookable
        assert deal["deal_status"] == "flight_deal_unverified"
        assert deal["is_bookable"] is False
        assert "cached data" in deal["explanation"]
        assert deal["lodging"] is None  # Hotels never queried for unverified deals

        # Check DB candidate model
        cand_stmt = select(DealCandidateModel).filter(
            DealCandidateModel.destination_code == "FCO",
            DealCandidateModel.depart_date == dep_date,
        )
        cand_row = (await session.execute(cand_stmt)).scalars().first()
        assert cand_row is not None
        assert cand_row.status == "flight_deal_unverified"
        assert cand_row.verified_at is None
        assert cand_row.verification_json["is_bookable"] is False


@pytest.mark.asyncio
async def test_phase5_live_verification_within_tolerance_is_bookable():
    """A verified flight deal is marked flight_deal_verified and is_bookable=True."""
    async with async_session() as session:
        today = date.today()
        user_id = f"user_ver_{uuid.uuid4().hex[:6]}"
        user = UserModel(
            id=user_id,
            email=f"{user_id}@example.com",
            username=user_id,
            hashed_password="pw",
        )
        await session.merge(user)
        await session.commit()

        await _setup_route_baseline(session, "MAD", "FCO", today, q50=20000)

        dep_date = today + timedelta(days=15)
        ret_date = today + timedelta(days=19)

        h = hashlib.sha256(f"ver_{uuid.uuid4().hex}".encode()).digest()
        ft = MarketPriceTickModel(
            id=str(uuid.uuid4()),
            observed_at=datetime.now(timezone.utc),
            asset_type="flight",
            origin_iata="MAD",
            destination_code="FCO",
            depart_date=dep_date,
            return_date=ret_date,
            nights=4,
            lead_time_days=15,
            base_price_cents=1500,
            currency="EUR",
            source="aviasales",
            source_class="calendar",
            content_hash=h,
        )
        session.add(ft)

        alert = DealWatchAlertModel(
            id=f"alert_{user_id}",
            user_id=user_id,
            origin_iata="MAD",
            destinations=["FCO"],
            earliest_date=today + timedelta(days=10),
            latest_date=today + timedelta(days=30),
            min_nights=3,
            max_nights=5,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        session.add(alert)
        await session.commit()

        # Live checker returns price 1550 cents (drift +3.3%, within 5% tolerance)
        mock_live_checker = AsyncMock(return_value=(True, 1550))
        verifier = DefaultLiveFareVerifier(
            tolerance=0.05, live_checker=mock_live_checker
        )

        # Mock lodging feed returning NoDataError -> cleanly downgrades to flight-only
        mock_lodging_feed = AsyncMock()
        mock_lodging_feed.fetch_destination_summary.side_effect = NoDataError(
            "No lodging available"
        )

        mock_itinerary_gate = AsyncMock()
        mock_gate_res = MagicMock()
        mock_gate_res.gates_passed = True
        mock_gate_res.realism = 8.8
        mock_gate_res.details = {}
        mock_itinerary_gate.evaluate.return_value = mock_gate_res

        mock_lodging_scorer = MagicMock()
        mock_lodging_scorer.score.return_value = [85.0]

        deals = await run_deal_detection_scan(
            session=session,
            verifier=verifier,
            lodging_feed=mock_lodging_feed,
            lodging_scorer=mock_lodging_scorer,
            itinerary_gate=mock_itinerary_gate,
        )

        user_deals = [
            d
            for d in deals
            if d.get("user_id") == user_id and d["destination_code"] == "FCO"
        ]
        assert len(user_deals) >= 1
        deal = user_deals[0]

        assert deal["deal_status"] == "flight_deal_verified"
        assert deal["is_bookable"] is True
        assert deal["lodging"] is None
        assert deal["verification"]["verified"] is True
        assert deal["flight"]["landed_price_cents"] == 1550


@pytest.mark.asyncio
async def test_phase5_feasibility_gate_unknown_when_times_null_and_dead_window_drop():
    """P5.3: Feasibility returns unknown when flight times are null; drops dead-window arrivals."""
    async with async_session() as session:
        today = date.today()
        user_id = f"user_feas_{uuid.uuid4().hex[:6]}"
        user = UserModel(
            id=user_id,
            email=f"{user_id}@example.com",
            username=user_id,
            hashed_password="pw",
        )
        await session.merge(user)
        await session.commit()

        await _setup_route_baseline(session, "MAD", "FCO", today, q50=20000)

        dep_date = today + timedelta(days=22)
        ret_date = today + timedelta(days=26)

        # 1. Tick with NULL times -> feasibility is 'unknown'
        h1 = hashlib.sha256(f"feas_null_{uuid.uuid4().hex}".encode()).digest()
        ft1 = MarketPriceTickModel(
            id=str(uuid.uuid4()),
            observed_at=datetime.now(timezone.utc),
            asset_type="flight",
            origin_iata="MAD",
            destination_code="FCO",
            depart_date=dep_date,
            return_date=ret_date,
            nights=4,
            lead_time_days=22,
            base_price_cents=1500,
            currency="EUR",
            source="aviasales",
            source_class="calendar",
            content_hash=h1,
            metadata_json=None,  # No flight times
        )
        session.add(ft1)

        # 2. Tick with arrival at 03:00 (Dead window 00:00-05:00) -> dropped by feasibility gate
        dep_date_dead = today + timedelta(days=23)
        ret_date_dead = today + timedelta(days=27)
        h2 = hashlib.sha256(f"feas_dead_{uuid.uuid4().hex}".encode()).digest()
        ft2 = MarketPriceTickModel(
            id=str(uuid.uuid4()),
            observed_at=datetime.now(timezone.utc),
            asset_type="flight",
            origin_iata="MAD",
            destination_code="FCO",
            depart_date=dep_date_dead,
            return_date=ret_date_dead,
            nights=4,
            lead_time_days=23,
            base_price_cents=1200,  # Cheaper, would rank first
            currency="EUR",
            source="aviasales",
            source_class="calendar",
            content_hash=h2,
            metadata_json={
                "depart_local": f"{dep_date_dead.isoformat()}T01:00:00",
                "arrival_local": f"{dep_date_dead.isoformat()}T03:30:00",  # 03:30 is in dead window!
            },
        )
        session.add(ft2)

        alert = DealWatchAlertModel(
            id=f"alert_{user_id}",
            user_id=user_id,
            origin_iata="MAD",
            destinations=["FCO"],
            earliest_date=today + timedelta(days=20),
            latest_date=today + timedelta(days=30),
            min_nights=3,
            max_nights=5,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        session.add(alert)
        await session.commit()

        mock_live_checker = AsyncMock(return_value=(True, 1500))
        verifier = DefaultLiveFareVerifier(live_checker=mock_live_checker)

        deals = await run_deal_detection_scan(session=session, verifier=verifier)

        # The 03:30 arrival must be dropped!
        user_deals = [
            d
            for d in deals
            if d.get("user_id") == user_id and d["destination_code"] == "FCO"
        ]
        assert len(user_deals) == 1
        assert user_deals[0]["depart_date"] == dep_date.isoformat()
        assert user_deals[0]["feasibility"] == "unknown"


@pytest.mark.asyncio
async def test_phase5_top_n_selection_and_diversity_capping():
    """P5.1: Selects top MARKET_DAILY_TOP_N (3) per user, capping per destination."""
    async with async_session() as session:
        today = date.today()
        user_id = f"user_topn_{uuid.uuid4().hex[:6]}"
        user = UserModel(
            id=user_id,
            email=f"{user_id}@example.com",
            username=user_id,
            hashed_password="pw",
        )
        await session.merge(user)
        await session.commit()

        # Baseline for 3 destinations: FCO, LIS, OPO
        for dest in ["FCO", "LIS", "OPO"]:
            await _setup_route_baseline(session, "MAD", dest, today, q50=20000)

        # Create 4 candidate ticks for FCO (diversity should cap at MAX_PER_ROUTE_PER_SCAN = 2)
        # Create 2 candidate ticks for LIS
        # Create 2 candidate ticks for OPO
        for idx in range(4):
            d_date = today + timedelta(days=10 + idx)
            session.add(
                MarketPriceTickModel(
                    id=str(uuid.uuid4()),
                    observed_at=datetime.now(timezone.utc),
                    asset_type="flight",
                    origin_iata="MAD",
                    destination_code="FCO",
                    depart_date=d_date,
                    return_date=d_date + timedelta(days=3),
                    nights=3,
                    lead_time_days=10 + idx,
                    base_price_cents=1000 + idx * 100,
                    currency="EUR",
                    source="aviasales",
                    source_class="calendar",
                    content_hash=hashlib.sha256(
                        f"fco_{idx}_{uuid.uuid4()}".encode()
                    ).digest(),
                )
            )

        for idx in range(2):
            d_date = today + timedelta(days=10 + idx)
            session.add(
                MarketPriceTickModel(
                    id=str(uuid.uuid4()),
                    observed_at=datetime.now(timezone.utc),
                    asset_type="flight",
                    origin_iata="MAD",
                    destination_code="LIS",
                    depart_date=d_date,
                    return_date=d_date + timedelta(days=3),
                    nights=3,
                    lead_time_days=10 + idx,
                    base_price_cents=2000 + idx * 100,
                    currency="EUR",
                    source="aviasales",
                    source_class="calendar",
                    content_hash=hashlib.sha256(
                        f"lis_{idx}_{uuid.uuid4()}".encode()
                    ).digest(),
                )
            )

        alert = DealWatchAlertModel(
            id=f"alert_topn_{user_id}",
            user_id=user_id,
            origin_iata="MAD",
            destinations=["FCO", "LIS", "OPO"],
            earliest_date=today + timedelta(days=5),
            latest_date=today + timedelta(days=20),
            min_nights=2,
            max_nights=4,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        session.add(alert)
        await session.commit()

        deals = await run_deal_detection_scan(session=session)

        user_deals = [d for d in deals if d.get("user_id") == user_id]
        # Must be capped at MARKET_DAILY_TOP_N (3) total for this user
        assert len(user_deals) <= config.MARKET_DAILY_TOP_N
        # FCO must not exceed MAX_PER_ROUTE_PER_SCAN (2)
        fco_count = sum(1 for d in user_deals if d["destination_code"] == "FCO")
        assert fco_count <= config.MAX_PER_ROUTE_PER_SCAN


@pytest.mark.asyncio
async def test_phase5_hotel_attached_when_verified_and_passes_gates():
    """P5.4-P5.6: Verified flight with authentic high-quality hotel becomes package_deal."""
    async with async_session() as session:
        today = date.today()
        user_id = f"user_pkg_{uuid.uuid4().hex[:6]}"
        user = UserModel(
            id=user_id,
            email=f"{user_id}@example.com",
            username=user_id,
            hashed_password="pw",
        )
        await session.merge(user)
        await session.commit()

        await _setup_route_baseline(session, "MAD", "FCO", today, q50=20000)

        dep_date = today + timedelta(days=15)
        ret_date = today + timedelta(days=19)

        h = hashlib.sha256(f"pkg_{uuid.uuid4().hex}".encode()).digest()
        ft = MarketPriceTickModel(
            id=str(uuid.uuid4()),
            observed_at=datetime.now(timezone.utc),
            asset_type="flight",
            origin_iata="MAD",
            destination_code="FCO",
            depart_date=dep_date,
            return_date=ret_date,
            nights=4,
            lead_time_days=15,
            base_price_cents=1500,
            currency="EUR",
            source="aviasales",
            source_class="calendar",
            content_hash=h,
        )
        session.add(ft)

        alert = DealWatchAlertModel(
            id=f"alert_pkg_{user_id}",
            user_id=user_id,
            origin_iata="MAD",
            destinations=["FCO"],
            earliest_date=today + timedelta(days=10),
            latest_date=today + timedelta(days=30),
            min_nights=3,
            max_nights=5,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        session.add(alert)
        await session.commit()

        # Live verifier passes
        verifier = DefaultLiveFareVerifier(
            live_checker=AsyncMock(return_value=(True, 1500))
        )

        # Lodging feed returns real high-quality quote
        from app.engine.market.ports import LodgingQuote

        mock_lodging_quote = LodgingQuote(
            destination_code="FCO",
            check_in=dep_date,
            check_out=ret_date,
            base_price_per_night_cents=4000,
            currency="EUR",
            property_name="Authentic Hotel Roma",
            quality_score=85.0,
            deep_link="https://hotels.example.com/roma",
            source="booking",
        )
        mock_lodging_feed = AsyncMock()
        mock_lodging_feed.fetch_destination_summary.return_value = mock_lodging_quote

        mock_itinerary_gate = AsyncMock()
        mock_gate_res = MagicMock()
        mock_gate_res.gates_passed = True
        mock_gate_res.realism = 8.8
        mock_gate_res.details = {}
        mock_itinerary_gate.evaluate.return_value = mock_gate_res

        mock_lodging_scorer = MagicMock()
        mock_lodging_scorer.score.return_value = [85.0]

        deals = await run_deal_detection_scan(
            session=session,
            verifier=verifier,
            lodging_feed=mock_lodging_feed,
            lodging_scorer=mock_lodging_scorer,
            itinerary_gate=mock_itinerary_gate,
        )

        user_deals = [
            d
            for d in deals
            if d.get("user_id") == user_id and d["destination_code"] == "FCO"
        ]
        assert len(user_deals) == 1
        deal = user_deals[0]

        assert deal["deal_status"] == "package_deal"
        assert deal["is_bookable"] is True
        assert deal["lodging"] is not None
        assert deal["lodging"]["property_name"] == "Authentic Hotel Roma"
        assert deal["lodging"]["quality_score"] == 85.0
        assert deal["total_landed_cents"] == 1500 + (
            4000 * 4
        )  # 17500 cents (175.00 EUR)


@pytest.mark.asyncio
async def test_phase5_downgrade_to_flight_when_hotel_fails_quality():
    """P5.4-P5.5: Verified flight with low-quality hotel cleanly downgrades to flight-only."""
    async with async_session() as session:
        today = date.today()
        user_id = f"user_lowq_{uuid.uuid4().hex[:6]}"
        user = UserModel(
            id=user_id,
            email=f"{user_id}@example.com",
            username=user_id,
            hashed_password="pw",
        )
        await session.merge(user)
        await session.commit()

        await _setup_route_baseline(session, "MAD", "FCO", today, q50=20000)

        dep_date = today + timedelta(days=15)
        ret_date = today + timedelta(days=19)

        h = hashlib.sha256(f"lowq_{uuid.uuid4().hex}".encode()).digest()
        ft = MarketPriceTickModel(
            id=str(uuid.uuid4()),
            observed_at=datetime.now(timezone.utc),
            asset_type="flight",
            origin_iata="MAD",
            destination_code="FCO",
            depart_date=dep_date,
            return_date=ret_date,
            nights=4,
            lead_time_days=15,
            base_price_cents=1500,
            currency="EUR",
            source="aviasales",
            source_class="calendar",
            content_hash=h,
        )
        session.add(ft)

        alert = DealWatchAlertModel(
            id=f"alert_lowq_{user_id}",
            user_id=user_id,
            origin_iata="MAD",
            destinations=["FCO"],
            earliest_date=today + timedelta(days=10),
            latest_date=today + timedelta(days=30),
            min_nights=3,
            max_nights=5,
            travelers=1,
            max_budget_cents=50000,
            is_active=True,
        )
        session.add(alert)
        await session.commit()

        verifier = DefaultLiveFareVerifier(
            live_checker=AsyncMock(return_value=(True, 1500))
        )

        # Lodging with quality score 35.0 (below LODGING_MIN_QUALITY = 70.0)
        from app.engine.market.ports import LodgingQuote

        mock_lodging_quote = LodgingQuote(
            destination_code="FCO",
            check_in=dep_date,
            check_out=ret_date,
            base_price_per_night_cents=2000,
            currency="EUR",
            property_name="Dismal Hostel",
            quality_score=35.0,
            deep_link="https://hotels.example.com/dismal",
            source="booking",
        )
        mock_lodging_feed = AsyncMock()
        mock_lodging_feed.fetch_destination_summary.return_value = mock_lodging_quote

        mock_itinerary_gate = AsyncMock()
        mock_gate_res = MagicMock()
        mock_gate_res.gates_passed = True
        mock_gate_res.realism = 8.8
        mock_gate_res.details = {}
        mock_itinerary_gate.evaluate.return_value = mock_gate_res

        mock_lodging_scorer = MagicMock()
        mock_lodging_scorer.score.return_value = [35.0]

        deals = await run_deal_detection_scan(
            session=session,
            verifier=verifier,
            lodging_feed=mock_lodging_feed,
            lodging_scorer=mock_lodging_scorer,
            itinerary_gate=mock_itinerary_gate,
        )

        user_deals = [
            d
            for d in deals
            if d.get("user_id") == user_id and d["destination_code"] == "FCO"
        ]
        assert len(user_deals) == 1
        deal = user_deals[0]

        # Quality failed: must cleanly downgrade to flight-only verified deal!
        assert deal["deal_status"] == "flight_deal_verified"
        assert deal["is_bookable"] is True
        assert deal["lodging"] is None
        assert deal["total_landed_cents"] == 1500
