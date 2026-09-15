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
@patch("httpx.AsyncClient.get")
async def test_calculate_itinerary_auto(
    mock_http_get, mock_inject, mock_matrix, mock_engine
):
    city = "Paris"
    budget = 1000.0

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [{"lat": "48.8675", "lon": "2.3294"}]
    mock_http_get.return_value = mock_resp

    # Automatically generate constraints with real hotel/airport locations
    constraints = generate_mock_constraints_with_real_locations(city, budget)

    # 1. Fetch Context with hermetic test data
    mock_pois = [
        {
            "name": "Eiffel Tower",
            "city": "Paris",
            "category": "ATTRACTION",
            "location": {"latitude": 48.8584, "longitude": 2.2945},
            "schedule": {
                "open_time_mins": 540,
                "close_time_mins": 1380,
                "recommended_duration_minutes": 120,
            },
            "financials": {"estimated_cost": 25.0},
        },
        {
            "name": "Louvre Museum",
            "city": "Paris",
            "category": "MUSEUM",
            "location": {"latitude": 48.8606, "longitude": 2.3376},
            "schedule": {
                "open_time_mins": 540,
                "close_time_mins": 1080,
                "recommended_duration_minutes": 180,
            },
            "financials": {"estimated_cost": 17.0},
        },
        {
            "name": "Notre-Dame Cathedral",
            "city": "Paris",
            "category": "HISTORIC",
            "location": {"latitude": 48.8530, "longitude": 2.3499},
            "schedule": {
                "open_time_mins": 480,
                "close_time_mins": 1140,
                "recommended_duration_minutes": 90,
            },
            "financials": {"estimated_cost": 0.0},
        },
        {
            "name": "Arc de Triomphe",
            "city": "Paris",
            "category": "HISTORIC",
            "location": {"latitude": 48.8738, "longitude": 2.2950},
            "schedule": {
                "open_time_mins": 600,
                "close_time_mins": 1380,
                "recommended_duration_minutes": 60,
            },
            "financials": {"estimated_cost": 13.0},
        },
        {
            "name": "Musée d'Orsay",
            "city": "Paris",
            "category": "MUSEUM",
            "location": {"latitude": 48.8600, "longitude": 2.3266},
            "schedule": {
                "open_time_mins": 570,
                "close_time_mins": 1080,
                "recommended_duration_minutes": 120,
            },
            "financials": {"estimated_cost": 16.0},
        },
        {
            "name": "Sacré-Cœur",
            "city": "Paris",
            "category": "HISTORIC",
            "location": {"latitude": 48.8867, "longitude": 2.3431},
            "schedule": {
                "open_time_mins": 360,
                "close_time_mins": 1350,
                "recommended_duration_minutes": 60,
            },
            "financials": {"estimated_cost": 0.0},
        },
    ]
    mock_restaurants = [
        {
            "name": "Le Bouillon Chartier",
            "city": "Paris",
            "category": "RESTAURANT",
            "location": {"latitude": 48.8718, "longitude": 2.3429},
            "schedule": {
                "open_time_mins": 690,
                "close_time_mins": 1440,
                "recommended_duration_minutes": 60,
            },
            "financials": {"estimated_cost": 20.0},
        }
    ]
    provider = DefaultTravelDataProvider(
        test_data={"pois": mock_pois, "restaurants": mock_restaurants}
    )
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
