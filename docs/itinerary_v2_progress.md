# Paladio Itinerary v2: Progress Log

## Status Overview
| Phase | Title | Status | Bench Results | Notes / Deviations |
|---|---|---|---|---|
| Phase 0 | Audit & Plan | Done | N/A | Completed. Identified zero-review DB state, 64 magic number, monotony halving. |
| Phase 1 | Baseline & Bench CLI | Done | T1: 31.1%, Mand: 53.3%, Zigzag: 1.48/1.56, Closures: 72 | 135 scenarios evaluated across as_is & no_monotony. Fixtures saved. |
| Phase 5a | C++ Extension | Done | All 64-node tests <500ms, GTest 18/18, PyTest 8/8 | category_id, arrival_times, nodes_expanded, max_nodes_expanded, timed_out. |
| Phase 2a | Data Model & Tiering | Done | DB: 33 T1, 141 T2, 422 T3 | Migration 4d5e6f7a8b9c, 64 seeds across 5 cities, 8-cat taxonomy, poi_travel_cache. |
| Phase 3 | Selection (Trip Frame & Pool) | Done | Paris 7/7 slots, 100% mand, 5 T1 | TripFrame, candidate pool, submodular greedy selector, reason codes. |
| Phase 4 | Day Assignment | Done | Paris 8 POIs, 3 days, 0 closures, load var 950 | Capacitated insertion, local search, Hungarian matching, walking bundles. |
| Phase 5b | Integration & Full Bench | Done | 135 scen: T1 72.2% (vs 31.1), Mand 86.7% (vs 53.3), Closures 0 (vs 72), LoadVar 5732 (vs 26541), Idle>45m 189 (vs 198), p50 8.7ms (vs 228) | Sequential solve (pybind11 numpy-guard deadlock under threads), slack roll-forward, TransitLeg attach, closed-on-trip-dates prefilter. Open: idle violations, mandatory sat. on 1-day flight-shrunk trips, zigzag 1.79. |
| Cutover | Single Cutover | Done | Tests 36/36 passing | Rewired FetchTravelContextUseCase to v2 pipeline, deleted ClusterSelector. |
| Phase 6 | Refinement Loop | Done | Tests 35/35 passing | LangGraph critic/repair wired: evaluate_itinerary_quality, apply_repairs, route_critic (<=3 iterations). |
| Phase 7 | Explainable Output | Done | Tests 41/41 passing | Daily themes, anchor tracking, assumptions, Tier badges in TripTimeline frontend. |
| Phase 2b | Progressive Enrichment | Done | CLI verified on DB | Offline OSM/Wikidata fame signals extraction and walking bundle detection CLI (`app.cli.enrich_pois`). |

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
- **Phase 2a Complete**:
  - `backend/migrations/versions/4d5e6f7a8b9c_add_itinerary_v2_tiering_and_travel_cache.py`: Applied migration adding `tier`, `tier_confidence`, `tier_source`, `iconicity_score`, `taxonomy_category`, `category_id`, `visit_mode`, `(city, tier)` index, and `poi_travel_cache` table.
  - `backend/app/db/models.py`: Updated `AttractionModel` and added `PoiTravelCacheModel`.
  - `backend/app/schemas/itinerary.py`: Added `pace: PacePreference = PacePreference.BALANCED` to `TravelConstraints`.
  - `backend/app/data/city_seeds/`: Created curated seed YAMLs for Paris (15 seeds), Madrid (13 seeds), Lisbon (12 seeds), Porto (11 seeds), Tokyo (13 seeds) with 100% real DB POI match.
  - `docs/itinerary_v2_seed_review.md`: Documented seed vetting and coverage statistics.
  - `backend/app/engine/v2/taxonomy.py`: Implemented canonical 8-category mapping matching C++ category IDs (0-7).
  - `backend/app/engine/v2/tiering.py`: Implemented `CitySeedStore`, curated lookup, and bounded heuristic fallback.
  - `backend/app/adapters/repositories/sql_poi_travel_cache_repository.py`: Implemented batch fetch and upsert for pairwise travel times.
  - `backend/cli/tier_pois.py`: Hydrated all 596 DB attractions (33 Tier 1, 141 Tier 2, 422 Tier 3).
  - Unit tests: `backend/tests/test_v2_tiering_taxonomy.py` (8/8 passing). Total test suite (20/20 passing).
