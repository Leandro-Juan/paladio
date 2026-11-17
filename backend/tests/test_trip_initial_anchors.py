import pytest
from httpx import AsyncClient
from app.api.trips import _populate_initial_anchors


def test_populate_initial_anchors_multi_day():
    itin_data = {
        "travel_constraints": {
            "destination_city": "Paris",
            "destination_iata": "CDG",
            "hotel": {
                "name": "Hotel Le Marais",
                "lat": 48.8566,
                "lng": 2.3522,
            },
        },
        "days": [
            {"day": 1, "itinerary": {"path": []}},
            {"day": 2, "itinerary": {"path": []}},
            {"day": 3, "itinerary": {"path": []}},
        ],
    }

    res = _populate_initial_anchors(itin_data, "Paris", "2026-12-01", "2026-12-03")
    days = res["days"]
    assert len(days) == 3

    # Day 1: Airport first, Hotel last
    day1_path = days[0]["itinerary"]["path"]
    assert len(day1_path) == 2
    assert day1_path[0]["poi"]["category"] == "AIRPORT"
    assert day1_path[1]["poi"]["category"] == "HOTEL"

    # Day 2: Hotel first, Hotel last
    day2_path = days[1]["itinerary"]["path"]
    assert len(day2_path) == 2
    assert day2_path[0]["poi"]["category"] == "HOTEL"
    assert day2_path[1]["poi"]["category"] == "HOTEL"

    # Day 3: Hotel first, Airport last
    day3_path = days[2]["itinerary"]["path"]
    assert len(day3_path) == 2
    assert day3_path[0]["poi"]["category"] == "HOTEL"
    assert day3_path[1]["poi"]["category"] == "AIRPORT"

    # Trip overall: first is Airport, last is Airport
    assert day1_path[0]["poi"]["category"] == "AIRPORT"
    assert day3_path[-1]["poi"]["category"] == "AIRPORT"


def test_populate_initial_anchors_omit_hotel_when_missing():
    itin_data = {
        "travel_constraints": {
            "destination_city": "Tokyo",
            "destination_iata": "HND",
        },
        "days": [
            {"day": 1, "itinerary": {"path": []}},
            {"day": 2, "itinerary": {"path": []}},
            {"day": 3, "itinerary": {"path": []}},
        ],
    }

    res = _populate_initial_anchors(itin_data, "Tokyo", "2026-12-01", "2026-12-03")
    days = res["days"]
    assert len(days) == 3

    # Day 1: Airport first, no hotel
    day1_path = days[0]["itinerary"]["path"]
    assert len(day1_path) == 1
    assert day1_path[0]["poi"]["category"] == "AIRPORT"

    # Day 2: Omitted
    day2_path = days[1]["itinerary"]["path"]
    assert len(day2_path) == 0

    # Day 3: Airport last, no hotel
    day3_path = days[2]["itinerary"]["path"]
    assert len(day3_path) == 1
    assert day3_path[0]["poi"]["category"] == "AIRPORT"


def test_populate_initial_anchors_single_day():
    itin_data = {
        "travel_constraints": {
            "destination_city": "Madrid",
            "destination_iata": "MAD",
            "hotel": {
                "name": "Madrid Central Stay",
                "lat": 40.4168,
                "lng": -3.7038,
            },
        },
        "days": [
            {"day": 1, "itinerary": {"path": []}},
        ],
    }

    res = _populate_initial_anchors(itin_data, "Madrid", "2026-12-01", "2026-12-01")
    days = res["days"]
    assert len(days) == 1

    day1_path = days[0]["itinerary"]["path"]
    assert len(day1_path) == 3
    assert day1_path[0]["poi"]["category"] == "AIRPORT"
    assert day1_path[1]["poi"]["category"] == "HOTEL"
    assert day1_path[2]["poi"]["category"] == "AIRPORT"


