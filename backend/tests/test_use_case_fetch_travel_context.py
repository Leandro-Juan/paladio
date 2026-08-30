from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from app.schemas.itinerary import TravelConstraints
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase


@pytest.fixture
def use_case():
    return FetchTravelContextUseCase()


@pytest.fixture
def constraints():
    return TravelConstraints(
        destination_city="Madrid",
        origin_city="Unknown",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=2),
        adults=1,
    )


@pytest.mark.asyncio
async def test_fetch_context_handles_unknown_origin_without_crash(
    use_case, constraints
):
    """
    If the origin city is 'unknown' or not provided, the use case should not crash
    when fetching flights. It should return None or empty dicts for flight data.
    """
    with patch(
        "app.use_cases.fetch_travel_context.get_attractions_for_city",
        new_callable=AsyncMock,
    ) as mock_pois, patch(
        "app.use_cases.fetch_travel_context.fetch_restaurants", new_callable=AsyncMock
    ) as mock_restaurants:
        mock_pois.return_value = []
        mock_restaurants.return_value = []

        result = await use_case.execute(constraints)

        assert "daily_pois_data" in result
        assert result.get("outbound_flight") is None
        assert result.get("return_flight") is None
