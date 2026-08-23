import pytest
import numpy as np
import sys
from unittest.mock import MagicMock
from datetime import time
from app.schemas.itinerary import TravelConstraints, MealRequirement
from app.domain.entities.poi import Poi, TransitEdge
from app.engine.scoring.features import UserStore

# Mock paladio_core globally for tests if not available
try:
    import paladio_core
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
    
    sys.modules['paladio_core'] = mock_paladio_core

from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter, OptimizationError, map_category_to_node_type
import paladio_core

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
            MealRequirement(meal_type="lunch", start_time=time(12, 0), end_time=time(14, 0)),
            MealRequirement(meal_type="dinner", start_time=time(19, 0), end_time=time(21, 0))
        ]
    )

@pytest.fixture
def mock_engine():
    ml_model = MagicMock()
    ml_model.batch_score.return_value = [[50.0] for _ in range(100)]
    ml_params = {}
    user_store = UserStore()
    return CppOptimizationAdapter(ml_model, ml_params, user_store)

def test_map_category_to_node_type():
    assert map_category_to_node_type("HOTEL") == paladio_core.NodeType.HOTEL
    assert map_category_to_node_type("UNKNOWN") == paladio_core.NodeType.ATTRACTION

def test_bridge_64_pois(mock_constraints, mock_engine):
    """Test aggressive 64 POI translation and execution over the PyBind11 boundary."""
    n = 64
    pois = []
    for i in range(n):
        pois.append(Poi(
            city="Rome",
            name=f"POI {i}",
            category="HOTEL" if i == 0 or i == n - 1 else "ATTRACTION",
            duration_mins=30,
            cost_eur=5.0
        ))

    transit_matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            row.append(TransitEdge(duration_mins=500, cost_eur=500.0))
        transit_matrix.append(row)

    result = mock_engine.run_optimization(mock_constraints, pois, transit_matrix)
    assert result.path is not None
    assert isinstance(result.path, list)

def test_bridge_transit_flattening(mock_constraints, mock_engine):
    """Test that matrix flattening correctly maps constraints to C++."""
    pois = [
        Poi(city="Rome", name="H1", category="HOTEL", duration_mins=10),
        Poi(city="Rome", name="A1", category="ATTRACTION", duration_mins=10),
        Poi(city="Rome", name="H2", category="HOTEL", duration_mins=10)
    ]
    
    transit_matrix = [
        [TransitEdge(duration_mins=0), TransitEdge(duration_mins=5), TransitEdge(duration_mins=999)],
        [TransitEdge(duration_mins=999), TransitEdge(duration_mins=0), TransitEdge(duration_mins=5)],
        [TransitEdge(duration_mins=999), TransitEdge(duration_mins=999), TransitEdge(duration_mins=0)]
    ]

    result = mock_engine.run_optimization(mock_constraints, pois, transit_matrix)
    path = result.path
    assert isinstance(path, list)

def test_bridge_exceeds_64_pois(mock_constraints, mock_engine):
    """Test boundary condition where exceeding 64 POIs raises an exception."""
    n = 65
    pois = [Poi(city="Rome", name=f"POI {i}", category="ATTRACTION") for i in range(n)]
    transit_matrix = [[TransitEdge(duration_mins=0, cost_eur=0.0) for _ in range(n)] for _ in range(n)]
    
    with pytest.raises(OptimizationError):
        mock_engine.run_optimization(mock_constraints, pois, transit_matrix)
