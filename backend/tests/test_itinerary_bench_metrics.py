import pytest
from app.bench.metrics import (
    calculate_zigzag_ratio,
    evaluate_tier1_recall,
    detect_closure_violations,
    detect_meal_spacing_violations,
    detect_idle_time_violations,
    calculate_load_variance,
    calculate_category_entropy,
)


def test_calculate_zigzag_ratio_straight_line():
    # Points along a straight line: 0 -> 1 -> 2 -> 3
    # Actual path is already optimal: zigzag ratio should be 1.0
    coords = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0), (0.0, 3.0)]
    ratio = calculate_zigzag_ratio(coords)
    assert pytest.approx(ratio, rel=1e-2) == 1.0


def test_calculate_zigzag_ratio_ping_pong():
    # Ping-pong: 0 -> 2 -> 1 -> 3
    coords = [(0.0, 0.0), (0.0, 2.0), (0.0, 1.0), (0.0, 3.0)]
    ratio = calculate_zigzag_ratio(coords)
    assert ratio > 1.2


def test_evaluate_tier1_recall():
    tier1_seed = ["Louvre Museum", "Eiffel Tower", "Catacombes de Paris"]
    scheduled = ["Eiffel Tower", "Musee d'Orsay", "Catacombes de Paris"]
    recall = evaluate_tier1_recall(scheduled, tier1_seed)
    assert pytest.approx(recall, rel=1e-2) == 2.0 / 3.0


def test_detect_closure_violations():
    # Day 0 is Monday (weekday 0)
    # POI closed on Mondays has open_time_mins_by_day[0] == -1
    scheduled_nodes = [
        {
            "name": "Open Museum",
            "weekday": 0,
            "open_time_mins_by_day": [540, 540, 540, 540, 540, 540, 540],
            "close_time_mins_by_day": [1080, 1080, 1080, 1080, 1080, 1080, 1080],
            "arrival_time_mins": 600,
            "departure_time_mins": 720,
        },
        {
            "name": "Closed Museum",
            "weekday": 0,
            "open_time_mins_by_day": [-1, 540, 540, 540, 540, 540, 540],
            "close_time_mins_by_day": [-1, 1080, 1080, 1080, 1080, 1080, 1080],
            "arrival_time_mins": 600,
            "departure_time_mins": 720,
        },
    ]
    violations = detect_closure_violations(scheduled_nodes)
    assert violations == 1


def test_detect_meal_spacing_violations():
    # Two meals only 60 minutes apart (< 180 min)
    scheduled_nodes = [
        {"name": "Breakfast", "is_meal": True, "arrival_time_mins": 500},
        {"name": "Lunch", "is_meal": True, "arrival_time_mins": 560},
    ]
    violations = detect_meal_spacing_violations(scheduled_nodes)
    assert violations == 1


def test_detect_idle_time_violations():
    # Day with 60 min idle time (> 45 min threshold)
    daily_idle_mins = [20, 60, 10]
    violations = detect_idle_time_violations(daily_idle_mins, max_idle_threshold=45)
    assert violations == 1


def test_calculate_load_variance():
    # Load in minutes per day
    daily_loads = [400, 420, 410]
    var = calculate_load_variance(daily_loads)
    assert var <= 100.0


def test_calculate_category_entropy():
    # Equal distribution among 2 categories -> entropy = 1.0 bit
    cats = ["museum", "museum", "attraction", "attraction"]
    ent = calculate_category_entropy(cats)
    assert pytest.approx(ent, rel=1e-2) == 1.0
