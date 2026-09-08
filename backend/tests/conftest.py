import sys
import os
import asyncio
from typing import AsyncGenerator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# ---------------------------------------------------------
# 1. C++ Core Handling (Preventing Segfaults in tests)
# ---------------------------------------------------------
# If the code crashes or segfaults, the pytest process will die without a trace.
# We mock it here unless explicitly enabled, or handle it carefully.
try:
    if os.getenv("MOCK_PALADIO_CORE", "1") == "1":
        raise ImportError("Forcing mock paladio_core")
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


from app.db.models import Base
from app.db.session import get_db
from app.main import app

postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    f"postgresql+asyncpg://postgres:postgres@{postgres_host}:5432/paladio_test",
)


# ---------------------------------------------------------
# 2. Event Loop (Forced by pytest-asyncio)
# ---------------------------------------------------------
@pytest.fixture(scope="session")
def event_loop():
    """
    Forces a fresh asyncio event loop for the entire test session.
    Crucial for pytest-asyncio with FastAPI and SQLAlchemy async engines.
    """
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------
# 3. Database Fixtures
# ---------------------------------------------------------
@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, echo=False)
    # Using try/except in case the test database isn't ready
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        import logging

        logging.warning(
            f"Could not initialize test DB tables. Ensure test DB exists. {e}"
        )
    yield engine
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    except Exception:
        pass
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------
# 4. FastAPI TestClient
# ---------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
async def async_client(
    db_session: AsyncSession, request
) -> AsyncGenerator[AsyncClient, None]:
    """Fixture to provide an AsyncClient for FastAPI application testing."""
    app.dependency_overrides[get_db] = lambda: db_session

    # If the test is NOT marked as 'ml', we mock the ML model to avoid JAX JIT compilation hanging
    if not request.node.get_closest_marker("ml"):
        app.state.ml_model = MagicMock()
        app.state.ml_params = MagicMock()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()
