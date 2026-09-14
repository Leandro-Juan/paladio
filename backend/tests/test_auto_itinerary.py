import pytest
from datetime import date
from app.schemas.itinerary import (
    TravelConstraints,
    BookingAnchors,
    HotelAnchor,
    FlightSegment,
)
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase
from app.infrastructure.providers.travel_data import DefaultTravelDataProvider
from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
from unittest.mock import MagicMock, AsyncMock, patch


def generate_mock_constraints_with_real_locations(
    city: str, budget: float
) -> TravelConstraints:
    # Use real hotel and airport locations. FetchTravelContextUseCase geocodes them.
    if city.lower() == "paris":
        hotel_name = "Ritz Paris"
        hotel_addr = "15 Place Vendôme"
        airport = "CDG"
    elif city.lower() == "rome":
        hotel_name = "Hotel Hassler Roma"
        hotel_addr = "Piazza della Trinita dei Monti 6"
        airport = "FCO"
    else:
        hotel_name = "Hilton"
        hotel_addr = "Central"
        airport = "JFK"

    start_d = date(2026, 6, 1)
    end_d = date(2026, 6, 3)

    return TravelConstraints(
        origin_city="New York",
        destination_city=city,
        budget_usd=budget,
        start_date=start_d,
        end_date=end_d,
        booking_anchors=BookingAnchors(
            hotel=HotelAnchor(
                name=hotel_name,
                address=hotel_addr,
                city=city,
                check_in_date=str(start_d),
                check_out_date=str(end_d),
            ),
            outbound_flight=FlightSegment(
                origin_iata="JFK",
                destination_iata=airport,
                departure_time="2026-06-01 08:00",
                arrival_time="2026-06-01 21:00",
                flight_number="AA100",
                airline="American Airlines",
            ),
            return_flight=FlightSegment(
                origin_iata=airport,
                destination_iata="JFK",
                departure_time="2026-06-03 10:00",
                arrival_time="2026-06-03 13:00",
                flight_number="AA101",
                airline="American Airlines",
            ),
        ),
    )


@pytest.fixture
def mock_engine():
    from app.infrastructure.engine.ml_scorer import MLScorer

    ml_model = MagicMock()
    ml_model.batch_score.return_value = [[80.0] for _ in range(200)]

    user_repo = MagicMock()
    user_repo.get_embedding = AsyncMock(return_value=None)

    ml_scorer = MLScorer(ml_model, {}, user_repo)
    return CppOptimizationAdapter(ml_scorer)


def mock_get_transit_matrix(pois, city, departure_dt=None):
    n = len(pois)
    return [
        [{"duration_mins": 10, "cost_eur": 5.0} for _ in range(n)] for _ in range(n)
    ]


def mock_inject_slack(matrix, slack_factor):
    return matrix


@pytest.mark.asyncio
@patch(
    "app.use_cases.optimize_daily_itinerary.get_transit_matrix",
    side_effect=mock_get_transit_matrix,
)
@patch(
    "app.use_cases.optimize_daily_itinerary.inject_slack_time",
    side_effect=mock_inject_slack,
)
async def test_calculate_itinerary_auto(mock_inject, mock_matrix, mock_engine):
    city = "Paris"
    budget = 1000.0

    # Automatically generate constraints with real hotel/airport locations
    constraints = generate_mock_constraints_with_real_locations(city, budget)

    # 1. Fetch Context
    provider = DefaultTravelDataProvider()
    fetch_use_case = FetchTravelContextUseCase(data_provider=provider, ml_scorer=None)

    context = await fetch_use_case.execute(constraints)

    assert context is not None
    assert "daily_pois_data" in context

    daily_pois = context.get("daily_pois_data", [])

    # 2. Optimize Itinerary
    optimize_use_case = OptimizeDailyItineraryUseCase(engine=mock_engine)

    final_itinerary = await optimize_use_case.execute(
        constraints,
        daily_pois,
        context.get("outbound_flight"),
        context.get("return_flight"),
    )

    assert final_itinerary is not None
    assert "days" in final_itinerary
    assert len(final_itinerary["days"]) > 0
    assert final_itinerary["days"][0]["flight_info"] is not None
