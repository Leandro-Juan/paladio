# Paladio Itinerary v2: Consolidated Plan (Source of Truth)

## 1. Goal & Boundaries
Replace POI selection and day clustering in Paladio with a deterministic travel-agency-grade pipeline. Legacy selection/clustering code (`ClusterSelector`, legacy use-case logic) remains untouched until Phase 5 cutover, then deleted.
- **Stays**: PostgreSQL pgvector retrieval, MLScorer/HybridSovereignScorer ([0,100]), HITL/guardrail nodes, Valhalla transit matrix, paladio_core per-day solver, WebSocket telemetry, test_mode path.
- **Replaced**: Internals of `FetchTravelContextUseCase` and `OptimizeDailyItineraryUseCase`.
- **Invariants**: 100% self-hosted, air-gappable, NO cloud LLMs, local LLM for offline extraction only. State changes ADDITIVE ONLY. Solver node cap <= 64. Deterministic objective function $J$.

## 2. Target Architecture (8 Stages)
1. **Trip Frame**: `DayFrame` per calendar day (depot coordinates, shrunk arrival/departure windows with airport/flight buffers, pace utilization target & max anchors/day, meal requests, daily budget share).
2. **Candidate Pool**: pgvector taste retrieval (3-5x needed) + 100% Tier 1/2 city POIs + meal candidate spots. Must-sees never depend on retrieval luck.
3. **Trip-Level Selection**:
   - Forced set: User-mandatories first, then Tier 1 by iconicity capped at ~55% anchor slots.
   - Submodular greedy fill: $J_{\text{marginal}} = \text{taste} + \text{tier\_bonus} - \lambda_1 \text{cosine} - \lambda_2 \text{taxonomy} - \lambda_3 \text{time}$.
   - Downgrade visit mode before drop; every drop/downgrade gets a typed reason code.
4. **Day Assignment**:
   - Contract bundles into super-nodes. Seeds = anchors via farthest-point / k-medoids on travel matrix.
   - Regret-based insertion under daily time & node caps with penalty for closed days and distance.
   - Local search (relocate/swap/ejection) on shared $J$.
   - Hungarian matching (`scipy.optimize.linear_sum_assignment`) to calendar days (closed days respected, lightest on arrival/departure).
   - Time window intersection: opening hours $\cap$ best_time_of_day.
5. **Budget Allocation**: Pro-rata split by expected day cost, single FX conversion function, re-solve budget-limited days with unspent slack.
6. **Per-Day Solve (`paladio_core`)**:
   - Nodes: start/end depot, committed POIs, small reserve, 3-4 meal candidates per requested slot.
   - Feasibility probe on mandatory nodes before setting `is_mandatory=True`.
   - Multi-day thread-pool execution (`asyncio.to_thread` / C++ releases GIL).
   - Dropped POIs re-inserted into slack days or recorded with reason.
7. **Refinement Loop**: LangGraph loop (`planner_optimize -> planner_critic -> planner_repair`). Pure state functions. Emits typed issues. Accepts repair if $J_{\text{new}} > J_{\text{current}}$, terminates if no gain or `iteration >= 3`. Explicit `recursion_limit`.
8. **Explainable Output**: Additive fields in `final_itinerary` (daily theme, POI reasons, dropped list, transparent assumptions).

## 3. Approved Amendments
- **A1 (Phase 1 Baselines)**: Produce TWO baselines: legacy as-is, and legacy with monotony disabled (monotony_threshold=50). Exclude demo seed rows (reviews=1000). Add "candidate pool exhausted" metric. Align with `itinerary-realism-validator`.
- **A2 (Phase 2a Data & Tiering)**: Review DB POIs per city before writing seeds. Draft YAML seeds for matched POIs only (`tier_source="seed"`). Write to `docs/itinerary_v2_seed_review.md`. Heuristic fallback (duration, centrality, OSM tags) with `tier_confidence="low"`. Taxonomy: 8-category argmax cosine with radar anchors + YAML override. Option B writes ONLY to `iconicity_score`.
- **A3 (Meals & Scorer Quality)**: Document how meal candidates enter pipeline. For cities with rating=0/reviews=0, taste is pure semantic similarity; calibrate prize accordingly.
- **A4 (Phase 5a Execution Order)**: Run Phase 5a (C++ extension) right after Phase 1 and before Phase 2a/3. Add `uint8_t category_id` (default 255), `arrival_times`, `nodes_expanded`, `timed_out` to `OptimizationResult`, `max_nodes_expanded` to `OptimizationConfig`. Zero-heap allocation in hot loop. Re-run tractability benchmark.
- **A5 (Travel Cache)**: Use `poi_travel_cache` or Haversine proxies for selection/assignment; Valhalla for per-day solve (~35 nodes).
- **A6 (Budget FX)**: Single conversion function; no new online calls.
- **A7 (Hungarian)**: `scipy.optimize.linear_sum_assignment`.
- **A8 (Skills)**: Follow per-phase skill reading schedule and code-reviewer pass at each phase end.

## 4. Execution Sequence & Stop Conditions
1. Phase 1 - Baselines + Bench + Tractability Probe
2. Phase 5a - C++ Extension + Re-run Tractability
3. Phase 2a - Schema (Alembic), Taxonomy, Seeds, Tiering, `poi_travel_cache`
4. Phase 3 - Trip Frame, Candidate Pool, Submodular Selection
5. Phase 4 - Day Assignment + Integrated test of 3+4
6. Phase 5b - Budget, Meals, Feasibility Probe, Thread Pool, Use Arrival Times, Bench vs Baselines
7. **STOP #1 (Pre-cutover)**: Deliver `docs/itinerary_v2_cutover_report.md` (bench comparison, 6 side-by-side itineraries, seed review link, realism conflicts). Await user approval.
8. Single Cutover: Rewire use cases to v2, delete legacy selection/clustering.
9. Phase 6 - LangGraph Refinement Loop
10. Phase 7 - Explainable Output & Frontend Wire-up
11. Phase 2b - Offline Enrichment (Wikidata, Wikipedia, OSM, Local LLM)