- **Phase 3 Complete**:
  - `backend/app/engine/v2/trip_frame.py`: Implemented `DayFrame` and `TripFrame` with pace utilization targets, arrival (+120m) and departure (-180m) flight window buffers, daily budget pro-rata share, and standard FX conversion.
  - `backend/app/engine/v2/candidate_pool.py`: Implemented `build_candidate_pool` guaranteeing 100% of Tier 1 & 2 POIs, expanding with semantic pgvector matches, and tagging explicit user-mandatories and meal spots.
  - `backend/app/engine/v2/selection.py`: Implemented deterministic submodular greedy selection maximizing $J_{\text{marginal}} = \text{taste} + \text{tier\_bonus} - \lambda_1 \text{cosine} - \lambda_2 \text{taxonomy} - \lambda_3 \text{time}$, with visit mode downgrading and typed reason codes for all selected and dropped items.
  - `backend/app/domain/entities/poi.py` & `sql_poi_repository.py`: Added v2 fields to `Poi` domain entity and added `find_tiered_pois` to repository.
  - Unit tests: `backend/tests/test_v2_selection.py` (8/8 passing). Total test suite (28/28 passing).
- **Phase 4 Complete**:
  - `backend/app/engine/v2/day_assignment.py`: Implemented walking proximity bundling (<=350m super-nodes), farthest-point anchor seed initialization, regret-2 insertion balancing active duration and node caps with trip closure feasibility checks, local search refinement (relocation/swap) evaluating shared objective J, Hungarian bipartite matching (`scipy.optimize.linear_sum_assignment`) with +10000 closure penalty guaranteeing zero closure violations and light arrival/departure matching, explainable daily themes, and effective time window intersection.
  - Safe handling of edge cases (fewer POIs than days, padding empty clusters up to K).
  - Unit tests: `backend/tests/test_v2_day_assignment.py` (7/7 passing). Total v2 test suite (23/23 passing).
- **Cutover Complete**:
  - Rewired `FetchTravelContextUseCase` to execute Itinerary v2 (`select_trip_pois` + `assign_pois_to_days`).
  - Safely eliminated legacy `ClusterSelector`.
- **Phase 6 Complete**:
  - Implemented `planner_critic_node`, `planner_repair_node`, and `route_critic` loop (<=3 iterations) in LangGraph engine.
  - Deterministically evaluates pacing, meal gaps, excessive transit, and applies targeted meal insertions or relocations.
- **Phase 7 Complete**:
  - Added explainable daily themes, anchor tracking, and assumptions in `OptimizeDailyItineraryUseCase`.
  - Added Tier 1 / Tier 2 visual badge indicators and theme rendering in `TripTimeline.tsx` and domain schemas.
- **Universal Cities & Multi-Scale Calibration**:
  - Live Overpass API ingest: configured fast, reliable endpoints (`lz4.overpass-api.de`, `z.overpass-api.de`, `overpass.osm.ch`), fixed Overpass QL tag queries, and reduced timeout to prevent hung requests.
  - Selective hydration: `ensure_city_ready` only fetches missing sights or missing dining if a city already has one of them, speeding up cached city readiness to <0.1s.
  - Scaled category saturation penalty in `select_trip_pois`: normalized by trip duration so multi-day trips cleanly select full anchor sets (18-25 sights).
  - Meal deadline calibration in `struct_mapper.py` and `solver.py`: default daytime itineraries strictly enforce lunch deadline (11:30–15:00) without forcing nighttime dinner deadlines on early-finishing tours; closed meal spots marked unreachable; increased solver `max_idle_time` tolerance to 120m to handle early-morning sights before lunch openings.
  - Multi-scale quality probe (`app.cli.city_quality_probe`): verified 20/20 PASS across 5 representative cities (Bruges, Cuenca, Oxford, Porto, Tokyo) and 4 traveler plans (`leisure_couple`, `balanced_family`, `intense_culture`, `weekend`) in sub-second per-scenario solve times.
  - End-to-end un-ingested city test: verified 3/3 PASS on **Salzburg, Austria** with 100% autonomous OSM geocoding, live attraction and dining ingest, relative iconicity tiering, and C++20 scheduling.
