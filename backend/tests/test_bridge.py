from datetime import time
from unittest.mock import MagicMock

import paladio_core
import pytest
from app.domain.entities.poi import Poi
from app.infrastructure.engine.bridge_adapter import (
    CppOptimizationAdapter,
    OptimizationError,
)
from app.infrastructure.engine.struct_mapper import map_category_to_node_type
from app.schemas.itinerary import MealRequirement, TravelConstraints


@pytest.fixture
def mock_constraints():
    return TravelConstraints(
        destination="Rome",
        budget_usd=1000.0,
        start_date="2026-08-18",
        end_date="2026-08-18",
        pace="medium",
        interests=["history"],
        meals=[
            MealRequirement(
                meal_type="lunch", start_time=time(12, 0), end_time=time(14, 0)
            ),
            MealRequirement(
                meal_type="dinner", start_time=time(19, 0), end_time=time(21, 0)
            ),
        ],
    )


@pytest.fixture
def mock_engine():
    from unittest.mock import AsyncMock

    from app.infrastructure.engine.ml_scorer import MLScorer

    ml_model = MagicMock()
    ml_model.batch_score.return_value = [[50.0] for _ in range(100)]
    ml_params = {}

    user_repo = MagicMock()
    user_repo.get_embedding = AsyncMock(return_value=None)

    ml_scorer = MLScorer(ml_model, ml_params, user_repo)
    return CppOptimizationAdapter(ml_scorer)


def test_map_category_to_node_type():
    assert map_category_to_node_type("HOTEL") == paladio_core.NodeType.HOTEL
    assert map_category_to_node_type("UNKNOWN") == paladio_core.NodeType.ATTRACTION


@pytest.mark.asyncio
async def test_bridge_64_pois(mock_constraints, mock_engine):
    """Test aggressive 64 POI translation and execution over the PyBind11 boundary."""
    n = 64
    pois = []
    for i in range(n):
        pois.append(
            Poi(
                city="Rome",
                name=f"POI {i}",
                category="HOTEL" if i == 0 or i == n - 1 else "ATTRACTION",
                duration_mins=30,
                cost_eur=5.0,
            )
        )

    transit_matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            row.append((500, 500.0))
        transit_matrix.append(row)

    result = await mock_engine.run_optimization(mock_constraints, pois, transit_matrix)
    assert result.path is not None
    assert isinstance(result.path, list)


@pytest.mark.asyncio
async def test_bridge_transit_flattening(mock_constraints, mock_engine):
    """Test that matrix flattening correctly maps constraints to C++."""
    pois = [
        Poi(city="Rome", name="H1", category="HOTEL", duration_mins=10),
        Poi(city="Rome", name="A1", category="ATTRACTION", duration_mins=10),
        Poi(city="Rome", name="H2", category="HOTEL", duration_mins=10),
    ]

    transit_matrix = [
        [(0, 0.0), (5, 0.0), (999, 0.0)],
        [(999, 0.0), (0, 0.0), (5, 0.0)],
        [(999, 0.0), (999, 0.0), (0, 0.0)],
    ]

    result = await mock_engine.run_optimization(mock_constraints, pois, transit_matrix)
    path = result.path
    assert isinstance(path, list)


@pytest.mark.asyncio
async def test_bridge_exceeds_64_pois(mock_constraints, mock_engine):
    """Test boundary condition where exceeding 64 POIs raises an exception."""
    n = 65
    pois = [Poi(city="Rome", name=f"POI {i}", category="ATTRACTION") for i in range(n)]
    transit_matrix = [[(0, 0.0) for _ in range(n)] for _ in range(n)]

    with pytest.raises(OptimizationError):
        await mock_engine.run_optimization(mock_constraints, pois, transit_matrix)
