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
DEFAULT_COMPARISON_OUTPUT = (
    Path(__file__).resolve().parent.parent.parent
    / "tests"
    / "fixtures"
    / "v2_comparison_bench.json"
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
        default=None,
        help="Path to save results JSON (defaults to mode-specific fixture path)",
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

        out_path = Path(args.output or DEFAULT_BASELINE_OUTPUT)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(bench_data, f, indent=2)
        logger.info(f"Baseline benchmark saved to {out_path}")
        return 0

    elif args.mode == "compare":
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
        logger.info(f"Running Itinerary v2 Comparison on {len(scenarios)} scenarios...")

        # 1. Run v2 benchmark
        v2_data = await run_baseline_benchmark_matrix(
            scenarios=scenarios,
            baseline_modes=["v2"],
        )

        # 2. Load existing baseline summaries if available
        baseline_path = DEFAULT_BASELINE_OUTPUT
        legacy_summaries: dict[str, Any] = {}
        if baseline_path.exists():
            try:
                with open(baseline_path, "r", encoding="utf-8") as f:
                    legacy_data = json.load(f)
                    legacy_summaries = legacy_data.get("summaries", {})
            except Exception as e:
                logger.warning(
                    f"Could not load legacy baseline from {baseline_path}: {e}"
                )

        # Combine results
        combined_summaries = {
            "as_is": legacy_summaries.get("as_is", {}),
            "no_monotony": legacy_summaries.get("no_monotony", {}),
            "v2": v2_data.get("summaries", {}).get("v2", {}),
        }

        metrics_keys = [
            ("total_scenarios", "Total Scenarios", "{:.0f}"),
            ("mean_tier_1_recall", "Tier 1 Recall", "{:.1%}"),
            ("mean_user_mandatory_satisfaction", "Mandatory Satisfaction", "{:.1%}"),
            ("total_closure_violations", "Closure Violations", "{:.0f}"),
            ("total_node_cap_violations", "Node Cap Violations", "{:.0f}"),
            ("mean_zigzag_ratio", "Zigzag Ratio", "{:.3f}"),
            ("mean_travel_minutes_per_day", "Travel Mins/Day", "{:.1f}"),
            ("mean_load_variance", "Load Variance", "{:.1f}"),
            ("mean_category_entropy", "Category Entropy", "{:.3f}"),
            ("total_budget_overruns", "Budget Overruns", "{:.0f}"),
            ("total_meal_spacing_violations", "Meal Spacing Violations", "{:.0f}"),
            ("total_idle_time_violations", "Idle Time Violations (>45m)", "{:.0f}"),
            ("latency_p50_ms", "Latency p50 (ms)", "{:.1f}"),
            ("latency_p95_ms", "Latency p95 (ms)", "{:.1f}"),
        ]

        table_rows = []
        for key, label, fmt in metrics_keys:
            val_as_is = combined_summaries["as_is"].get(key, "-")
            val_no_mono = combined_summaries["no_monotony"].get(key, "-")
            val_v2 = combined_summaries["v2"].get(key, "-")

            s_as_is = (
                fmt.format(val_as_is)
                if isinstance(val_as_is, (int, float))
                else str(val_as_is)
            )
            s_no_mono = (
                fmt.format(val_no_mono)
                if isinstance(val_no_mono, (int, float))
                else str(val_no_mono)
            )
            s_v2 = (
                fmt.format(val_v2) if isinstance(val_v2, (int, float)) else str(val_v2)
            )

            # Calculate improvement vs as_is
            impr_str = "-"
            if isinstance(val_as_is, (int, float)) and isinstance(val_v2, (int, float)):
                if key in ("mean_tier_1_recall", "mean_user_mandatory_satisfaction"):
                    diff = val_v2 - val_as_is
                    impr_str = f"+{diff:.1%}" if diff >= 0 else f"{diff:.1%}"
                elif key in (
                    "total_closure_violations",
                    "total_idle_time_violations",
                    "total_meal_spacing_violations",
                    "total_node_cap_violations",
                ):
                    diff = val_as_is - val_v2
                    impr_str = (
                        f"-{diff:.0f} (fixed)"
                        if diff > 0
                        else ("0" if diff == 0 else f"+{-diff:.0f}")
                    )
                elif key in ("mean_zigzag_ratio", "mean_load_variance"):
                    pct = (
                        ((val_as_is - val_v2) / val_as_is * 100.0)
                        if val_as_is > 0
                        else 0.0
                    )
                    impr_str = f"-{pct:.1f}%" if pct > 0 else f"+{-pct:.1f}%"
                elif key in ("latency_p50_ms", "latency_p95_ms"):
                    pct = (
                        ((val_as_is - val_v2) / val_as_is * 100.0)
                        if val_as_is > 0
                        else 0.0
                    )
                    impr_str = f"-{pct:.1f}% faster" if pct > 0 else f"+{-pct:.1f}%"

            table_rows.append([label, s_as_is, s_no_mono, s_v2, impr_str])

        _print_table(
            "Itinerary Pipeline Benchmark: Legacy vs V2 Architecture",
            [
                "Metric",
                "As-Is (Legacy)",
                "No Monotony",
                "Itinerary v2",
                "Improvement vs As-Is",
            ],
            table_rows,
        )

        out_path = Path(args.output or DEFAULT_COMPARISON_OUTPUT)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        comparison_data = {
            "summaries": combined_summaries,
            "v2_results": v2_data.get("results", {}).get("v2", []),
        }
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(comparison_data, f, indent=2)
        logger.info(f"Comparison benchmark saved to {out_path}")
        return 0

    return 0


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
