# Paladio Agency-Grade Itinerary Implementation: Plan & Checkpoint Log

## Current Checkpoint Status
- **Current Phase**: All Phases Completed (Phases 0 through 8 Completed & Verified)
- **Current Step**: Complete. Golden Set Multi-City Probe 100% Passing (12/12 runs PASS across Madrid, Porto, Paris, Tokyo)
- **Last Completed Phase**: Phase 8 — End-to-End Cutover, Golden Set CI & Legacy Cleanup (Completed & Verified)
- **Active Invariants**:
  1. 100% self-hosted & air-gappable. No external cloud LLMs for optimization.
  2. Zero hardcoded city data (no city name tables, no hardcoded coordinates, no city-specific keywords).
  3. Prompt- and Taste-Driven (user preferences, tag affinities, and prompt vibes dictate POI selection; no forced museum bias).
  4. C++20 combinatorial core (`paladio_core`), sub-50ms target.
  5. Fail-fast honesty: no silent fallbacks to arbitrary estimates or synthetic venues.

---

## Phase Status Overview

| Phase | Description | Status | Verification / Gate |
|---|---|---|---|
| **Phase 0** | Baseline Quality Metrics & Safety Net | 🟢 Completed | Realism metrics script runs on Madrid & Porto trips |
| **Phase 1** | City Profile & Elimination of Hardcoded City Data | 🟢 Completed | Zero city tables/constants in backend; DB city table active |
| **Phase 2** | User Prompt & Taste Semantic Engine + Taxonomy Fixes | 🟢 Completed | Nightlife/views prompt selects bars/views, not museums; category_id aligned |
| **Phase 3** | Data-Driven Local Day Rhythm & Dining Windows | 🟢 Completed | Meal windows derived from local venue hours; dinner on by default |
| **Phase 4** | Taste-Aware Spatial Zone Partitioner | 🟢 Completed | Dynamic bundling scale, taste seeds, sprawl penalty, surplus zone candidates |
| **Phase 5** | Full-Day C++ Sights Orienteering (20-35 candidates/day) | 🟢 Completed | C++ solves 20-35 candidates with virtual meals; days span to evening |
| **Phase 6** | Dynamic Corridor Meal Snapping + Verification Loop | 🟢 Completed | Real lunch & dinner snapped within corridor + 1 backup; fail-fast verified |
| **Phase 7** | Real Routing Service & Fail-Fast Hardening | 🟢 Completed | Async Valhalla routing; no silent haversine fallbacks; honest fares |
| **Phase 8** | End-to-End Cutover, Golden Set CI & Legacy Cleanup | 🟢 Completed | Full regression passed (73/73 tests); Golden set 100% pass (12/12) |

---

## Phase 0: Baseline Quality Metrics & Safety Net (Completed)
- [x] **Step 0.1**: Implement `backend/app/quality/itinerary_metrics.py` to evaluate day span, ping-pong zigzag ratio, meal spacing, synthetic venues, and gate compliance. Unit test `test_itinerary_metrics.py` passing (2/2).
- [x] **Step 0.2**: Run metrics script on the 3 saved database trips and record baseline scorecards:
  * **Madrid #1 (1ac367cb)**: Realism 5.0/10.0, FAILED (11 synthetic venues, mean zigzag 1.58, Day 5 starved with 0 sights).
  * **Porto (9147115a)**: Realism 4.5/10.0, FAILED (15 synthetic venues, mean zigzag 2.00, overloaded days up to 11 sights).
  * **Madrid #2 (3b949dba)**: Realism 5.0/10.0, FAILED (4/4 full days ended early at 14:47-16:01 with no dinner, mean zigzag 1.79).
- [x] **Step 0.3**: Confirm production path vs v2 path unification plan: production currently branches through legacy solver, v2 pipeline exists and will be cut over in Phase 8.

---

## Phase 1: City Table & Elimination of Hardcoded City Data (Completed)
- [x] **Step 1.1**: Alembic migration `5e6f7a8b9c0d_add_cities_table_and_city_id_to_attractions.py` created and applied.
  * Created `cities` table (`id`, `name`, `aliases`, `country_code`, `center_lat`, `center_lon`, `bbox`, `radius_km`, `timezone`, `currency`, `profile`, `ingested_at`, `created_at`, `updated_at`).
  * Added `city_id` foreign key column and index to `attractions`.
  * Backfilled 2,585 attractions across all 12 existing cities with exact centroids, bboxes, timezones, and currencies.
