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
        matrix_dict_full=[[{"duration_mins": 0, "cost_eur": 0}]],
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


@pytest.mark.asyncio
async def test_optimize_enriches_transit_maneuvers(
    sample_constraints, sample_flights, sample_pois_data
):
    from app.domain.entities.poi import TransitLeg, TransitStep

    mock_engine = MagicMock()
    mock_result = MagicMock()
    mock_result.model_dump.return_value = {
        "path": [
            {
                "poi": {"name": "Hotel Paris", "lat": 48.85, "lon": 2.35},
                "scheduled_start": "09:00",
                "scheduled_end": "09:30",
            },
            {
                "poi": {"name": "Louvre", "lat": 48.86, "lon": 2.33},
                "scheduled_start": "10:00",
                "scheduled_end": "12:00",
            },
        ],
        "total_cost": 20.0,
        "total_time": 180.0,
        "total_score": 100.0,
    }
    mock_engine.run_optimization = AsyncMock(return_value=mock_result)

    mock_transit_leg = TransitLeg(
        duration_mins=15,
        cost_eur=1.80,
        mode="transit",
        steps=[
            TransitStep(
                type="walk",
                instruction="Walk to Metro",
                duration_mins=5,
                distance_km=0.3,
            ),
            TransitStep(
                type="transit",
                instruction="Take Metro 1",
                duration_mins=10,
                distance_km=1.2,
                transit_line="1",
            ),
        ],
    )

    with (
        patch(
            "app.use_cases.optimize_daily_itinerary.get_transit_matrix",
            new_callable=AsyncMock,
        ) as mock_matrix,
        patch(
            "app.use_cases.optimize_daily_itinerary.inject_slack_time"
        ) as mock_inject,
        patch(
            "app.services.transit_service.get_detailed_transit_leg",
            new_callable=AsyncMock,
        ) as mock_leg,
    ):
        mock_matrix.return_value = [
            [{"duration_mins": 10, "cost_eur": 0} for _ in range(3)] for _ in range(3)
        ]
        mock_inject.return_value = mock_matrix.return_value
        mock_leg.return_value = mock_transit_leg

        use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)
        outbound, return_flight = sample_flights
        result = await use_case.execute(
            sample_constraints, [sample_pois_data], outbound, return_flight
        )

        day1_path = result["days"][0]["itinerary"]["path"]
        assert len(day1_path) >= 2
        # Louvre should have transit_from_previous enriched
        louvre_step = next(p for p in day1_path if p["poi"]["name"] == "Louvre")
        assert "transit_from_previous" in louvre_step
        assert louvre_step["transit_from_previous"]["mode"] == "transit"
        assert len(louvre_step["transit_from_previous"]["steps"]) == 2
        assert louvre_step["transit_from_previous"]["steps"][1]["transit_line"] == "1"


@pytest.mark.asyncio
async def test_airport_splicing_dwell_and_transit_accounting(
    sample_constraints, sample_flights, sample_pois_data
):
    from app.domain.entities.poi import TransitLeg, TransitStep

    mock_engine = MagicMock()
    mock_result = MagicMock()
    mock_result.model_dump.return_value = {
        "path": [
            {
                "poi": {"name": "Hotel Paris", "category": "HOTEL", "cost_eur": 50.0},
                "scheduled_start": "10:00",
                "scheduled_end": "10:30",
            },
            {
                "poi": {"name": "Louvre", "category": "ATTRACTION", "cost_eur": 20.0},
                "scheduled_start": "11:00",
                "scheduled_end": "13:00",
            },
        ],
        "total_cost_eur": 70.0,
        "total_time_mins": 180,
        "total_score": 95.0,
    }
    mock_engine.run_optimization = AsyncMock(return_value=mock_result)

    mock_transit_leg = TransitLeg(
        duration_mins=40,
        cost_eur=2.50,
        mode="transit",
        steps=[
            TransitStep(
                type="transit",
                instruction="RER B Airport Shuttle",
                duration_mins=40,
                distance_km=25.0,
            )
        ],
    )

    with (
        patch(
            "app.use_cases.optimize_daily_itinerary.get_transit_matrix",
            new_callable=AsyncMock,
        ) as mock_matrix,
        patch(
            "app.use_cases.optimize_daily_itinerary.inject_slack_time"
        ) as mock_inject,
        patch(
            "app.services.transit_service.get_detailed_transit_leg",
            new_callable=AsyncMock,
        ) as mock_leg,
    ):
        mock_matrix.return_value = [
            [{"duration_mins": 10, "cost_eur": 0} for _ in range(3)] for _ in range(3)
        ]
        mock_inject.return_value = mock_matrix.return_value
        mock_leg.return_value = mock_transit_leg

        use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)
        outbound, return_flight = sample_flights

        # Single-day trip: day 0 is both arrival (day 0) and departure (num_days - 1)
        res = await use_case._optimize_single_day(
            day=0,
            num_days=1,
            unvisited_pois=sample_pois_data,
            constraints=sample_constraints,
            city="Paris",
            hotel_arrival_time=600,
            hotel_departure_time=1200,
            mandatory_names=["Louvre"],
            matrix_dict_full=[
                [{"duration_mins": 0, "cost_eur": 0} for _ in range(3)]
                for _ in range(3)
            ],
        )

        assert res is not None
        path = res["path"]
        # Airport should be spliced at arrival (index 0) and departure (last index)
        assert path[0]["poi"]["name"] == "CDG Airport"
        assert path[-1]["poi"]["name"] == "CDG Airport"

        # Base time was 180 mins.
        # Arrival dwell: 60 mins. Arrival airport transit: 40 mins.
        # Departure dwell: 120 mins. Departure airport transit: 40 mins.
        # Total time = 180 + 60 + 120 + 40 + 40 = 440 mins.
        assert res["total_time_mins"] == 180 + 60 + 120 + 40 + 40

        # Base cost was 70.0 EUR.
        # Arrival transit cost: 2.50 EUR. Departure transit cost: 2.50 EUR.
        # Total cost = 70.0 + 2.50 + 2.50 = 75.0 EUR.
        assert res["total_cost_eur"] == 70.0 + 2.50 + 2.50
