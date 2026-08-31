import sys
from unittest.mock import MagicMock

try:
    import paladio_core  # noqa: F401
except ImportError:
    mock_paladio_core = MagicMock()

    class MockNodeType:
        HOTEL = 1
        ATTRACTION = 2
        BAR = 3
        RESTAURANT_LUNCH = 4

    mock_paladio_core.NodeType = MockNodeType
    mock_paladio_core.OptimizationConfig = MagicMock()
    mock_paladio_core.POI = MagicMock()

    def mock_optimize_itinerary(pois, durs, costs, config):
        if len(pois) > 64:
            raise Exception("Exceeds maximum POIs")
        result = MagicMock()
        result.path = [0, 1] if len(pois) > 1 else [0]
        result.total_score = 100.0
        result.total_cost = 50.0
        result.total_time = 120
        return result

    mock_paladio_core.optimize_itinerary = mock_optimize_itinerary

    sys.modules["paladio_core"] = mock_paladio_core


import asyncio

import pytest
from app.main import app
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_client():
    """Fixture to provide an AsyncClient for FastAPI application testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