- [x] **Step 1.2**: Created `City` domain entity (`app/domain/entities/city.py`) and `CityModel` (`app/db/models.py`).
- [x] **Step 1.3**: Implemented `ICityRepository` port and `SqlCityRepository` adapter with case-insensitive name and alias matching (`test_city_repository.py` passing).
- [x] **Step 1.4**: Standard ISO reference dataset for country-to-currency created (`app/domain/reference/iso_currencies.py`). Offline `TimezoneFinder` integrated.
- [x] **Step 1.5**: Replaced process-local `_city_locks` in `city_readiness.py` with distributed PostgreSQL advisory lock (`_distributed_city_lock`). Added `test_city_readiness.py` (passing).
- [x] **Step 1.6**: Eliminated hardcoded city tables across backend:
  * `CITY_DEPOT_COORDINATES` and "Paris" default removed from `trip_frame.py`.
  * `KNOWN_CITY_CENTERS` & `KNOWN_AIRPORT_COORDINATES` removed from `fetch_travel_context.py` & `overpass_provider.py`.
  * `CITY_COUNTRY_MAP` and `_get_fallback_coords` removed from `gtfs_resolver_service.py`.
  * `KNOWN_GEOFABRIK_MAP` and `CITY_REGION_ALIASES` replaced with dynamic spatial point-in-geometry polygon matching in `osm_map_service.py`.
  * `CITY_TIMEZONES` replaced with dynamic city timezone resolution and UTC fallback in `timezone_utils.py`.
  * `REAL_CITY_HOTELS` removed from `mock_tickets.py`.
  * City-specific keyword hardcodes cleaned from `taxonomy.py`.
  * Category ID aligned: `food_culinary` = 4 across taxonomy, tiering, and meals.
  * Hardcoded USD->EUR exchange rate replaced with live dynamic ECB rate service (`currency.py`).

---

## Phase 2: User Prompt & Taste Semantic Engine + Taxonomy Fixes (Completed)
- [x] **Step 2.1**: Refine candidate selection objective in `selection.py` & `candidate_pool.py` to weight user taste vectors and prompt tag affinities dynamically (e.g. prompt specifying "bars, viewpoints, modern architecture" boosts those categories above traditional museums; Tier 1 forced slots blend iconicity and taste and omit low-taste items < 35).
- [x] **Step 2.2**: Audit and verify taxonomy tag-first classification: structured OSM tags take precedence over name heuristics, and unclassified venues safely return `("unknown", 255)` without defaulting arbitrarily to `art_culture`.
- [x] **Step 2.3**: Verify Python↔C++ category IDs agreement in unit tests (0..7 inside 0..15 histogram range, unknown sentinel 255).

---

## Phase 3: Data-Driven Local Day Rhythm & Dining Windows (Completed)
- [x] **Step 3.1**: Compute `RhythmProfile` (lunch peak, dinner peak, evening cutoff) dynamically from ingested dining-venue opening-hours distributions, replacing static meal windows (`rhythm.py`, `meals.py`, `pipeline.py`).
- [x] **Step 3.2**: Enable dinner by default for full days in `trip_frame.py` (lunch + dinner standard), extending day end time to evening cutoff.
- [x] **Step 3.3**: Ensure circadian meal constraints respect local rhythm windows in day planning and solver (`struct_mapper.py`, `solver.py`, `test_v2_rhythm.py`).

---

## Phase 4: Taste-Aware Spatial Zone Partitioner (Completed)
- [x] **Step 4.1**: Compute dynamic city-scale bundling threshold (`compute_dynamic_bundling_threshold`) from intra-candidate distance distribution (0.20-0.60 km), replacing static 0.35 km.
- [x] **Step 4.2**: Taste-weighted anchor seeds (`_select_anchor_seeds`) prioritizing user-taste aligned POIs for day anchors. Sprawl-controlled Regret-2 insertion with diameter penalty (>2.8 km) and taxonomy coherence bonus in `_calculate_insertion_cost`.
- [x] **Step 4.3**: Hotel/depot proximity Hungarian matching for arrival and departure days, plus population of 15-20 `zone_candidates` per day in `assign_pois_to_days` for full-day solver orienteering (`test_v2_day_assignment.py` passing 12/12).

