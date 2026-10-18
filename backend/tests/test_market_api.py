import pytest
from httpx import AsyncClient, ASGITransport
from datetime import date, timedelta
from app.main import app


@pytest.mark.asyncio
async def test_market_api_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Check summary
        res = await client.get("/api/market/summary")
        assert res.status_code == 200
        summary = res.json()
        assert "monitored_routes" in summary
        assert "deals_detected" in summary
        assert "ticks_scanned_today" in summary

        # 2. List routes
        res = await client.get("/api/market/routes")
        assert res.status_code == 200
        routes = res.json()
        assert isinstance(routes, list)

        # 3. Create route
        today = date.today()
        payload = {
            "origin_iata": "MAD",
            "destination_code": "FCO",
            "earliest_date": (today + timedelta(days=7)).isoformat(),
            "latest_date": (today + timedelta(days=60)).isoformat(),
            "min_nights": 2,
            "max_nights": 5,
            "travelers": 1,
            "max_budget_eur": 120.0,
        }
        create_res = await client.post("/api/market/routes", json=payload)
        assert create_res.status_code == 201
        new_route = create_res.json()
        route_id = new_route["id"]
        assert new_route["origin_iata"] == "MAD"
        assert new_route["destination_code"] == "FCO"

        # 4. Route stats
        stats_res = await client.get(f"/api/market/routes/{route_id}/stats")
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert "total_observations" in stats
        assert "next_scan_minutes" in stats

        # 5. Route history
        hist_res = await client.get(f"/api/market/routes/{route_id}/history?range=30d")
        assert hist_res.status_code == 200
        hist = hist_res.json()
        assert "points" in hist
        assert hist["currency"] == "EUR"

        # 6. Route calendar
        cal_res = await client.get(f"/api/market/routes/{route_id}/calendar?months=3")
        assert cal_res.status_code == 200
        cal = cal_res.json()
        assert "months" in cal
        assert len(cal["months"]) == 3
        assert len(cal["months"][0]["days"]) >= 28

        # 7. Update route
        patch_res = await client.patch(
            f"/api/market/routes/{route_id}", json={"is_active": False}
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["is_active"] is False

        # 8. Route events
        events_res = await client.get(f"/api/market/routes/{route_id}/events")
        assert events_res.status_code == 200
        assert isinstance(events_res.json(), list)

        # 9. Deals list
        deals_res = await client.get("/api/market/deals")
        assert deals_res.status_code == 200
        assert isinstance(deals_res.json(), list)

        # 10. Discard non-existent deal returns 404
        discard_404 = await client.post("/api/market/deals/nonexistent_deal_id/discard")
        assert discard_404.status_code == 404

        # 11. Delete route
        del_res = await client.delete(f"/api/market/routes/{route_id}")
        assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_discard_deal_lifecycle(db_session, async_client):
    import uuid
    from app.db.models import (
        DealEventModel,
        DealCandidateModel,
        UserModel,
        DealWatchAlertModel,
    )

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
        earliest_date=date.today() + timedelta(days=5),
        latest_date=date.today() + timedelta(days=20),
        max_budget_cents=50000,
        is_active=True,
    )
    db_session.add(alert)

    cand_id = str(uuid.uuid4())
    cand = DealCandidateModel(
        id=cand_id,
        idempotency_key=f"deal:test:{cand_id}",
        origin_iata="MAD",
        destination_code="FCO",
        depart_date=date.today() + timedelta(days=7),
        return_date=date.today() + timedelta(days=11),
        currency="EUR",
        cached_flight_base_cents=4500,
        lodging_estimate_cents=20000,
        est_total_cents=24500,
        est_savings_cents=10000,
        package_ratio=0.7,
        baseline_level_used="full",
        status="verified",
    )
    db_session.add(cand)
    await db_session.flush()

    deal_id = f"deal_{uuid.uuid4().hex[:8]}"
    deal = DealEventModel(
        id=deal_id,
        candidate_id=cand_id,
        alert_id=alert_id,
        user_id=user_id,
        status="alerted",
        package_json={
            "origin_iata": "MAD",
            "destination_code": "FCO",
            "origin_name": "Madrid",
            "destination_name": "Rome",
            "depart_date": (date.today() + timedelta(days=7)).isoformat(),
            "return_date": (date.today() + timedelta(days=11)).isoformat(),
            "nights": 4,
            "flight": {
                "airline": "Ryanair",
                "depart_time": "2026-11-18T09:00:00Z",
                "arrival_time": "2026-11-18T11:30:00Z",
                "landed_price_cents": 4500,
            },
            "lodging": {
                "property_name": "Test Hotel",
                "nightly_base_eur": 50.0,
                "landed_total_cents": 20000,
            },
            "total_price_eur": 245.0,
            "savings_eur": 100.0,
            "discount_pct": 30.0,
            "realism_score": 9.0,
        },
    )
    db_session.add(deal)
    await db_session.commit()

    # 1. Verify deal is returned in active deals
    deals_res = await async_client.get("/api/market/deals")
    assert deals_res.status_code == 200
    deal_ids = [d["id"] for d in deals_res.json()]
    assert deal_id in deal_ids

    # 2. Discard deal
    discard_res = await async_client.post(f"/api/market/deals/{deal_id}/discard")
    assert discard_res.status_code == 200
    assert discard_res.json()["status"] == "discarded"
    assert discard_res.json()["deal_id"] == deal_id

    # 3. Verify deal is no longer in active deals list
    deals_after = await async_client.get("/api/market/deals")
    assert deals_after.status_code == 200
    deal_ids_after = [d["id"] for d in deals_after.json()]
    assert deal_id not in deal_ids_after
