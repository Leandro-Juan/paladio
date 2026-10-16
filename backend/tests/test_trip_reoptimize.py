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
    assert reopt_path[1]["transit_from_previous"] is not None


@pytest.mark.asyncio
async def test_trip_reoptimization_service_fixed_anchors():
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
                                "id": "p_airport",
                                "name": "Adolfo Suárez Madrid-Barajas Airport",
                                "category": "AIRPORT",
                                "location": {"latitude": 40.4839, "longitude": -3.5679},
                                "duration_mins": 45,
                                "cost_eur": 0.0,
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "09:45",
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
                                "id": "p_retiro",
                                "name": "Parque del Retiro",
                                "category": "PARK",
                                "location": {"latitude": 40.4153, "longitude": -3.6844},
                                "duration_mins": 60,
                                "cost_eur": 0.0,
                            },
                            "scheduled_start": "13:00",
                            "scheduled_end": "14:00",
                        },
                        {
                            "poi": {
                                "id": "p_hotel",
                                "name": "Gran Hotel Madrid",
                                "category": "HOTEL",
                                "location": {"latitude": 40.4180, "longitude": -3.7030},
                                "duration_mins": 0,
                                "cost_eur": 0.0,
                            },
                            "scheduled_start": "19:00",
                            "scheduled_end": "19:00",
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

    day1_path = reoptimized["days"][0]["itinerary"]["path"]
    assert len(day1_path) == 4
    # First stop MUST be the airport
    assert (
        "Airport" in day1_path[0]["poi"]["name"]
        or day1_path[0]["poi"]["category"] == "AIRPORT"
    )
    # Last stop MUST be the hotel
    assert (
        "Hotel" in day1_path[-1]["poi"]["name"]
        or day1_path[-1]["poi"]["category"] == "HOTEL"
    )


@pytest.mark.asyncio
async def test_trip_reoptimization_service_target_single_day():
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
                                "id": "d1_p1",
                                "name": "Day 1 Stop 1",
                                "location": {"latitude": 40.41, "longitude": -3.70},
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "10:00",
                        },
                        {
                            "poi": {
                                "id": "d1_p2",
                                "name": "Day 1 Stop 2",
                                "location": {"latitude": 40.42, "longitude": -3.71},
                            },
                            "scheduled_start": "10:30",
                            "scheduled_end": "11:30",
                        },
                    ]
                },
            },
            {
                "day": 2,
                "date": "2026-11-02",
                "itinerary": {
                    "path": [
                        {
                            "poi": {
                                "id": "d2_p1",
                                "name": "Hotel Start",
                                "category": "HOTEL",
                                "location": {"latitude": 40.40, "longitude": -3.70},
                            },
                            "scheduled_start": "09:00",
                            "scheduled_end": "09:00",
                        },
                        {
                            "poi": {
                                "id": "d2_p2",
                                "name": "Far Attraction",
                                "category": "ATTRACTION",
                                "location": {"latitude": 40.45, "longitude": -3.68},
                            },
                            "scheduled_start": "10:00",
                            "scheduled_end": "11:00",
                        },
                        {
                            "poi": {
                                "id": "d2_p3",
                                "name": "Near Attraction",
                                "category": "ATTRACTION",
                                "location": {"latitude": 40.41, "longitude": -3.70},
                            },
                            "scheduled_start": "11:30",
                            "scheduled_end": "12:30",
                        },
                        {
                            "poi": {
                                "id": "d2_p4",
                                "name": "Hotel End",
                                "category": "HOTEL",
                                "location": {"latitude": 40.40, "longitude": -3.70},
                            },
                            "scheduled_start": "18:00",
                            "scheduled_end": "18:00",
                        },
                    ]
                },
            },
        ],
    }

    reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
        itinerary_data=sample_itinerary,
        destination_city=city,
        target_day=2,
    )

    # Day 1 must NOT have been modified
    assert (
        reoptimized["days"][0]["itinerary"]["path"]
        == sample_itinerary["days"][0]["itinerary"]["path"]
    )

    # Day 2 must have been re-optimized with all 4 stops
    d2_path = reoptimized["days"][1]["itinerary"]["path"]
    assert len(d2_path) == 4
    assert d2_path[0]["poi"]["name"] == "Hotel Start"
    assert d2_path[-1]["poi"]["name"] == "Hotel End"


