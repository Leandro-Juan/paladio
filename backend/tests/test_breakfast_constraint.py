from datetime import time

import paladio_core
from app.domain.entities.poi import Poi, ScoredPoi
from app.infrastructure.engine.struct_mapper import (
    build_cpp_pois,
    build_optimization_config,
    map_category_to_node_type,
)
from app.schemas.itinerary import MealRequirement, TravelConstraints


def test_map_category_to_node_type_breakfast():
    """Verify CAFE and BAKERY map to RESTAURANT_BREAKFAST."""
    assert (
        map_category_to_node_type("CAFE") == paladio_core.NodeType.RESTAURANT_BREAKFAST
    )
    assert (
        map_category_to_node_type("BAKERY")
        == paladio_core.NodeType.RESTAURANT_BREAKFAST
    )
    assert (
        map_category_to_node_type("RESTAURANT")
        == paladio_core.NodeType.RESTAURANT_LUNCH
    )


def test_build_cpp_pois_breakfast_detection():
    """Verify POIs are properly flagged as breakfast spots."""
    pois = [
        Poi(
            id="1",
            city="Paris",
            name="Cafe de Flore",
            category="CAFE",
            open_time_mins=480,
            close_time_mins=1320,
            duration_mins=45,
            cost_eur=10.0,
        ),
        Poi(
            id="2",
            city="Paris",
            name="Du Pain et des Idees",
            category="BAKERY",
            open_time_mins=420,
            close_time_mins=1200,
            duration_mins=30,
            cost_eur=5.0,
        ),
        Poi(
            id="3",
            city="Paris",
            name="Morning Breakfast Bistro",
            category="RESTAURANT",
            open_time_mins=480,
            close_time_mins=900,
            duration_mins=60,
            cost_eur=15.0,
        ),
        Poi(
            id="4",
            city="Paris",
            name="Late Night Dinner Club",
            category="RESTAURANT",
            open_time_mins=1140,
            close_time_mins=1400,
            duration_mins=90,
            cost_eur=40.0,
        ),
    ]

    scored = [ScoredPoi(poi=p, score=10.0) for p in pois]
    cpp_pois = build_cpp_pois(scored, day_start_mins=480)

    assert len(cpp_pois) == 4
    # Cafe de Flore should be a breakfast spot
    assert cpp_pois[0].is_breakfast_spot is True
    # Bakery should be a breakfast spot
    assert cpp_pois[1].is_breakfast_spot is True
    # Morning Breakfast Bistro should be a breakfast spot
    assert cpp_pois[2].is_breakfast_spot is True
    # Late night dinner club should NOT be a breakfast spot
    assert cpp_pois[3].is_breakfast_spot is False
    assert cpp_pois[3].is_dinner_spot is True


def test_build_optimization_config_with_breakfast():
    """Verify TravelConstraints with BREAKFAST configures breakfast_deadline."""
    constraints = TravelConstraints(
        origin_city="Madrid",
        destination_city="Paris",
        budget_usd=1500,
        meals=[
            MealRequirement(
                meal_type="BREAKFAST", start_time=time(8, 0), end_time=time(10, 0)
            ),
            MealRequirement(
                meal_type="LUNCH", start_time=time(12, 0), end_time=time(14, 30)
            ),
            MealRequirement(
                meal_type="DINNER", start_time=time(19, 30), end_time=time(22, 0)
            ),
        ],
    )

    config = build_optimization_config(
        constraints,
        day_start_mins=480,  # 08:00
        day_end_mins=1320,  # 22:00
        start_node_index=0,
        end_node_index=0,
    )

    # 10:00 -> 600 mins
    assert config.breakfast_deadline == 600
    # 14:30 -> 870 mins
    assert config.lunch_deadline == 870
    # 22:00 -> 1320 mins
    assert config.dinner_deadline == 1320


def test_paladio_core_engine_enforces_breakfast():
    """Verify paladio_core requires and schedules a breakfast spot before breakfast_deadline."""
    # Create 3 POIs: Hotel (0), Breakfast Cafe (1), Museum (2)
    hotel = paladio_core.POI(paladio_core.NodeType.HOTEL, 0.0, 0.0, 480, 1320, 0, False)
    cafe = paladio_core.POI(
        paladio_core.NodeType.RESTAURANT_BREAKFAST, 15.0, 50.0, 480, 660, 45, False
    )
    cafe.is_breakfast_spot = True

    museum = paladio_core.POI(
        paladio_core.NodeType.ATTRACTION, 20.0, 60.0, 600, 1200, 90, False
    )

    pois = [hotel, cafe, museum]
    # Simple 3x3 transit matrix (15 mins transit duration between all nodes, 0 cost)
    durations = [
        0,
        15,
        15,
        15,
        0,
        15,
        15,
        15,
        0,
    ]
    costs = [0.0] * 9

    # Require breakfast before 600 mins (10:00 AM)
    config = paladio_core.OptimizationConfig(
        max_budget=500.0,
        start_node_index=0,
        end_node_index=0,
        end_time_limit=1200,
        breakfast_deadline=600,
        lunch_deadline=-1,
        dinner_deadline=-1,
    )

    result = paladio_core.optimize_itinerary(pois, durations, costs, config)
    assert len(result.path) > 0
    # The cafe (node index 1) MUST be included in the path to satisfy breakfast deadline
    assert 1 in result.path