@pytest.mark.asyncio
async def test_create_trip_api_populates_anchors(async_client: AsyncClient):
    payload = {
        "destination": "Paris",
        "start_date": "2026-12-01",
        "end_date": "2026-12-03",
        "itinerary_data": {
            "travel_constraints": {
                "destination_city": "Paris",
                "destination_iata": "CDG",
                "hotel": {
                    "name": "Le Ritz Paris",
                    "lat": 48.8681,
                    "lng": 2.3292,
                },
            },
            "days": [
                {"day": 1, "itinerary": {"path": []}},
                {"day": 2, "itinerary": {"path": []}},
                {"day": 3, "itinerary": {"path": []}},
            ],
        },
    }

    res = await async_client.post("/api/trips/", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    itin_data = data["itinerary_data"]
    days = itin_data["days"]
    assert len(days) == 3

    # Day 1: CDG Airport -> Le Ritz Paris
    assert days[0]["itinerary"]["path"][0]["poi"]["category"] == "AIRPORT"
    assert days[0]["itinerary"]["path"][1]["poi"]["category"] == "HOTEL"

    # Day 2: Le Ritz Paris -> Le Ritz Paris
    assert days[1]["itinerary"]["path"][0]["poi"]["category"] == "HOTEL"
    assert days[1]["itinerary"]["path"][1]["poi"]["category"] == "HOTEL"

    # Day 3: Le Ritz Paris -> CDG Airport
    assert days[2]["itinerary"]["path"][0]["poi"]["category"] == "HOTEL"
    assert days[2]["itinerary"]["path"][1]["poi"]["category"] == "AIRPORT"


def test_populate_initial_anchors_uses_specified_flight_and_hotel_times():
    itin_data = {
        "is_blank_trip": True,
        "travel_constraints": {
            "destination_city": "Paris",
            "destination_iata": "CDG",
            "departure_hour": "10:15",
            "arrival_hour": "19:30",
            "hotel": {
                "name": "Hotel Le Marais",
                "lat": 48.8566,
                "lng": 2.3522,
                "check_in_date": "2026-12-01",
                "check_in_time": "16:00",
                "check_out_date": "2026-12-03",
                "check_out_time": "10:30",
            },
        },
        "days": [
            {"day": 1, "date": "2026-12-01", "itinerary": {"path": []}},
            {"day": 2, "date": "2026-12-02", "itinerary": {"path": []}},
            {"day": 3, "date": "2026-12-03", "itinerary": {"path": []}},
        ],
    }

    res = _populate_initial_anchors(itin_data, "Paris", "2026-12-01", "2026-12-03")
    days = res["days"]
    assert len(days) == 3

    day1_path = days[0]["itinerary"]["path"]
    assert day1_path[0]["poi"]["category"] == "AIRPORT"
    assert day1_path[0]["scheduled_start"] == "10:15"
    assert day1_path[0]["scheduled_end"] == "11:15"
    assert day1_path[-1]["poi"]["category"] == "HOTEL"
    assert day1_path[-1]["scheduled_start"] == "16:00"

    day2_path = days[1]["itinerary"]["path"]
    assert day2_path[0]["poi"]["category"] == "HOTEL"
    assert day2_path[-1]["poi"]["category"] == "HOTEL"

    day3_path = days[2]["itinerary"]["path"]
    assert day3_path[0]["poi"]["category"] == "HOTEL"
    assert day3_path[0]["scheduled_start"] == "10:30"
    assert day3_path[-1]["poi"]["category"] == "AIRPORT"
    assert day3_path[-1]["scheduled_start"] == "17:30"
    assert day3_path[-1]["scheduled_end"] == "19:30"


def test_populate_initial_anchors_blank_trip_without_hotel_creates_hotel_anchors():
    itin_data = {
        "is_blank_trip": True,
        "travel_constraints": {
            "destination_city": "Madrid",
            "destination_iata": "MAD",
            "departure_hour": "08:45",
            "arrival_hour": "21:15",
        },
        "days": [],
    }

    res = _populate_initial_anchors(itin_data, "Madrid", "2026-12-01", "2026-12-03")
    days = res["days"]
    assert len(days) == 3
    assert days[0]["itinerary"]["path"][0]["poi"]["category"] == "AIRPORT"
    assert days[0]["itinerary"]["path"][0]["scheduled_start"] == "08:45"
    assert days[0]["itinerary"]["path"][-1]["poi"]["category"] == "HOTEL"
    assert days[1]["itinerary"]["path"][0]["poi"]["category"] == "HOTEL"
    assert days[1]["itinerary"]["path"][-1]["poi"]["category"] == "HOTEL"
    assert days[2]["itinerary"]["path"][0]["poi"]["category"] == "HOTEL"
    assert days[2]["itinerary"]["path"][-1]["poi"]["category"] == "AIRPORT"
    assert days[2]["itinerary"]["path"][-1]["scheduled_end"] == "21:15"


def test_populate_initial_anchors_single_day_respects_flight_times():
    itin_data = {
        "is_blank_trip": True,
        "travel_constraints": {
            "destination_city": "Madrid",
            "destination_iata": "MAD",
            "departure_hour": "08:00",
            "arrival_hour": "21:00",
            "hotel": {
                "name": "Madrid Central Stay",
                "lat": 40.4168,
                "lng": -3.7038,
                "check_in_time": "14:00",
                "check_out_time": "18:00",
            },
        },
        "days": [{"day": 1, "date": "2026-12-01", "itinerary": {"path": []}}],
    }

    res = _populate_initial_anchors(itin_data, "Madrid", "2026-12-01", "2026-12-01")
    day1_path = res["days"][0]["itinerary"]["path"]
    assert len(day1_path) == 3
    assert day1_path[0]["poi"]["category"] == "AIRPORT"
    assert day1_path[0]["scheduled_start"] == "08:00"
    assert day1_path[1]["poi"]["category"] == "HOTEL"
    assert day1_path[1]["scheduled_start"] == "14:00"
    assert day1_path[2]["poi"]["category"] == "AIRPORT"
    assert day1_path[2]["scheduled_end"] == "21:00"