@pytest.mark.asyncio
async def test_trip_reoptimization_large_day_21_stops():
    city = "Tokyo"
    # Construct 21 stops: 1 start hotel, 19 attractions around Tokyo, 1 end hotel
    stops = [
        {
            "poi": {
                "id": "h_start",
                "name": "Hotel Gracery Shinjuku",
                "category": "HOTEL",
                "location": {"latitude": 35.6953, "longitude": 139.7022},
                "duration_mins": 0,
            },
            "scheduled_start": "08:30",
            "scheduled_end": "08:30",
        }
    ]

    for i in range(1, 20):
        # Semi-random distribution across Tokyo
        lat = 35.65 + (i * 0.005)
        lng = 139.68 + (i * 0.006)
        stops.append(
            {
                "poi": {
                    "id": f"attraction_{i}",
                    "name": f"Tokyo POI {i}",
                    "category": "ATTRACTION",
                    "location": {"latitude": lat, "longitude": lng},
                    "duration_mins": 45,
                },
                "scheduled_start": f"{9 + (i // 2):02d}:{30 if (i % 2) else 0:02d}",
                "scheduled_end": f"{10 + (i // 2):02d}:{15 if (i % 2) else 45:02d}",
            }
        )

    stops.append(
        {
            "poi": {
                "id": "h_end",
                "name": "Hotel Gracery Shinjuku",
                "category": "HOTEL",
                "location": {"latitude": 35.6953, "longitude": 139.7022},
                "duration_mins": 0,
            },
            "scheduled_start": "22:00",
            "scheduled_end": "22:00",
        }
    )

    assert len(stops) == 21

    itinerary = {
        "city": city,
        "days": [
            {
                "day": 4,
                "date": "2026-11-04",
                "itinerary": {"path": stops},
            }
        ],
    }

    reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
        itinerary_data=itinerary,
        destination_city=city,
        target_day=4,
    )

    day4_path = reoptimized["days"][0]["itinerary"]["path"]
    # STRICT INVARIANT: Exactly 21 stops, ZERO dropped nodes!
    assert len(day4_path) == 21
    # First stop is start hotel
    assert day4_path[0]["poi"]["name"] == "Hotel Gracery Shinjuku"
    # Last stop is end hotel
    assert day4_path[-1]["poi"]["name"] == "Hotel Gracery Shinjuku"

    # All stops have valid increasing timestamps and transit legs
    for idx in range(1, 21):
        assert "transit_from_previous" in day4_path[idx]
        assert day4_path[idx]["scheduled_start"] is not None
        assert day4_path[idx]["scheduled_end"] is not None


@pytest.mark.asyncio
async def test_trip_reoptimization_intermediate_anchors_and_duplicates():
    city = "Madrid"
    hotel_poi = {
        "id": "h_madrid",
        "name": "Gran Hotel Madrid",
        "category": "HOTEL",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
        "duration_mins": 0,
    }
    near_attraction = {
        "id": "p_near",
        "name": "Puerta del Sol",
        "category": "LANDMARK",
        "location": {"latitude": 40.4170, "longitude": -3.7035},
        "duration_mins": 30,
    }
    far_attraction = {
        "id": "p_far",
        "name": "Santiago Bernabeu",
        "category": "ATTRACTION",
        "location": {"latitude": 40.4530, "longitude": -3.6883},
        "duration_mins": 60,
    }
    midday_airport = {
        "id": "a_midday",
        "name": "Barajas Airport Terminal 4",
        "category": "AIRPORT",
        "location": {"latitude": 40.4900, "longitude": -3.5700},
        "duration_mins": 45,
    }

    # Setup 7 stops with intentional criss-cross in each interval:
    # 0: Hotel (Start anchor, South/Center)
    # 1: Far Attraction (North)
    # 2: Near Attraction (South/Center)
    # 3: Midday Airport Anchor (Far North-East, dropped at exact index 3)
    # 4: Near Attraction (duplicate visit in afternoon, South/Center)
    # 5: Far Attraction (duplicate visit in afternoon, North)
    # 6: Hotel (End anchor, South/Center)
    stops = [
        {"poi": hotel_poi, "scheduled_start": "09:00", "scheduled_end": "09:00"},
        {"poi": far_attraction, "scheduled_start": "09:30", "scheduled_end": "10:30"},
        {"poi": near_attraction, "scheduled_start": "11:00", "scheduled_end": "11:30"},
        {"poi": midday_airport, "scheduled_start": "12:00", "scheduled_end": "12:45"},
        {"poi": near_attraction, "scheduled_start": "13:30", "scheduled_end": "14:00"},
        {"poi": far_attraction, "scheduled_start": "14:30", "scheduled_end": "15:30"},
        {"poi": hotel_poi, "scheduled_start": "18:00", "scheduled_end": "18:00"},
    ]

    itinerary = {
        "city": city,
        "days": [
            {
                "day": 1,
                "date": "2026-11-01",
                "itinerary": {"path": stops},
            }
        ],
    }

    reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
        itinerary_data=itinerary,
        destination_city=city,
        target_day=1,
    )

    day1_path = reoptimized["days"][0]["itinerary"]["path"]
    assert len(day1_path) == 7

    # STRICT INVARIANT: Hotel & Airport are anchored at exact index 0, index 3, and index 6!
    assert day1_path[0]["poi"]["name"] == "Gran Hotel Madrid"
    assert day1_path[3]["poi"]["name"] == "Barajas Airport Terminal 4"
    assert day1_path[6]["poi"]["name"] == "Gran Hotel Madrid"

    # In Interval 1 (Hotel -> Airport): Puerta del Sol must come before Santiago Bernabeu
    assert day1_path[1]["poi"]["name"] == "Puerta del Sol"
    assert day1_path[2]["poi"]["name"] == "Santiago Bernabeu"

    # In Interval 2 (Airport -> Hotel): Santiago Bernabeu must come before Puerta del Sol
    assert day1_path[4]["poi"]["name"] == "Santiago Bernabeu"
    assert day1_path[5]["poi"]["name"] == "Puerta del Sol"


