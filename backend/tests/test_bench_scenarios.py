from app.bench.scenarios import (
    get_scenario_matrix,
    load_bench_fixtures,
    build_scenario_constraints,
)


def test_load_bench_fixtures():
    fixtures = load_bench_fixtures()
    assert "Paris" in fixtures
    assert "Madrid" in fixtures
    assert "Lisbon" in fixtures
    assert len(fixtures["Paris"]) >= 35
    assert len(fixtures["Madrid"]) >= 35
    assert len(fixtures["Lisbon"]) >= 35


def test_get_scenario_matrix():
    matrix = get_scenario_matrix(
        cities=["Paris"],
        durations=[1, 3],
        paces=["BALANCED"],
        profiles=["culture"],
    )
    assert len(matrix) == 2
    assert matrix[0]["city"] == "Paris"
    assert matrix[0]["duration"] == 1
    assert matrix[1]["duration"] == 3


def test_build_scenario_constraints():
    constraints = build_scenario_constraints(
        city="Madrid",
        duration=3,
        pace="BALANCED",
        profile="culture",
    )
    assert constraints.destination_city == "Madrid"
    assert (constraints.end_date - constraints.start_date).days == 2
    assert constraints.budget_usd > 0
    assert len(constraints.nodes) > 0  # Mandatory node injected
