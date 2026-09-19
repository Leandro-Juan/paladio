import asyncio
import importlib
import logging
import os
import sys
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
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
    importlib.import_module("paladio_core")
except ImportError:
    mock_paladio_core = MagicMock()

    class MockNodeType:
        HOTEL = 1
        ATTRACTION = 2
        BAR = 3
        RESTAURANT_BREAKFAST = 4
        RESTAURANT_LUNCH = 5
        RESTAURANT_DINNER = 6

    class MockOptimizationConfig:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    class MockPOI:
        def __init__(self, *args, **kwargs):
            self.type = args[0] if len(args) > 0 else kwargs.get("type", 1)
            self.cost = args[1] if len(args) > 1 else kwargs.get("cost", 0.0)
            self.score = args[2] if len(args) > 2 else kwargs.get("score", 0.0)
            self.earliest_time = (
                args[3] if len(args) > 3 else kwargs.get("earliest_time", 0)
            )
            self.latest_time = (
                args[4] if len(args) > 4 else kwargs.get("latest_time", 1440)
            )
            self.duration = args[5] if len(args) > 5 else kwargs.get("duration", 60)
            self.is_mandatory = (
                args[6] if len(args) > 6 else kwargs.get("is_mandatory", False)
            )
            self.is_breakfast_spot = self.type == MockNodeType.RESTAURANT_BREAKFAST
            self.is_lunch_spot = self.type == MockNodeType.RESTAURANT_LUNCH
            self.is_dinner_spot = self.type == MockNodeType.RESTAURANT_DINNER

    mock_paladio_core.NodeType = MockNodeType
    mock_paladio_core.OptimizationConfig = MockOptimizationConfig
    mock_paladio_core.POI = MockPOI

    def mock_optimize_itinerary(pois, durs, costs, config):
        if len(pois) > 64:
            raise ValueError("Exceeds maximum POIs")
        result = MagicMock()
        result.path = [0, 1] if len(pois) > 1 else [0]
        result.total_score = 100.0
        result.total_cost = 50.0
        result.total_time = 120
        return result

    mock_paladio_core.optimize_itinerary = mock_optimize_itinerary
    sys.modules["paladio_core"] = mock_paladio_core


postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    f"postgresql+asyncpg://postgres:postgres@{postgres_host}:5432/paladio_test",
)
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
if "REDIS_URL" not in os.environ:
    os.environ["REDIS_URL"] = "redis://127.0.0.1:6379/0"
os.environ["ALLOW_PUBLIC_REGISTRATION"] = "true"


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
    from app.db.models import Base

    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, echo=False)
    # Using try/except in case the test database isn't ready
    try:
        from sqlalchemy import text

        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            await conn.run_sync(Base.metadata.create_all)
    except (SQLAlchemyError, OSError) as e:
        logging.getLogger(__name__).warning(
            f"Could not initialize test DB tables. Ensure test DB exists. {e}"
        )
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    import app.db.session as app_session_mod

    session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    orig_session = app_session_mod.async_session
    app_session_mod.async_session = session_maker
    async with session_maker() as session:
        yield session
        await session.rollback()
    app_session_mod.async_session = orig_session


# ---------------------------------------------------------
# 4. FastAPI TestClient
# ---------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
async def async_client(
    db_session: AsyncSession, request
) -> AsyncGenerator[AsyncClient, None]:
    """Fixture to provide an AsyncClient for FastAPI application testing."""
    from app.db.session import get_db
    from app.main import app

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