---

## Phase 5: Full-Day C++ Sights Orienteering (20-35 candidates/day) (Completed)
- [x] **Step 5.1**: Feed candidate pool of 20-35 POIs per day (primary assigned POIs + surplus zone candidates) into C++ solver (`paladio_core`), replacing the starving 3-5 POI input.
- [x] **Step 5.2**: Inject virtual meal nodes with zero transit to/from candidate nodes using `RhythmProfile` windows so circadian meal solver schedules lunch and dinner seamlessly without artificial transit detours.
- [x] **Step 5.3**: Enforce fail-fast honesty on mandatory infeasibility (surfacing actionable errors instead of silent demotion).

---

## Phase 6: Dynamic Corridor Meal Snapping + Verification Loop (Completed)
- [x] **Step 6.1**: Implement `snap_corridor_meals` in `backend/app/engine/v2/meals.py`:
  * Snaps virtual meal slots along travel corridor between predecessor and successor sights.
  * Filters open real dining venues within detour radius (<1.5 km); ranks by taste, quality, preferred cuisines, and detour.
  * Attaches top-1 as primary `Poi` (with `cost_source="real_poi"`) and top-2 as `backup_poi`.
  * If no dining venue open along corridor, records honest `shortfall_notice` without synthesizing fake venues.
- [x] **Step 6.2**: Implement `verify_day_schedule` in `backend/app/engine/v2/meals.py`:
  * Sequential timeline recomputation with transit durations and opening hour clamps.
  * Automatic fallback swap to `backup_poi` if primary meal venue closes before visit ends.
  * Raises typed `ItineraryInfeasible` if mandatory sights close or schedules are impossible.
- [x] **Step 6.3**: Hook meal snapping and verification into `solve_day_v2` in `solver.py` and verify all tests pass (56/56 passing in mock and real C++ core).

---

## Phase 7: Real Routing Service & Fail-Fast Hardening (Completed)
- [x] **Step 7.1**: Audit and refactor `transit_matrix.py` and routing calls:
  * Ensure Valhalla is queried directly for matrix computation without silent haversine fallback unless explicitly requested via `plan_mode="estimated"`.
  * Raise typed `RoutingUnavailable` when Valhalla is unreachable in default plan mode.
  * Remove silent 30-min / 20-min dummy fallback durations on unreachable pairs; set infinite/infeasible (e.g. 9999 or raise error).
- [x] **Step 7.2**: Fares and transit honesty:
  * Remove hardcoded 2.00 EUR fallback in transit fare calculation; label `fare_unknown` when GTFS fare tables are missing.
  * Enforce per-city currency from the city table.
- [x] **Step 7.3**: Eliminate bare `except Exception` swallows and ensure typed error propagation.

---

## Phase 8: End-to-End Cutover, Golden Set CI & Legacy Cleanup (Completed)
- [x] **Step 8.1**: Connect production endpoint / use-case (`optimize_daily_itinerary.py`) to v2 pipeline with real hotel depot and flight anchors. (Completed & Verified).
- [x] **Step 8.2**: Clean up legacy seeds and obsolete hardcoded paths (YAML seeds removed, mock ticket fallbacks eliminated, single-day C++ adapter preserved for bench/websockets). (Completed & Verified).
- [x] **Step 8.3**: Run quality evaluation probe over golden set (Madrid, Porto, Paris, Tokyo); verify all quality gates pass and realism score >= 8.0/10. (Completed & Verified: 12/12 runs PASS across Madrid, Porto, Paris, Tokyo for leisure_couple, weekend, and balanced_family; Madrid realism score 8.6/10; days span until dinner at 21:00-24:00 with zero synthetic venues).

---

## Resumption Instructions
If context resets or session ends, inspect this file immediately:
1. Check **Current Phase** and **Current Step** above.
2. Run pinpoint unit test: `pytest <relevant_test_file> -k <test_name> -q`.
3. Continue directly with the next unchecked box.
