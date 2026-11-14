"""
Tests for Unified DealPackageService:
- Verifies 100% dynamic data resolution (flight hours, deep links, hotel properties).
- Verifies fallback to previous day when current day ticks are absent.
- Verifies ranking prioritizing complete flight + hotel packages.
"""

from datetime import date, datetime, timedelta, timezone
import uuid
import pytest
from sqlalchemy import select

from app.db.models import (
    CityModel,
    DealWatchAlertModel,
    DestinationAirportModel,
    HotelPropertyModel,
    HotelRateObservationModel,
    MarketPriceTickModel,
    UserModel,
)
from app.engine.market.deal_package_service import DealPackageService


@pytest.mark.asyncio
async def test_deal_package_service_fallback_to_previous_day(db_session):
    """
    When today's sweep has not run or failed, service must fall back to previous day's ticks
    and correctly surface flight hours and deep links.
    """
    service = DealPackageService()

    # 0. Setup User
    uid = uuid.uuid4().hex[:8]
    user = UserModel(
        id=f"user_{uid}",
        email=f"fallback_{uid}@test.com",
        username=f"fallbackuser_{uid}",
        hashed_password="pw",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    # 1. Setup alert MAD -> OPO
    alert_id = f"alert_{uid}"
    alert = DealWatchAlertModel(
        id=alert_id,
        user_id=user.id,
        origin_iata="MAD",
        destinations=["OPO"],
        earliest_date=date(2026, 12, 1),
        latest_date=date(2026, 12, 20),
        min_nights=2,
        max_nights=4,
        travelers=1,
        max_budget_cents=50000,
        is_active=True,
    )
    db_session.add(alert)

    # 2. Add City & Airport mapping if not present
    city = await db_session.get(CityModel, "OPO")
    if not city:
        city = CityModel(
            id="OPO",
            name="Porto",
            country_code="PT",
            center_lat=41.1579,
            center_lon=-8.6291,
            bbox=[41.1, -8.7, 41.2, -8.5],
            currency="EUR",
        )
        db_session.add(city)
        await db_session.flush()

    stmt_air = select(DestinationAirportModel).where(
        DestinationAirportModel.iata == "OPO"
    )
    airport = (await db_session.execute(stmt_air)).scalar_one_or_none()
    if not airport:
        airport = DestinationAirportModel(iata="OPO", city_id=city.id, is_primary=True)
        db_session.add(airport)
        await db_session.flush()

    # 3. Insert ticks observed YESTERDAY (no ticks today)
    yesterday_dt = datetime.now(timezone.utc) - timedelta(days=1)
    out_tick = MarketPriceTickModel(
        id=f"tick-{uuid.uuid4().hex}",
        asset_type="flight",
        origin_iata="MAD",
        destination_code="OPO",
        depart_date=date(2026, 12, 10),
        base_price_cents=1999,
        source="ryanair",
        source_class="direct",
        source_observed_at=yesterday_dt,
        observed_at=yesterday_dt,
        lead_time_days=28,
        content_hash=b"hash1",
        currency="EUR",
        metadata_json={
            "airline": "Ryanair",
            "flight_number": "FR5432",
            "depart_local": "2026-12-10T14:30:00",
            "arrival_local": "2026-12-10T15:45:00",
            "deep_link": "https://www.ryanair.com/test-outbound",
        },
    )
    ret_tick = MarketPriceTickModel(
        id=f"tick-{uuid.uuid4().hex}",
        asset_type="flight",
        origin_iata="OPO",
        destination_code="MAD",
        depart_date=date(2026, 12, 13),
        base_price_cents=2199,
        source="ryanair",
        source_class="direct",
        source_observed_at=yesterday_dt,
        observed_at=yesterday_dt,
        lead_time_days=31,
        content_hash=b"hash2",
        currency="EUR",
        metadata_json={
            "airline": "Ryanair",
            "flight_number": "FR5433",
            "depart_local": "2026-12-13T10:00:00",
            "arrival_local": "2026-12-13T12:15:00",
            "deep_link": "https://www.ryanair.com/test-inbound",
        },
    )
    db_session.add_all([out_tick, ret_tick])

    # 4. Insert Hotel Property + Rate
    hotel = HotelPropertyModel(
        id=f"hotel_{uid}",
        destination_code="OPO",
        name="Porto Heritage Hotel",
        name_norm="porto heritage hotel",
        stars=4.0,
    )
    db_session.add(hotel)
    await db_session.flush()

    rate = HotelRateObservationModel(
        id=f"rate_{uid}",
        property_id=hotel.id,
        destination_code="OPO",
        provider="booking",
        scan_run_id="test-run",
        check_in=date(2026, 12, 10),
        check_out=date(2026, 12, 13),
        nights=3,
        price_nightly_cents=7500,
        price_total_cents=22500,
        review_score=9.1,
        review_count=350,
        deep_link="https://booking.com/porto-heritage",
        content_hash=b"testhash",
    )
    db_session.add(rate)
    await db_session.commit()

    # 5. Execute get_route_deals
    deals = await service.get_route_deals(
        session=db_session,
        route_id=alert_id,
        limit=5,
    )

    assert len(deals) > 0
    top = deals[0]

    # Verify origin/destination
    assert top["origin_iata"] == "MAD"
    assert top["destination_code"] == "OPO"
    assert top["depart_date"] == "2026-12-10"
    assert top["return_date"] == "2026-12-13"
    assert top["nights"] == 3

    # Verify outbound flight hours and URL
    assert top["flight"]["airline"] == "Ryanair"
    assert "14:30" in top["flight"]["depart_time"]
    assert "15:45" in top["flight"]["arrival_time"]
    assert top["flight"]["booking_url"] == "https://www.ryanair.com/test-outbound"

    # Verify return flight hours and URL
    assert top["return_flight"] is not None
    assert top["return_flight"]["airline"] == "Ryanair"
    assert "10:00" in top["return_flight"]["depart_time"]
    assert "12:15" in top["return_flight"]["arrival_time"]
    assert top["return_flight"]["booking_url"] == "https://www.ryanair.com/test-inbound"

    # Verify hotel attachment
    assert top["lodging"] is not None
    assert top["lodging"]["property_name"] == "Porto Heritage Hotel"
    assert top["lodging"]["nightly_base_eur"] == 75.0
    assert top["lodging"]["stars"] == 4.0
    assert top["lodging"]["review_score"] == 9.1


@pytest.mark.asyncio
async def test_format_deal_event_requires_both_flights(db_session):
    """Deals missing either outbound or return flight must not be returned."""
    from app.db.models import DealEventModel

    service = DealPackageService()
    event_missing_return = DealEventModel(
        id=f"deal_{uuid.uuid4().hex[:8]}",
        candidate_id=f"cand_{uuid.uuid4().hex[:8]}",
        alert_id=f"alert_{uuid.uuid4().hex[:8]}",
        status="alerted",
        package_json={
            "origin_iata": "MAD",
            "destination_code": "FCO",
            "depart_date": "2026-11-24",
            "return_date": "2026-11-27",
            "nights": 3,
            "flight": {"airline": "Aviasales", "base_price_cents": 1000},
        },
    )
    assert await service.format_deal_event(db_session, event_missing_return) is None

    event_missing_outbound = DealEventModel(
        id=f"deal_{uuid.uuid4().hex[:8]}",
        candidate_id=f"cand_{uuid.uuid4().hex[:8]}",
        alert_id=f"alert_{uuid.uuid4().hex[:8]}",
        status="alerted",
        package_json={
            "origin_iata": "MAD",
            "destination_code": "FCO",
            "depart_date": "2026-11-24",
            "return_date": "2026-11-27",
            "nights": 3,
            "return_flight": {"airline": "Aviasales", "base_price_cents": 1000},
        },
    )
    assert await service.format_deal_event(db_session, event_missing_outbound) is None
