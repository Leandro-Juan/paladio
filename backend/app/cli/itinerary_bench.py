import argparse
import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from app.bench.runner import run_baseline_benchmark_matrix
from app.bench.scenarios import get_scenario_matrix
from app.bench.tractability import run_tractability_benchmark

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("itinerary_bench")

DEFAULT_BASELINE_OUTPUT = (
    Path(__file__).resolve().parent.parent.parent
    / "tests"
    / "fixtures"
    / "baseline_legacy_itinerary_bench.json"
)
DEFAULT_CAPACITY_OUTPUT = (
    Path(__file__).resolve().parent.parent.parent
    / "tests"
    / "fixtures"
    / "tractability_capacity_table.json"
)


def _print_table(title: str, headers: list[str], rows: list[list[Any]]):
    print(f"\n=== {title} ===")
    widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            widths[i] = max(widths[i], len(str(val)))
    row_format = " | ".join(f"{{:<{w}}}" for w in widths)
    separator = "-+-".join("-" * w for w in widths)
    print(row_format.format(*headers))
    print(separator)
    for row in rows:
        print(row_format.format(*row))
    print()


async def main_async() -> int:
    parser = argparse.ArgumentParser(description="Paladio Itinerary Benchmark Harness")
    parser.add_argument(
        "--mode",
        choices=["baseline", "tractability", "compare"],
        default="baseline",
        help="Benchmark execution mode",
    )
    parser.add_argument(
        "--cities",
        type=str,
        default="Paris,Madrid,Lisbon",
        help="Comma-separated cities",
    )
    parser.add_argument(
        "--durations",
        type=str,
        default="1,3,5,7,14",
        help="Comma-separated trip durations (days)",
    )
    parser.add_argument(
        "--paces",
        type=str,
        default="LEISURELY,BALANCED,INTENSE",
        help="Comma-separated pace preferences",
    )
    parser.add_argument(
        "--profiles",
        type=str,
        default="culture,food,general",
        help="Comma-separated taste profiles",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_BASELINE_OUTPUT),
        help="Path to save baseline results JSON",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run lightweight quick benchmark for smoke testing",
    )
    args = parser.parse_args()

    if args.mode == "tractability":
        logger.info("Starting Solver Tractability Benchmark...")
        if args.quick:
            windows = [240, 480]
            nodes = [8, 16, 24]
            paces = ["BALANCED"]
            repeats = 1
        else:
            windows = [240, 480, 720]
            nodes = [8, 16, 24, 32, 48, 64]
            paces = ["LEISURELY", "BALANCED", "INTENSE"]
            repeats = 3

        bench_res = run_tractability_benchmark(
            window_lengths=windows,
            node_counts=nodes,
            pace_profiles=paces,
            timeout_ms=5000,
            repeats=repeats,
        )

        cap_table = bench_res["capacity_table"]
        logger.info(f"Derived Tractable Nodes Capacity Table: {cap_table}")

        rows = [[f"{w}m ({w // 60}h)", cap] for w, cap in cap_table.items()]
        _print_table(
            "Tractable Capacity Table",
            ["Window Length", "Max Tractable Nodes (<500ms)"],
            rows,
        )

        cap_path = Path(DEFAULT_CAPACITY_OUTPUT)
        cap_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cap_path, "w", encoding="utf-8") as f:
            json.dump(bench_res, f, indent=2)
        logger.info(f"Tractability benchmark saved to {cap_path}")
        return 0

    elif args.mode == "baseline":
        cities = [c.strip() for c in args.cities.split(",") if c.strip()]
        durations = [int(d.strip()) for d in args.durations.split(",") if d.strip()]
        paces = [p.strip() for p in args.paces.split(",") if p.strip()]
        profiles = [pr.strip() for pr in args.profiles.split(",") if pr.strip()]

        if args.quick:
            cities = cities[:1]
            durations = [2]
            paces = ["BALANCED"]
            profiles = ["culture"]

        scenarios = get_scenario_matrix(
            cities=cities,
            durations=durations,
            paces=paces,
            profiles=profiles,
        )
        logger.info(
            f"Running Baseline Benchmark on {len(scenarios)} scenarios across 2 modes (as_is, no_monotony)..."
        )

        bench_data = await run_baseline_benchmark_matrix(
            scenarios=scenarios,
            baseline_modes=["as_is", "no_monotony"],
        )

        # Print summaries comparison
        summaries = bench_data["summaries"]
        metrics_keys = [
            ("total_scenarios", "Scenarios"),
            ("mean_tier_1_recall", "Tier 1 Recall"),
            ("mean_user_mandatory_satisfaction", "Mandatory Sat."),
            ("total_closure_violations", "Closure Violations"),
            ("total_node_cap_violations", "Node Cap Viols"),
            ("mean_zigzag_ratio", "Zigzag Ratio"),
            ("mean_travel_minutes_per_day", "Travel Mins/Day"),
            ("mean_load_variance", "Load Variance"),
            ("mean_category_entropy", "Category Entropy"),
            ("total_budget_overruns", "Budget Overruns"),
            ("total_meal_spacing_violations", "Meal Spacing Viols"),
            ("total_idle_time_violations", "Idle Time Viols"),
            ("latency_p50_ms", "Latency p50 (ms)"),
            ("latency_p95_ms", "Latency p95 (ms)"),
        ]

        table_rows = []
        for key, label in metrics_keys:
            val_as_is = summaries.get("as_is", {}).get(key, "-")
            val_no_mono = summaries.get("no_monotony", {}).get(key, "-")
            table_rows.append([label, val_as_is, val_no_mono])

        _print_table(
            "Baseline Benchmark Comparison (Legacy Pipeline)",
            ["Metric", "Baseline A (As-Is)", "Baseline B (No Monotony)"],
            table_rows,
        )

        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(bench_data, f, indent=2)
        logger.info(f"Baseline benchmark saved to {out_path}")
        return 0

    return 0


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
