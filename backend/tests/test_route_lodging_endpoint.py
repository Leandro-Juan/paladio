"""Tests for the on-demand route lodging endpoint."""

import uuid
from datetime import date, datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    DealWatchAlertModel,
    HotelPropertyModel,
    HotelRateObservationModel,
    UserModel,
)


@pytest.mark.asyncio
async def test_route_lodging_cached_hit(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verifies that authentic cached hotel observations are returned dynamically."""
    route_id = str(uuid.uuid4())
    prop_id = str(uuid.uuid4())
    obs_id = str(uuid.uuid4())
    check_in = date(2026, 11, 20)

    # 1. Create User and Route Alert
    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        email=f"user_{user_id[:8]}@example.com",
        username=f"user_{user_id[:8]}",
        role="traveler",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    alert = DealWatchAlertModel(
        id=route_id,
        user_id=user_id,
        origin_iata="MAD",
        destinations=["FCO"],
        earliest_date=date(2026, 11, 1),
        latest_date=date(2026, 12, 1),
        min_nights=3,
        max_nights=5,
        max_budget_cents=25000,
        currency="EUR",
        is_active=True,
    )
    db_session.add(alert)
    await db_session.flush()

    # 2. Add authentic property and observation
    prop = HotelPropertyModel(
        id=prop_id,
        name="Hotel Quirinale Roma",
        name_norm="hotel quirinale roma",
        destination_code="FCO",
        stars=4,
        latitude=41.901,
        longitude=12.494,
    )
    db_session.add(prop)
    await db_session.flush()

    obs = HotelRateObservationModel(
        id=obs_id,
        property_id=prop_id,
        destination_code="FCO",
        provider="booking",
        scan_run_id=str(uuid.uuid4()),
        check_in=check_in,
        check_out=date(2026, 11, 23),
        nights=3,
        adults=2,
        price_nightly_cents=7200,
        price_total_cents=21600,
        currency="EUR",
        taxes_included=True,
        review_score=8.6,
        review_count=1420,
        deep_link="https://www.booking.com/hotel/it/quirinale.html",
        content_hash=b"12345678901234567890123456789012",
        confidence="high",
        observed_at=datetime.now(timezone.utc),
    )
    db_session.add(obs)
    await db_session.commit()

    # 3. Call endpoint
    res = await async_client.get(
        f"/api/v1/market/routes/{route_id}/lodging?check_in={check_in.isoformat()}&nights=3"
    )
    assert res.status_code == 200
    data = res.json()

    assert data["property_name"] == "Hotel Quirinale Roma"
    assert data["price_per_night_eur"] == 72.0
    assert data["total_lodging_eur"] == 216.0
    assert data["stars"] == 4
    assert data["review_score"] == 8.6
    assert data["review_count"] == 1420
    assert "booking.com" in data["booking_url"]
    assert data["source"] == "booking"


@pytest.mark.asyncio
async def test_route_lodging_not_found_fails_fast(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verifies that if no authentic quotes exist or can be fetched, 404 is returned without hardcoded fallbacks."""
    route_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        email=f"user_{user_id[:8]}@example.com",
        username=f"user_{user_id[:8]}",
        role="traveler",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    alert = DealWatchAlertModel(
        id=route_id,
        user_id=user_id,
        origin_iata="MAD",
        destinations=["XYZ"],  # Non-existent airport code
        earliest_date=date(2026, 11, 1),
        latest_date=date(2026, 12, 1),
        min_nights=3,
        max_nights=5,
        max_budget_cents=25000,
        currency="EUR",
        is_active=True,
    )
    db_session.add(alert)
    await db_session.commit()

    res = await async_client.get(
        f"/api/v1/market/routes/{route_id}/lodging?check_in=2026-11-25&nights=3"
    )
    assert res.status_code == 404
