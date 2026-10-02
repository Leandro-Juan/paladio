import pytest
from app.bench.runner import run_single_scenario_benchmark
from app.bench.scenarios import load_bench_fixtures


@pytest.mark.asyncio
async def test_run_single_scenario_benchmark():
    fixtures = load_bench_fixtures()
    scenario = {
        "city": "Madrid",
        "duration": 2,
        "pace": "BALANCED",
        "profile": "culture",
        "scenario_id": "madrid_2d_balanced_culture",
    }
    # Run as_is
    res_as_is = await run_single_scenario_benchmark(
        scenario,
        baseline_mode="as_is",
        travel_fixtures=fixtures,
    )
    assert res_as_is["scenario_id"] == "madrid_2d_balanced_culture"
    assert "tier_1_recall" in res_as_is
    assert "closure_violations" in res_as_is
    assert "node_cap_violations" in res_as_is
    assert "zigzag_ratio" in res_as_is
    assert "latency_ms" in res_as_is
    assert res_as_is["latency_ms"] > 0
    assert res_as_is["node_cap_violations"] == 0

    # Run no_monotony
    res_no_mono = await run_single_scenario_benchmark(
        scenario,
        baseline_mode="no_monotony",
        travel_fixtures=fixtures,
    )
    assert res_no_mono["scenario_id"] == "madrid_2d_balanced_culture"
    assert res_no_mono["node_cap_violations"] == 0
