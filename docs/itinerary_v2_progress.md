# Paladio Itinerary v2: Progress Log

## Status Overview
| Phase | Title | Status | Bench Results | Notes / Deviations |
|---|---|---|---|---|
| Phase 0 | Audit & Plan | Done | N/A | Completed. Identified zero-review DB state, 64 magic number, monotony halving. |
| Phase 1 | Baseline & Bench CLI | Done | T1: 31.1%, Mand: 53.3%, Zigzag: 1.48/1.56, Closures: 72 | 135 scenarios evaluated across as_is & no_monotony. Fixtures saved. |
| Phase 5a | C++ Extension | Done | All 64-node tests <500ms, GTest 18/18, PyTest 8/8 | category_id, arrival_times, nodes_expanded, max_nodes_expanded, timed_out. |
| Phase 2a | Data Model & Tiering | In Progress | Pending | Alembic migration, taxonomy, seed YAMLs, poi_travel_cache. |
| Phase 3 | Selection (Trip Frame & Pool) | Queued | Pending | Submodular selector, reason codes. |
| Phase 4 | Day Assignment | Queued | Pending | Capacitated insertion, local search, Hungarian matching. |
| Phase 5b | Integration & Full Bench | Queued | Pending | Budget, meals, probe, thread-pool, cutover prep. |
| Cutover | Approval Gate (STOP #1) | Queued | Pending | docs/itinerary_v2_cutover_report.md. |
| Phase 6 | Refinement Loop | Queued | Pending | LangGraph critic/repair. |
| Phase 7 | Explainable Output | Queued | Pending | Themes, reason codes, dropped list. |
| Phase 2b | Progressive Enrichment | Queued | Pending | Offline Wikidata/OSM/LLM enrichment. |

## Running Notes & Deviations
- **Phase 0**: Confirmed all attractions in Paris, Tokyo, Lisbon, Madrid, Porto have `reviews: 0` and `rating: 0.0`. Tier 1/2 must rely on curated YAML seeds + fallback heuristic (duration, centrality, OSM tags).
- **Amendment A4**: Phase 5a C++ extension prioritized right after Phase 1.
- **Phase 1 Complete**:
  - `app/bench/metrics.py`: Zigzag ratio (2-opt), Tier 1 recall, closures, meal spacing, idle time, category entropy, load variance.
  - `app/bench/tractability.py`: Synthetic solver probe and capacity table generator (`tests/fixtures/tractability_capacity_table.json`).
  - `app/bench/scenarios.py`: Scenario matrix generator and constraint builder.
  - `app/bench/runner.py`: Single scenario and matrix runner supporting both `as_is` and `no_monotony` baselines with hermetic network mocks. Fixed path items extraction to inspect `itinerary.path`.
  - `app/cli/itinerary_bench.py`: CLI runnable with `--mode baseline`, `--mode tractability`, `--mode compare`.
  - `app/infrastructure/engine/struct_mapper.py` & `bridge_adapter.py`: Added backward-compatible `monotony_threshold` and `monotony_multiplier` parameters.
  - `tests/fixtures/bench_pois.json`: 123 real DB POIs across Paris, Madrid, Lisbon with 18 Tier 1 seeds and meal slots.
  - `tests/fixtures/baseline_legacy_itinerary_bench.json`: Populated with 135 scenarios across both modes.
  - Baseline Summary:
    - Tier 1 Recall: 31.11% (as_is and no_monotony)
    - User Mandatory Satisfaction: 53.33%
    - Closure Violations: 72
    - Mean Zigzag Ratio: 1.478 (as_is), 1.556 (no_monotony)
    - Idle Time Violations (>45m): 198
    - Daily Load Variance: 26,541.0 (as_is), 23,030.0 (no_monotony)
    - Unit tests: 16/16 passing across all bench test suites.
- **Phase 5a Complete**:
  - `cpp_core/include/paladio/engine.hpp`: Added `uint8_t category_id = 255`, `max_nodes_expanded` in `OptimizationConfig`, `arrival_times`, `nodes_expanded`, `timed_out` in `OptimizationResult`.
  - `cpp_core/src/engine.cpp`: Zero dynamic heap allocation in hot loop (fixed `std::array<int, 64> current_arrival_times`, `std::array<uint8_t, 16> taxonomy_visits`), monotonic penalty over taxonomy categories, exact arrival time logging on incumbent best, `nodes_expanded` counter, and `max_nodes_expanded` termination.
  - `cpp_core/src/bindings.cpp` & `paladio_core.pyi`: PyBind11 bindings and type stubs updated with GIL release.
  - `cpp_core/tests/cpp/engine_test.cpp`: Added GTest unit tests for `arrival_times`, `nodes_expanded`, `max_nodes_expanded`, and `category_id` (18/18 passing).
  - `cpp_core/tests/python/test_engine.py`: Added Python unit tests (8/8 passing).
  - `app/infrastructure/engine/struct_mapper.py` & `bridge_adapter.py`: Added direct consumption of `arrival_times`, `nodes_expanded`, `timed_out`, and passing `category_id`.
  - Re-ran tractability probe CLI: verified 64-node capacity table under 500ms across all window sizes.


