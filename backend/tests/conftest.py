import asyncio
import importlib
import logging
import os
import sys
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio

try:
    from httpx import ASGITransport, AsyncClient
except ImportError:
    from httpx import AsyncClient

    ASGITransport = None
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
            self.category_id = (
                args[7] if len(args) > 7 else kwargs.get("category_id", 255)
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
        n = len(pois)
        curr_time = getattr(config, "day_start_mins", 540)
        if n <= 2:
            result.path = list(range(n))
            result.arrival_times = [curr_time] * n
        else:
            open_attractions = [
                i
                for i in range(1, n - 1)
                if not getattr(pois[i], "is_lunch_spot", False)
                and not getattr(pois[i], "is_dinner_spot", False)
                and getattr(pois[i], "latest_time", 1440)
                > getattr(pois[i], "earliest_time", 0)
                and getattr(pois[i], "latest_time", 1440) > curr_time
            ]
            open_meals = [
                i
                for i in range(1, n - 1)
                if (
                    getattr(pois[i], "is_lunch_spot", False)
                    or getattr(pois[i], "is_dinner_spot", False)
                )
                and getattr(pois[i], "latest_time", 1440)
                > getattr(pois[i], "earliest_time", 0)
            ]
            mand_attractions = [
                i for i in open_attractions if getattr(pois[i], "is_mandatory", False)
            ]
            other_attractions = [
                i
                for i in open_attractions
                if not getattr(pois[i], "is_mandatory", False)
            ]
            chosen_attractions = (mand_attractions + other_attractions)[:4]
            chosen_meals = open_meals[:2]

            all_chosen = sorted(
                chosen_attractions + chosen_meals,
                key=lambda idx: getattr(pois[idx], "earliest_time", 0),
            )
            path = [0]
            arr_times = [curr_time]
            for idx in all_chosen:
                p = pois[idx]
                e_time = getattr(p, "earliest_time", 0)
                l_time = getattr(p, "latest_time", 1440)
                dur = getattr(p, "duration", 60)
                t_dur = (
                    int(durs[path[-1] * n + idx])
                    if durs is not None and len(durs) == n * n
                    else 10
                )
                arr = max(curr_time + t_dur, e_time)
                if arr + dur <= l_time:
                    path.append(idx)
                    arr_times.append(arr)
                    curr_time = arr + dur
            path.append(n - 1)
            t_back = (
                int(durs[path[-2] * n + (n - 1)])
                if durs is not None and len(durs) == n * n
                else 10
            )
            arr_times.append(curr_time + t_back)

            result.path = path
            result.arrival_times = arr_times
        result.total_score = 100.0 * len(result.path)
        result.total_cost = 50.0
        result.total_time = 60 * len(result.path)
        return result

    def mock_solve_tsp_tour(durations, n, start_node=0, end_node=-1, fixed_end=False):
        import itertools

        if n <= 1:
            return list(range(n))
        effective_fixed_end = fixed_end and (
            end_node >= 0 and end_node < n and end_node != start_node
        )
        middle_nodes = [
            i
            for i in range(n)
            if i != start_node and (not effective_fixed_end or i != end_node)
        ]
        if len(middle_nodes) <= 7:
            best_tour = None
            best_cost = float("inf")
            for perm in itertools.permutations(middle_nodes):
                tour = [start_node] + list(perm)
                if effective_fixed_end:
                    tour.append(end_node)
                cost = sum(
                    durations[tour[k] * n + tour[k + 1]] for k in range(len(tour) - 1)
                )
                if cost < best_cost:
                    best_cost = cost
                    best_tour = tour
            return best_tour or (
                [start_node]
                + middle_nodes
                + ([end_node] if effective_fixed_end else [])
            )
        else:
            tour = [start_node]
            unvisited = set(middle_nodes)
            curr = start_node
            while unvisited:
                nxt = min(unvisited, key=lambda v: durations[curr * n + v])
                tour.append(nxt)
                unvisited.remove(nxt)
                curr = nxt
            if effective_fixed_end:
                tour.append(end_node)
            return tour

    def mock_solve_tsptw(
        durations,
        n,
        dwell_times,
        window_starts,
        window_ends,
        start_node=0,
        end_node=-1,
        fixed_end=False,
        penalty_weight=100.0,
    ):
        import itertools

        if n <= 1:
            return list(range(n))
        effective_fixed_end = fixed_end and (
            end_node >= 0 and end_node < n and end_node != start_node
        )
        middle_nodes = [
            i
            for i in range(n)
            if i != start_node and (not effective_fixed_end or i != end_node)
        ]

        def evaluate_cost(tour):
            total_transit = sum(
                durations[tour[k] * n + tour[k + 1]] for k in range(len(tour) - 1)
            )
            total_penalty = 0.0
            curr_time = window_starts[tour[0]] + dwell_times[tour[0]]
            for k in range(1, len(tour)):
                node = tour[k]
                transit = durations[tour[k - 1] * n + node]
                reach = curr_time + transit
                win_end = window_ends[node]
                win_start = window_starts[node]
                if reach > win_end:
                    late = float(reach - win_end)
                    total_penalty += penalty_weight * late * late
                elif reach < win_start:
                    early = float(win_start - reach)
                    total_penalty += 0.5 * early
                arr = max(reach, win_start)
                curr_time = arr + dwell_times[node]
            return total_transit + total_penalty

        if len(middle_nodes) <= 7:
            best_tour = None
            best_cost = float("inf")
            for perm in itertools.permutations(middle_nodes):
                tour = [start_node] + list(perm)
                if effective_fixed_end:
                    tour.append(end_node)
                cost = evaluate_cost(tour)
                if cost < best_cost:
                    best_cost = cost
                    best_tour = tour
            return best_tour or (
                [start_node]
                + middle_nodes
                + ([end_node] if effective_fixed_end else [])
            )
        else:
            tour = [start_node]
            unvisited = set(middle_nodes)
            curr = start_node
            curr_time = window_starts[start_node] + dwell_times[start_node]
            while unvisited:

                def node_metric(v):
                    transit = durations[curr * n + v]
                    reach = curr_time + transit
                    if reach > window_ends[v]:
                        penalty = penalty_weight * (reach - window_ends[v]) ** 2
                    elif reach < window_starts[v]:
                        penalty = 0.5 * (window_starts[v] - reach)
                    else:
                        penalty = 0.0
                    return transit + penalty

                nxt = min(unvisited, key=node_metric)
                tour.append(nxt)
                unvisited.remove(nxt)
                reach = curr_time + durations[curr * n + nxt]
                curr_time = max(reach, window_starts[nxt]) + dwell_times[nxt]
                curr = nxt
            if effective_fixed_end:
                tour.append(end_node)
            return tour

    mock_paladio_core.optimize_itinerary = mock_optimize_itinerary
    mock_paladio_core.solve_tsp_tour = mock_solve_tsp_tour
    mock_paladio_core.solve_tsptw = mock_solve_tsptw
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

    client_kwargs = (
        {"transport": ASGITransport(app=app), "base_url": "http://test"}
        if ASGITransport is not None
        else {"app": app, "base_url": "http://test"}
    )
    async with AsyncClient(**client_kwargs) as client:
        yield client

    app.dependency_overrides.clear()
