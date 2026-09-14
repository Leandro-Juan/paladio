from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.schemas.itinerary import TravelConstraints
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.infrastructure.providers.travel_data import DefaultTravelDataProvider


@pytest.fixture
def use_case():
    provider = MagicMock(spec=DefaultTravelDataProvider)
    provider.get_pois = AsyncMock(
        return_value=[{"location": {"latitude": 40.0, "longitude": -3.0}}]
    )
    provider.get_restaurants = AsyncMock(return_value=[])
    provider.generate_mock_context = AsyncMock(return_value={})
    return FetchTravelContextUseCase(data_provider=provider)


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
    result = await use_case.execute(constraints)

    assert "daily_pois_data" in result
    assert result.get("outbound_flight") is None
    assert result.get("return_flight") is None