@pytest.mark.asyncio
async def test_trip_reoptimization_custom_poi_locked():
    """Verifies that a custom regular POI marked with locked: True stays at its exact index."""
    city = "Madrid"
    p1 = {
        "id": "p1",
        "name": "Prado Museum",
        "category": "ATTRACTION",
        "location": {"latitude": 40.4138, "longitude": -3.6921},
    }
    p2_locked = {
        "id": "p2_locked",
        "name": "Specific Locked Lunch Reservation",
        "category": "RESTAURANT",
        "location": {"latitude": 40.4530, "longitude": -3.6883},
    }
    p3 = {
        "id": "p3",
        "name": "Retiro Park",
        "category": "PARK",
        "location": {"latitude": 40.4153, "longitude": -3.6844},
    }
    hotel_start = {
        "id": "h_s",
        "name": "Hotel Start",
        "category": "HOTEL",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
    }
    hotel_end = {
        "id": "h_e",
        "name": "Hotel End",
        "category": "HOTEL",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
    }

    stops = [
        {"poi": hotel_start, "scheduled_start": "09:00", "scheduled_end": "09:00"},
        {"poi": p1, "scheduled_start": "10:00", "scheduled_end": "11:00"},
        {
            "poi": p2_locked,
            "locked": True,
            "scheduled_start": "13:00",
            "scheduled_end": "14:00",
        },
        {"poi": p3, "scheduled_start": "15:00", "scheduled_end": "16:00"},
        {"poi": hotel_end, "scheduled_start": "18:00", "scheduled_end": "18:00"},
    ]

    itinerary = {
        "city": city,
        "days": [{"day": 1, "date": "2026-11-01", "itinerary": {"path": stops}}],
    }

    reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
        itinerary_data=itinerary,
        destination_city=city,
        target_day=1,
    )

    day1_path = reoptimized["days"][0]["itinerary"]["path"]
    assert len(day1_path) == 5
    # Index 2 MUST remain the locked lunch reservation
    assert day1_path[2]["poi"]["name"] == "Specific Locked Lunch Reservation"
    assert day1_path[2]["locked"] is True


@pytest.mark.asyncio
async def test_trip_reoptimization_unlocked_hotel():
    """Verifies that an explicitly unlocked hotel (locked: False) is re-routed as an elastic stop."""
    city = "Madrid"
    hotel_start = {
        "id": "h_s",
        "name": "Hotel Start",
        "category": "HOTEL",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
    }
    hotel_midday_unlocked = {
        "id": "h_mid",
        "name": "Midday Hotel Luggage Drop",
        "category": "HOTEL",
        "location": {"latitude": 40.4170, "longitude": -3.7035},
    }
    far_attraction = {
        "id": "p_far",
        "name": "Santiago Bernabeu",
        "category": "ATTRACTION",
        "location": {"latitude": 40.4530, "longitude": -3.6883},
    }
    airport_end = {
        "id": "a_end",
        "name": "Barajas Airport Terminal 4",
        "category": "AIRPORT",
        "location": {"latitude": 40.4900, "longitude": -3.5700},
    }

    # Setup: Start Hotel -> Far Bernabeu -> Midday Hotel (unlocked) -> Airport
    # Since Midday Hotel is near Hotel Start and Bernabeu is far North towards Airport:
    # Monotonic order South -> North is Hotel Start -> Midday Hotel -> Bernabeu -> Airport.
    stops = [
        {"poi": hotel_start, "scheduled_start": "09:00", "scheduled_end": "09:00"},
        {"poi": far_attraction, "scheduled_start": "09:30", "scheduled_end": "10:30"},
        {
            "poi": hotel_midday_unlocked,
            "locked": False,
            "scheduled_start": "11:00",
            "scheduled_end": "11:30",
        },
        {"poi": airport_end, "scheduled_start": "13:00", "scheduled_end": "13:00"},
    ]

    itinerary = {
        "city": city,
        "days": [{"day": 1, "date": "2026-11-01", "itinerary": {"path": stops}}],
    }

    reoptimized = await TripReoptimizationService.reoptimize_trip_itinerary(
        itinerary_data=itinerary,
        destination_city=city,
        target_day=1,
    )

    day1_path = reoptimized["days"][0]["itinerary"]["path"]
    assert len(day1_path) == 4
    # Because Midday Hotel was unlocked (locked: False), the solver was free to reorder it
    # to index 1 (before Bernabeu) rather than keeping it at index 2!
    assert day1_path[1]["poi"]["name"] == "Midday Hotel Luggage Drop"
    assert day1_path[2]["poi"]["name"] == "Santiago Bernabeu"
