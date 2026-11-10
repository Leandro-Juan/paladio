import pytest
import uuid
from datetime import date, timedelta
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.db.models import (
    DealWatchAlertModel,
    DealEventModel,
    DealCandidateModel,
    UserModel,
)
from app.api.market import _format_deal_package_item


@pytest.mark.asyncio
async def test_route_creation_with_participants():
    """Verify route creation persists participants and travelers count correctly with no real monitoring."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        today = date.today()
        participants_data = [
            {"id": "p_org", "name": "Organizer Alice", "is_organizer": True},
            {"id": "p_guest", "name": "Guest Bob", "is_organizer": False},
        ]
        payload = {
            "origin_iata": "MAD",
            "destination_code": "FCO",
            "earliest_date": (today + timedelta(days=14)).isoformat(),
            "latest_date": (today + timedelta(days=60)).isoformat(),
            "min_nights": 3,
            "max_nights": 6,
            "travelers": 2,
            "participants": participants_data,
            "max_budget_eur": 500.0,
        }

        with patch(
            "app.api.market.backfill_route_corpus", new_callable=AsyncMock
        ) as mock_backfill, patch(
            "app.api.market.ingest_flight_ticks", new_callable=AsyncMock
        ) as mock_ingest:
            mock_backfill.return_value = {"ticks_ingested": 12, "status": "ready"}
            mock_ingest.return_value = 6

            create_res = await client.post("/api/market/routes", json=payload)
            assert create_res.status_code == 201
            new_route = create_res.json()
            route_id = new_route["id"]

        try:
            assert new_route["travelers"] == 2
            assert new_route["participants"] is not None
            assert len(new_route["participants"]) == 2
            assert new_route["participants"][0]["name"] == "Organizer Alice"
            assert new_route["participants"][1]["name"] == "Guest Bob"

            # Check route listing includes travelers and participants
            routes_res = await client.get("/api/market/routes")
            assert routes_res.status_code == 200
            routes = routes_res.json()
            found_route = next((r for r in routes if r["id"] == route_id), None)
            assert found_route is not None
            assert found_route["travelers"] == 2
            assert len(found_route["participants"]) == 2

            # Check route calendar responds and uses travelers=2
            cal_res = await client.get(
                f"/api/market/routes/{route_id}/calendar?months=2"
            )
            assert cal_res.status_code == 200
            cal = cal_res.json()
            assert "months" in cal
            assert len(cal["months"]) == 2
        finally:
            # Clean up
            await client.delete(f"/api/market/routes/{route_id}")


@pytest.mark.asyncio
async def test_deal_package_pricing_scaling_for_multiple_travelers(db_session):
    """Verify that flight costs are multiplied by travelers count and hotel is configured for multiple guests."""
    user_id = f"test_user_{uuid.uuid4().hex[:8]}"
    user = UserModel(
        id=user_id,
        email=f"{user_id}@paladio.test",
        username=user_id,
        hashed_password="pw",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    alert_id = f"alert_{uuid.uuid4().hex[:8]}"
    alert = DealWatchAlertModel(
        id=alert_id,
        user_id=user_id,
        origin_iata="MAD",
        destinations=["FCO"],
        earliest_date=date.today() + timedelta(days=10),
        latest_date=date.today() + timedelta(days=40),
        min_nights=3,
        max_nights=5,
        travelers=2,
        participants=[
            {"id": "p1", "name": "Organizer"},
            {"id": "p2", "name": "Partner"},
        ],
        max_budget_cents=60000,
        is_active=True,
    )
    db_session.add(alert)
    await db_session.flush()

    cand_id = str(uuid.uuid4())
    cand = DealCandidateModel(
        id=cand_id,
        idempotency_key=f"deal:test:{cand_id}",
        origin_iata="MAD",
        destination_code="FCO",
        depart_date=date.today() + timedelta(days=10),
        return_date=date.today() + timedelta(days=13),
        currency="EUR",
        cached_flight_base_cents=5000,
        lodging_estimate_cents=21000,
        est_total_cents=43000,
        est_savings_cents=10000,
        package_ratio=0.7,
        baseline_level_used="full",
        status="verified",
    )
    db_session.add(cand)
    await db_session.flush()

    # Base price per person: flight 50 EUR (5000 cents), return flight 60 EUR (6000 cents)
    # Lodging: 70 EUR / night (7000 cents), 3 nights = 210 EUR (21000 cents)
    deal_event_id = f"deal_{uuid.uuid4().hex[:8]}"
    deal_pkg = {
        "origin_iata": "MAD",
        "destination_code": "FCO",
        "origin_name": "Madrid",
        "destination_name": "Rome",
        "depart_date": "2026-11-20",
        "return_date": "2026-11-23",
        "nights": 3,
        "flight": {
            "airline": "Ryanair",
            "flight_number": "FR101",
            "depart_time": "2026-11-20T08:00:00",
            "arrival_time": "2026-11-20T10:30:00",
            "base_price_cents": 5000,
            "landed_price_cents": 5000,
        },
        "return_flight": {
            "airline": "Ryanair",
            "flight_number": "FR102",
            "depart_time": "2026-11-23T18:00:00",
            "arrival_time": "2026-11-23T20:30:00",
            "base_price_cents": 6000,
            "landed_price_cents": 6000,
        },
        "lodging": {
            "property_name": "Roma Boutique Hotel",
            "base_nightly_cents": 7000,
            "landed_total_cents": 21000,
            "quality_score": 88.0,
        },
    }

    event = DealEventModel(
        id=deal_event_id,
        candidate_id=cand_id,
        alert_id=alert_id,
        user_id=user_id,
        status="alerted",
        package_json=deal_pkg,
    )
    db_session.add(event)
    await db_session.commit()

    try:
        formatted = await _format_deal_package_item(db_session, event)
        assert formatted is not None
        assert formatted.travelers == 2
        assert formatted.participants is not None
        assert len(formatted.participants) == 2

        # Flight price must be scaled by 2 travelers
        # Outbound: 50 * 2 = 100 EUR
        assert formatted.flight.base_price_eur == 100.0
        assert formatted.flight.landed_price_eur == 100.0

        # Return flight: 60 * 2 = 120 EUR
        assert formatted.return_flight is not None
        assert formatted.return_flight.base_price_eur == 120.0
        assert formatted.return_flight.landed_price_eur == 120.0

        # Lodging must specify 2 Guests
        assert "2 Guests" in formatted.lodging.property_name
        assert "group_adults=2" in formatted.lodging.booking_url

        # Total landed price = (100 + 120) [flights] + 210 [lodging] = 430 EUR
        assert formatted.total_price_eur == 430.0
    finally:
        await db_session.delete(event)
        await db_session.delete(cand)
        await db_session.delete(alert)
        await db_session.delete(user)
        await db_session.commit()
