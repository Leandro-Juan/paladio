from datetime import date

import pytest
from app.schemas.itinerary import NodeConstraint, TravelConstraints
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase


@pytest.fixture
def sample_constraints():
    return TravelConstraints(
        origin_city="NYC",
        destination_city="Paris",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 2),
        budget_usd=1000.0,
        nodes=[NodeConstraint(poi_id="Louvre")],
    )


@pytest.fixture
def sample_flights():
    outbound = {"price": 100.0, "arrival_time": "10:00"}
    return_flight = {"price": 100.0, "departure_time": "18:00"}
    return outbound, return_flight


@pytest.fixture
def sample_pois_data():
    return [
        {
            "name": "Hotel Paris",
            "category": "HOTEL",
            "city": "Paris",
            "cost_eur": 50.0,
            "duration_mins": 10,
            "open_time_mins_by_day": [0] * 7,
            "close_time_mins_by_day": [1440] * 7,
            "location": {"latitude": 48.8566, "longitude": 2.3522},
            "poi_id": "hotel1",
        },
        {
            "name": "CDG Airport",
            "category": "AIRPORT",
            "city": "Paris",
            "cost_eur": 0.0,
            "duration_mins": 60,
            "open_time_mins_by_day": [0] * 7,
            "close_time_mins_by_day": [1440] * 7,
            "location": {"latitude": 49.0097, "longitude": 2.5479},
            "poi_id": "airport1",
        },
        {
            "name": "Louvre",
            "category": "ATTRACTION",
            "city": "Paris",
            "cost_eur": 20.0,
            "open_time_mins_by_day": [540] * 7,
            "close_time_mins_by_day": [1260] * 7,
            "duration_mins": 120,
            "is_mandatory": True,
            "tier": 1,
            "iconicity_score": 1.0,
            "location": {"latitude": 48.8606, "longitude": 2.3376},
            "poi_id": "Louvre",
        },
        {
            "name": "Bistrot du Louvre",
            "category": "RESTAURANT",
            "city": "Paris",
            "cost_eur": 18.0,
            "open_time_mins_by_day": [720] * 7,
            "close_time_mins_by_day": [1380] * 7,
            "duration_mins": 60,
            "location": {"latitude": 48.8610, "longitude": 2.3380},
            "poi_id": "bistrot1",
        },
    ]


def _fast_matrix(pois, city):
    n = len(pois)
    return [
        [{"duration_mins": 10, "cost_eur": 2.0} for _ in range(n)] for _ in range(n)
    ]


@pytest.mark.asyncio
async def test_optimize_multi_day(sample_constraints, sample_flights, sample_pois_data):
    use_case = OptimizeDailyItineraryUseCase(transit_matrix_fn=_fast_matrix)
    outbound, return_flight = sample_flights

    result = await use_case.execute(
        sample_constraints, [sample_pois_data], outbound, return_flight
    )

    assert "days" in result
    assert len(result["days"]) == 2
    assert result["days"][0]["day"] == 1
    assert result["days"][0]["flight_info"]["direction"] == "arrival"
    assert "itinerary" in result["days"][0]
    assert "metadata" in result
    assert result["metadata"]["engine"] == "paladio_core_cpp20"


@pytest.mark.asyncio
async def test_optimize_handles_missing_flights_gracefully(
    sample_constraints, sample_pois_data
):
    use_case = OptimizeDailyItineraryUseCase(transit_matrix_fn=_fast_matrix)

    result = await use_case.execute(sample_constraints, [sample_pois_data], None, None)

    assert "days" in result
    assert len(result["days"]) == 2
    assert result["total_trip_cost"] >= 0.0


@pytest.mark.asyncio
async def test_optimize_with_hotel_depot(sample_constraints, sample_pois_data):
    use_case = OptimizeDailyItineraryUseCase(transit_matrix_fn=_fast_matrix)

    result = await use_case.execute(sample_constraints, [sample_pois_data], None, None)

    # Hotel Paris should be recognized as depot
    day1_itin = result["days"][0]["itinerary"]
    path = day1_itin.get("path", [])
    assert len(path) > 0
    # First node should be the hotel
    assert "Hotel Paris" in path[0]["poi"]["name"]
    assert path[0]["poi"]["category"] == "HOTEL"


@pytest.mark.asyncio
async def test_airport_splicing_dwell_and_transit_accounting(
    sample_constraints, sample_flights, sample_pois_data
):
    use_case = OptimizeDailyItineraryUseCase(transit_matrix_fn=_fast_matrix)
    outbound, return_flight = sample_flights

    result = await use_case.execute(
        sample_constraints, [sample_pois_data], outbound, return_flight
    )

    days = result["days"]
    assert len(days) == 2

    # Day 1 Arrival flight & airport
    day1_path = days[0]["itinerary"]["path"]
    assert day1_path[0]["poi"]["category"] == "AIRPORT"
    assert day1_path[0]["scheduled_start"] == "10:00"
    assert day1_path[0]["scheduled_end"] == "11:00"

    # Day 2 Departure flight & airport
    day2_path = days[1]["itinerary"]["path"]
    assert day2_path[-1]["poi"]["category"] == "AIRPORT"
    assert day2_path[-1]["scheduled_end"] == "18:00"
    assert day2_path[-1]["scheduled_start"] == "16:00"


@pytest.mark.asyncio
async def test_legacy_single_day_removed():
    use_case = OptimizeDailyItineraryUseCase()
    # Confirm legacy v1 private method is removed
    assert not hasattr(use_case, "_optimize_single_day")
