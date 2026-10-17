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

        # 9. Delete route
        del_res = await client.delete(f"/api/market/routes/{route_id}")
        assert del_res.status_code == 204
