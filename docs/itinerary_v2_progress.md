# Paladio Itinerary v2: Progress Log

## Status Overview
| Phase | Title | Status | Bench Results | Notes / Deviations |
|---|---|---|---|---|
| Phase 0 | Audit & Plan | Done | N/A | Completed. Identified zero-review DB state, 64 magic number, monotony halving. |
| Phase 1 | Baseline & Bench CLI | In Progress | Ready for runner | Bench metrics, tractability probe, fixtures & scenarios built & tested (13/13 green). |
| Phase 5a | C++ Extension | Queued | Pending | category_id, arrival_times, nodes_expanded, max_nodes_expanded. |
| Phase 2a | Data Model & Tiering | Queued | Pending | Alembic migration, taxonomy, seed YAMLs, poi_travel_cache. |
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
- **Phase 1 Progress**:
  - `app/bench/metrics.py`: Zigzag ratio (2-opt), Tier 1 recall, closures, meal spacing, idle time, category entropy, load variance.
  - `app/bench/tractability.py`: Synthetic solver probe and capacity table generator.
  - `app/bench/scenarios.py`: Scenario matrix generator and constraint builder.
  - `tests/fixtures/bench_pois.json`: 123 real DB POIs across Paris, Madrid, Lisbon with 18 Tier 1 seeds and meal slots.
  - Unit tests: 13/13 passing (`test_itinerary_bench_metrics.py`, `test_tractability.py`, `test_bench_scenarios.py`).

