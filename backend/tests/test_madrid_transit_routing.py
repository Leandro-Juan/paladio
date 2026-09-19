import os
from datetime import date

import httpx
import pytest
from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
from app.schemas.itinerary import TravelConstraints
from app.services.transit_service import get_detailed_transit_leg
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase

pytestmark = [pytest.mark.slow, pytest.mark.live_integration]

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")


def is_valhalla_online() -> bool:
    env_url = os.getenv("VALHALLA_URL")
    if env_url:
        urls = [env_url.rstrip("/")]
    else:
        urls = [
            "http://127.0.0.1:8002",
            "http://localhost:8002",
            "http://valhalla:8002",
        ]
    for url in urls:
        try:
            resp = httpx.get(f"{url}/status", timeout=2.0)
            if resp.status_code == 200:
                return True
        except (httpx.HTTPError, OSError):
            continue
    return False


valhalla_required = pytest.mark.skipif(
    not is_valhalla_online(),
    reason=f"Valhalla server is not reachable at {VALHALLA_URL}",
)


@pytest.fixture
def far_apart_madrid_pois():
    hotel_sol = {
        "id": "madrid-hotel-sol",
        "name": "Hostal Centro Histórico (Puerta del Sol)",
        "city": "Madrid",
        "category": "HOTEL",
        "lat": 40.4168,
        "lon": -3.7038,
        "location": {"latitude": 40.4168, "longitude": -3.7038},
        "cost_eur": 0.0,
        "duration_mins": 60,
        "open_time_mins": 480,
        "close_time_mins": 1380,
    }

    bernabeu = {
        "id": "madrid-bernabeu",
        "name": "Santiago Bernabéu Stadium",
        "city": "Madrid",
        "category": "ATTRACTION",
        "lat": 40.4531,
        "lon": -3.6883,
        "location": {"latitude": 40.4531, "longitude": -3.6883},
        "cost_eur": 25.0,
        "duration_mins": 120,
        "open_time_mins": 570,
        "close_time_mins": 1200,
    }

    atocha = {
        "id": "madrid-atocha",
        "name": "Estación de Atocha / Reina Sofía",
        "city": "Madrid",
        "category": "MUSEUM",
        "lat": 40.4065,
        "lon": -3.6896,
        "location": {"latitude": 40.4065, "longitude": -3.6896},
        "cost_eur": 12.0,
        "duration_mins": 90,
        "open_time_mins": 600,
        "close_time_mins": 1260,
    }

    feria_madrid = {
        "id": "madrid-feria",
        "name": "Feria de Madrid (IFEMA)",
        "city": "Madrid",
        "category": "ATTRACTION",
        "lat": 40.46328,
        "lon": -3.61664,
        "location": {"latitude": 40.46328, "longitude": -3.61664},
        "cost_eur": 15.0,
        "duration_mins": 60,
        "open_time_mins": 600,
        "close_time_mins": 1260,
    }

    mercado_san_miguel = {
        "id": "madrid-san-miguel",
        "name": "Mercado de San Miguel",
        "city": "Madrid",
        "category": "RESTAURANT",
        "lat": 40.4154,
        "lon": -3.7090,
        "location": {"latitude": 40.4154, "longitude": -3.7090},
        "cost_eur": 30.0,
        "duration_mins": 60,
        "open_time_mins": 600,
        "close_time_mins": 1380,
    }

    return [hotel_sol, bernabeu, atocha, feria_madrid, mercado_san_miguel]


@pytest.mark.asyncio
@valhalla_required
async def test_get_detailed_transit_leg_madrid_metro(far_apart_madrid_pois):
    sol = far_apart_madrid_pois[0]
    bernabeu = far_apart_madrid_pois[1]

    leg = await get_detailed_transit_leg(sol, bernabeu, "2026-09-15T09:00")

    assert leg.mode == "transit"
    assert leg.duration_mins > 0
    assert leg.cost_eur > 0
    assert len(leg.steps) > 0

    transit_steps = [s for s in leg.steps if s.type == "transit"]
    assert len(transit_steps) > 0
    assert any(s.transit_line is not None for s in transit_steps)


@pytest.mark.asyncio
@valhalla_required
async def test_optimize_daily_itinerary_madrid_with_transit(far_apart_madrid_pois):
    engine = CppOptimizationAdapter(ml_scorer=None, exchange_rate=0.92)
    use_case = OptimizeDailyItineraryUseCase(engine=engine)

    constraints = TravelConstraints(
        origin_city="Madrid",
        destination_city="Madrid",
        start_date=date(2026, 9, 15),
        end_date=date(2026, 9, 15),
        budget_usd=300.0,
        meals=[],
    )

    itinerary_result = await use_case.execute(
        constraints=constraints,
        daily_pois_data=[far_apart_madrid_pois],
        outbound_flight=None,
        return_flight=None,
    )

    days = itinerary_result.get("days", [])
    assert len(days) == 1

    path = days[0].get("itinerary", {}).get("path", [])
    assert len(path) >= 2

    # Verify that intermediate waypoints have transit directions attached
    has_transit_step = False
    for i in range(1, len(path)):
        wp = path[i]
        transit = wp.get("transit_from_previous")
        if transit:
            has_transit_step = True
            assert "duration_mins" in transit
            assert "mode" in transit
            assert "steps" in transit
            assert len(transit["steps"]) > 0

    assert has_transit_step, "No transit directions found in optimized itinerary path!"
