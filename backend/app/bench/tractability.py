import time
import numpy as np
from typing import Any
import paladio_core


PACE_DURATIONS = {
    "LEISURELY": 90,
    "BALANCED": 60,
    "INTENSE": 40,
}


def generate_synthetic_instance(
    node_count: int,
    window_mins: int,
    pace: str = "BALANCED",
):
    """
    Generates a deterministic synthetic TSPTW instance for benchmarking solver scaling.
    """
    duration = PACE_DURATIONS.get(pace.upper(), 60)
    pois = [
        paladio_core.POI(
            type=paladio_core.NodeType.HOTEL,
            cost=0.0,
            score=0.0,
            earliest_time=0,
            latest_time=window_mins,
            duration=15,
            is_mandatory=False,
        )
    ]
    for i in range(1, node_count):
        # Vary earliest/latest slightly
        earliest = (i * 30) % max(1, (window_mins - duration - 60))
        latest = min(window_mins, earliest + duration + 180)
        pois.append(
            paladio_core.POI(
                type=paladio_core.NodeType.ATTRACTION,
                cost=10.0 + (i % 15),
                score=50.0 + (i % 40),
                earliest_time=earliest,
                latest_time=latest,
                duration=duration,
                is_mandatory=False,
            )
        )

    # Durations: clustered synthetic distances ~10-25 mins
    n = len(pois)
    durations = [
        15 + ((i * 7 + j * 11) % 15) if i != j else 0
        for i in range(n)
        for j in range(n)
    ]
    costs = [2.0 if i != j else 0.0 for i in range(n) for j in range(n)]
    return pois, durations, costs


def run_single_probe(
    node_count: int,
    window_mins: int,
    pace: str = "BALANCED",
    with_realism: bool = True,
    timeout_ms: int = 5000,
    repeats: int = 3,
) -> dict[str, Any]:
    """Runs repeats of a single solver instance and measures latency and timeouts."""
    pois, durations, costs = generate_synthetic_instance(node_count, window_mins, pace)

    if with_realism:
        config = paladio_core.OptimizationConfig(
            max_budget=1000.0,
            start_node_index=0,
            end_node_index=0,
            end_time_limit=window_mins,
            breakfast_deadline=window_mins // 4 if window_mins >= 360 else -1,
            lunch_deadline=window_mins // 2 if window_mins >= 360 else -1,
            dinner_deadline=(window_mins * 3) // 4 if window_mins >= 600 else -1,
            max_idle_time=60,
            idle_time_penalty_rate=0.5,
            max_active_time_before_fatigue=240,
            fatigue_penalty_multiplier=0.6,
            min_meal_spacing=180,
            monotony_threshold=2,
            monotony_multiplier=0.5,
            timeout_ms=timeout_ms,
        )
    else:
        config = paladio_core.OptimizationConfig(
            max_budget=1000.0,
            start_node_index=0,
            end_node_index=0,
            end_time_limit=window_mins,
            max_idle_time=9999,
            idle_time_penalty_rate=0.0,
            max_active_time_before_fatigue=9999,
            fatigue_penalty_multiplier=1.0,
            min_meal_spacing=0,
            monotony_threshold=50,
            monotony_multiplier=1.0,
            timeout_ms=timeout_ms,
        )

    times_ms = []
    timed_out_count = 0

    for _ in range(repeats):
        t0 = time.perf_counter()
        res = paladio_core.optimize_itinerary(pois, durations, costs, config)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        times_ms.append(elapsed_ms)
        to_attr = getattr(res, "timed_out", None)
        is_to = bool(elapsed_ms >= timeout_ms or (to_attr is True))
        if is_to:
            timed_out_count += 1

    p50 = float(np.percentile(times_ms, 50))
    p95 = float(np.percentile(times_ms, 95))
    return {
        "node_count": node_count,
        "window_mins": window_mins,
        "pace": pace,
        "with_realism": with_realism,
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "timed_out": timed_out_count > 0,
        "timeout_count": timed_out_count,
        "repeats": repeats,
    }


def derive_tractable_nodes_table(
    records: list[dict[str, Any]], max_p95_ms: float = 500.0
) -> dict[int, int]:
    """
    Derives the tractable node cap per window length where p95_ms <= max_p95_ms
    and timed_out is False.
    """
    table: dict[int, int] = {}
    windows = sorted(list({r["window_mins"] for r in records}))
    for w in windows:
        w_records = [
            r
            for r in records
            if r["window_mins"] == w
            and not r.get("timed_out", False)
            and r.get("p95_ms", 99999) <= max_p95_ms
        ]
        if w_records:
            max_nodes = max(r["node_count"] for r in w_records)
            table[w] = max_nodes
        else:
            table[w] = 8  # Safe baseline minimum
    return table


def run_tractability_benchmark(
    window_lengths: list[int] | None = None,
    node_counts: list[int] | None = None,
    pace_profiles: list[str] | None = None,
    timeout_ms: int = 5000,
    repeats: int = 3,
) -> dict[str, Any]:
    """Full tractability benchmark grid across windows, nodes, and pace profiles."""
    if window_lengths is None:
        window_lengths = [240, 480, 720]
    if node_counts is None:
        node_counts = [8, 16, 24, 32, 48, 64]
    if pace_profiles is None:
        pace_profiles = ["LEISURELY", "BALANCED", "INTENSE"]

    records = []
    for w in window_lengths:
        for n in node_counts:
            for p in pace_profiles:
                for realism in [True, False]:
                    rec = run_single_probe(
                        node_count=n,
                        window_mins=w,
                        pace=p,
                        with_realism=realism,
                        timeout_ms=timeout_ms,
                        repeats=repeats,
                    )
                    records.append(rec)

    capacity_table = derive_tractable_nodes_table(records, max_p95_ms=500.0)
    return {
        "records": records,
        "capacity_table": capacity_table,
    }
