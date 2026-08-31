from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.schemas.itinerary import NodeConstraint, TravelConstraints
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase


@pytest.fixture
def mock_engine():
    engine = MagicMock()
    # Engine result model dump mock
    mock_result = MagicMock()
    mock_result.model_dump.return_value = {
        "path": [
            {
                "poi": {"name": "Test Attraction"},
                "scheduled_start": "10:00",
                "scheduled_end": "12:00",
            }
        ],
        "total_cost": 10.0,
        "total_time": 120.0,
        "total_score": 100.0,
    }
    engine.run_optimization = AsyncMock(return_value=mock_result)
    return engine


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
            "type": "HOTEL",
            "city": "Paris",
            "cost_eur": 50.0,
            "score": 10.0,
            "earliest_time": 0,
            "latest_time": 1440,
            "duration": 10,
            "is_breakfast_spot": False,
            "is_lunch_spot": False,
            "is_dinner_spot": False,
            "is_mandatory": False,
            "poi_id": "hotel1",
        },
        {
            "name": "CDG Airport",
            "category": "AIRPORT",
            "type": "HOTEL",
            "city": "Paris",
            "cost_eur": 0.0,
            "score": 0.0,
            "earliest_time": 0,
            "latest_time": 1440,
            "duration": 10,
            "is_breakfast_spot": False,
            "is_lunch_spot": False,
            "is_dinner_spot": False,
            "is_mandatory": False,
            "poi_id": "airport1",
        },
        {
            "name": "Louvre",
            "category": "ATTRACTION",
            "type": "ATTRACTION",
            "city": "Paris",
            "cost_eur": 20.0,
            "score": 100.0,
            "earliest_time": 600,
            "latest_time": 1200,
            "duration": 120,
            "is_breakfast_spot": False,
            "is_lunch_spot": False,
            "is_dinner_spot": False,
            "is_mandatory": True,
            "poi_id": "Louvre",
        },
    ]


@pytest.mark.asyncio
@patch(
    "app.use_cases.optimize_daily_itinerary.get_transit_matrix", new_callable=AsyncMock
)
@patch("app.use_cases.optimize_daily_itinerary.inject_slack_time")
async def test_optimize_multi_day(
    mock_inject,
    mock_matrix,
    mock_engine,
    sample_constraints,
    sample_flights,
    sample_pois_data,
):
    # Arrange
    mock_matrix.return_value = [
        [{"duration_mins": 10, "cost_eur": 5.0} for _ in range(3)] for _ in range(3)
    ]
    mock_inject.return_value = mock_matrix.return_value

    use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)
    outbound, return_flight = sample_flights

    # Act
    result = await use_case.execute(
        sample_constraints, [sample_pois_data], outbound, return_flight
    )

    # Assert
    assert "days" in result
    assert len(result["days"]) > 0
    assert result["days"][0]["day"] == 1
    assert result["days"][0]["flight_info"] == outbound

    # Check that engine was called
    assert mock_engine.run_optimization.called


@pytest.mark.asyncio
async def test_optimize_single_day_no_pois_except_hotel(
    mock_engine, sample_constraints
):
    # Arrange
    use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)

    # Act
    result = await use_case._optimize_single_day(
        day=0,
        num_days=1,
        unvisited_pois=[{"category": "HOTEL"}],
        constraints=sample_constraints,
        city="Paris",
        hotel_arrival_time=600,
        hotel_departure_time=1200,
        mandatory_names=[],
    )

    # Assert
    assert result is None


@pytest.mark.asyncio
async def test_optimize_handles_missing_flights_gracefully(
    mock_engine, sample_constraints
):
    """
    If outbound_flight or return_flight is None, the use case should not crash.
    It should default flight_cost to 0.0 and assume reasonable arrival/departure times.
    """
    use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)
    pois_data = [{"name": "Hotel 1", "category": "HOTEL", "city": "Madrid"}]

    # We pass None for flights
    # We mock get_transit_matrix to avoid deep execution errors
    with patch(
        "app.use_cases.optimize_daily_itinerary.get_transit_matrix",
        new_callable=AsyncMock,
    ) as mock_matrix:
        mock_matrix.return_value = [[{"duration_mins": 10, "cost_eur": 0}]]

        # Act
        result = await use_case.execute(sample_constraints, [pois_data], None, None)

        # Assert
        assert "days" in result
