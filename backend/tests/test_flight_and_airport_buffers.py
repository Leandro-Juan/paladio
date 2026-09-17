import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from app.schemas.itinerary import FlightSegment, TravelConstraints
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase


def test_flight_segment_timezone_aware_arrival():
    # 1. MAD -> CDG: Same timezone (Europe/Madrid -> Europe/Paris, both CEST in Sept)
    seg1 = FlightSegment(
        origin_iata="MAD",
        destination_iata="CDG",
        departure_time="2026-09-23T10:00:00",
        flight_duration_minutes=180,
    )
    assert seg1.arrival_time == "2026-09-23T13:00:00"

    # 2. LHR -> MAD: Crosses timezone (Europe/London BST UTC+1 -> Europe/Madrid CEST UTC+2)
    seg2 = FlightSegment(
        origin_iata="LHR",
        destination_iata="MAD",
        departure_time="2026-09-23T10:00:00",
        flight_duration_minutes=120,
    )
    # 10:00 BST + 2h flight = 12:00 BST = 13:00 CEST
    assert seg2.arrival_time == "2026-09-23T13:00:00"

    # 3. Transatlantic JFK -> CDG (America/New_York EDT UTC-4 -> Europe/Paris CEST UTC+2)
    seg3 = FlightSegment(
        origin_iata="JFK",
        destination_iata="CDG",
        departure_time="2026-09-23T22:00:00",
        flight_duration_minutes=480,
    )
    # 22:00 EDT + 8h flight (+6h tz diff) = 12:00 next day in Paris
    assert seg3.arrival_time == "2026-09-24T12:00:00"


@pytest.mark.asyncio
async def test_optimize_daily_itinerary_buffer_and_direction():
    mock_engine = MagicMock()

    async def dynamic_run_opt(*args, **kwargs):
        day_start = kwargs.get("day_start_mins", 480)
        day_end = kwargs.get("day_end_mins", 1320)
        mock_itin = MagicMock()
        end_time_mins = min(day_end, day_start + 120)
        sh, sm = day_start // 60, day_start % 60
        eh, em = end_time_mins // 60, end_time_mins % 60
        mock_itin.model_dump.return_value = {
            "total_score": 100.0,
            "total_cost": 50.0,
            "total_time": 300,
            "path": [
                {
                    "poi": {
                        "name": "InterContinental Paris Le Grand",
                        "city": "Paris",
                        "category": "HOTEL",
                    },
                    "scheduled_start": f"{sh:02d}:{sm:02d}",
                    "scheduled_end": f"{eh:02d}:{em:02d}",
                }
            ],
        }
        return mock_itin

    mock_engine.run_optimization = AsyncMock(side_effect=dynamic_run_opt)

    constraints = TravelConstraints(
        destination_city="Paris",
        origin_city="Madrid",
        start_date=date(2026, 9, 23),
        end_date=date(2026, 9, 28),
        budget_usd=1000.0,
    )

    outbound_flight = {
        "origin_iata": "MAD",
        "destination_iata": "CDG",
        "departure_time": "2026-09-23T10:00:00",
        "flight_duration_minutes": 180,
    }
    return_flight = {
        "origin_iata": "CDG",
        "destination_iata": "MAD",
        "departure_time": "2026-09-28T14:00:00",
        "flight_duration_minutes": 180,
    }

    day_pois = [
        {
            "name": "CDG Airport",
            "city": "Paris",
            "category": "AIRPORT",
            "cost_eur": 0.0,
            "duration_mins": 120,
        },
        {
            "name": "InterContinental Paris Le Grand",
            "city": "Paris",
            "category": "HOTEL",
            "cost_eur": 0.0,
            "duration_mins": 60,
        },
        {
            "name": "Eiffel Tower",
            "city": "Paris",
            "category": "ATTRACTION",
            "cost_eur": 25.0,
            "duration_mins": 90,
        },
    ]

    use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)
    result = await use_case.execute(
        constraints=constraints,
        daily_pois_data=[day_pois] * 6,
        outbound_flight=outbound_flight,
        return_flight=return_flight,
    )

    days = result["days"]
    assert len(days) == 6

    # 1. Day 1 Inbound Flight & Airport
    day1 = days[0]
    assert day1["flight_info"]["direction"] == "arrival"
    assert day1["flight_info"]["arrival_time"] == "2026-09-23T13:00:00"

    day1_path = day1["itinerary"]["path"]
    first_node = day1_path[0]
    assert first_node["poi"]["category"] == "AIRPORT"
    # Arrival at airport must match flight touchdown (13:00), not pre-takeoff 08:20!
    assert first_node["scheduled_start"] == "13:00"
    assert first_node["scheduled_end"] == "14:00"

    # 2. Day 6 Outbound Return Flight & Airport
    day6 = days[5]
    assert day6["flight_info"]["direction"] == "departure"
    assert day6["flight_info"]["departure_time"] == "2026-09-28T14:00:00"

    day6_path = day6["itinerary"]["path"]
    last_node = day6_path[-1]
    assert last_node["poi"]["category"] == "AIRPORT"
    # Airport dwell on departure day must end at flight takeoff time (14:00)!
    assert last_node["scheduled_end"] == "14:00"
    assert last_node["scheduled_start"] == "12:00"
