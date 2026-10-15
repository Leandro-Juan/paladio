import uuid
import pytest
from httpx import AsyncClient

from app.services.trip_reoptimization_service import TripReoptimizationService


@pytest.mark.asyncio
async def test_trip_reoptimization_service_direct():
    city = "Madrid"
    sample_itinerary = {
        "city": city,
        "days": [
            {
                "day": 1,
                "date": "2026-11-01",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "id": "p_retiro",
                                "name": "Parque del Retiro",
                                "category": "PARK",
                                "location": {"latitude": 40.4153, "longitude": -3.6844},
                                "duration_mins": 60,
                                "cost_eur": 0.0,
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:00",
                        },
                        {
                            "poi": {
                                "id": "p_prado",
                                "name": "Museo del Prado",
                                "category": "ATTRACTION",
                                "location": {"latitude": 40.4138, "longitude": -3.6921},
                                "duration_mins": 90,
                                "cost_eur": 15.0,
                            },
                            "scheduled_start": "10:30",
                            "scheduled_end": "12:00",
                        },
                        {
                            "poi": {
                                "id": "p_reina",
                                "name": "Museo Reina Sofia",
                                "category": "ATTRACTION",
                                "location": {"latitude": 40.4079, "longitude": -3.6946},
                                "duration_mins": 60,
                                "cost_eur": 12.0,
                            },
                            "scheduled_start": "13:00",
                            "scheduled_end": "14:00",
                        },
                    ]
                },
            }
        ],
    }

    reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
        itinerary_data=sample_itinerary,
        destination_city=city,
    )

    assert "days" in reoptimized
    day1_path = reoptimized["days"][0]["itinerary"]["path"]
    assert len(day1_path) == 3

    # Check that sequential times and transit legs are populated
    for stop in day1_path:
        assert "scheduled_start" in stop
        assert "scheduled_end" in stop
        assert ":" in stop["scheduled_start"]
        assert ":" in stop["scheduled_end"]

    assert "transit_from_previous" in day1_path[1]
    assert "transit_from_previous" in day1_path[2]


@pytest.mark.asyncio
async def test_trip_update_and_reoptimize_endpoints(
    async_client: AsyncClient, db_session
):
    uid = uuid.uuid4().hex[:8]
    # Register user
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"reopt_{uid}@paladio.com",
            "username": f"reopt_{uid}",
            "password": "password123!",
        },
    )
    assert reg_res.status_code == 201, reg_res.text
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create trip
    initial_itin = {
        "city": "Madrid",
        "days": [
            {
                "day": 1,
                "date": "2026-11-01",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "id": "p1",
                                "name": "Museo del Prado",
                                "location": {"latitude": 40.4138, "longitude": -3.6921},
                                "duration_mins": 90,
                                "cost_eur": 15.0,
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:30",
                        }
                    ]
                },
            }
        ],
    }
    create_res = await async_client.post(
        "/api/v1/trips/",
        json={
            "destination": "Madrid",
            "start_date": "2026-11-01",
            "end_date": "2026-11-03",
            "itinerary_data": initial_itin,
        },
        headers=headers,
    )
    assert create_res.status_code == 201, create_res.text
    trip_id = create_res.json()["id"]

    # 2. Test PUT /api/v1/trips/{trip_id} (e.g. after user dragged another POI into Day 1)
    updated_itin = {
        "city": "Madrid",
        "days": [
            {
                "day": 1,
                "date": "2026-11-01",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "id": "p1",
                                "name": "Museo del Prado",
                                "location": {"latitude": 40.4138, "longitude": -3.6921},
                                "duration_mins": 90,
                                "cost_eur": 15.0,
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:30",
                        },
                        {
                            "poi": {
                                "id": "p2",
                                "name": "Parque del Retiro",
                                "location": {"latitude": 40.4153, "longitude": -3.6844},
                                "duration_mins": 60,
                                "cost_eur": 0.0,
                            },
                            "scheduled_start": "11:00",
                            "scheduled_end": "12:00",
                        },
                    ]
                },
            }
        ],
    }
    put_res = await async_client.put(
        f"/api/v1/trips/{trip_id}",
        json={"itinerary_data": updated_itin},
        headers=headers,
    )
    assert put_res.status_code == 200, put_res.text
    put_data = put_res.json()
    assert len(put_data["itinerary_data"]["days"][0]["itinerary"]["path"]) == 2

    # 3. Test POST /api/v1/trips/{trip_id}/reoptimize
    reopt_res = await async_client.post(
        f"/api/v1/trips/{trip_id}/reoptimize",
        json={"itinerary_data": updated_itin},
        headers=headers,
    )
    assert reopt_res.status_code == 200, reopt_res.text
    reopt_data = reopt_res.json()
    reopt_path = reopt_data["itinerary_data"]["days"][0]["itinerary"]["path"]
    assert len(reopt_path) == 2
    assert reopt_path[0]["scheduled_start"] is not None
    assert reopt_path[1]["scheduled_start"] is not None
    assert reopt_path[1]["transit_from_previous"] is not None
