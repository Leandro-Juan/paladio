# Comprehensive Codebase Audit Report

**Final Score: 4.5/10**

## Executive Summary

Paladio presents an ambitious hybrid architecture combining a native C++20 branch-and-bound optimization engine (`paladio_core`), a Python FastAPI semantic gateway orchestrating LangGraph multi-agent workflows, and a Next.js 16 / React 19 web interface. The core algorithmic concept—formulating multi-day travel itinerary planning as an Orienteering Problem with Time Windows (OPTW) solved deterministically in C++ with NumPy zero-copy memory buffers—is mathematically sound and high-potential.

However, an exhaustive audit reveals severe engineering liabilities, critical logic bugs, glaring security vulnerabilities, pervasive AI slop, and substantial discrepancies between documentation and runtime implementation:
1. **Critical Security Vulnerabilities**: Plaintext API credentials (`scripts/setup_proxy.py`) committed to source control, host Docker daemon socket (`/var/run/docker.sock`) mounted into Celery worker containers allowing container escape, and insecure wildcard CORS configuration with credentials enabled.
2. **Core C++ Optimization Flaws**: A copy-paste logic inversion in the state dominance check (`engine.cpp`) that risks pruning optimal paths, omission of end-node financial costs and visit durations in round-trip itineraries, and default parameter discrepancies between C++ headers and pybind11 definitions.
3. **Pervasive Machine Learning Illusion & Slop**: The JAX MLP scoring model is never trained or persisted—it reinitializes random weights on every server boot. The 128D feature encoder extracts only 11 dimensions (padding the rest with 117 zeros) and defaults all POI ratings to a hardcoded `3.0` due to dictionary key mismatches. Code comments claim "True Eigenvector Centrality" for elementary numeric if-statements.
4. **Agent Workflow & Architecture Breakdown**: The LangGraph Swarm includes a "RAG" node whose retrieved context is never consumed by any downstream node (pure zombie code). The Human-in-the-Loop resume handler passes envelope metadata into domain constraint models, causing validation crashes upon user clarification. All state checkpoints rely on volatile process RAM (`MemorySaver`).
5. **Background Workers & Database Disconnect**: Celery Beat continuously dispatches a deleted task (`scrape_flight_prices_task`) every 5 minutes. The database lacks an Alembic migration for the `trips` table. The map builder task attempts to hit an imaginary webhook on port 8080.
6. **Frontend Disconnects & Facades**: The itinerary vault detail page (`vault/[id]/page.tsx`) contains hardcoded Tokyo/Paris mock data and cannot display user trips. The vault map places all saved missions at latitude/longitude (0, 0). Waypoint timelines display `--:--` due to naming mismatches with backend schemas. The ML Preference page is a non-interactive static mockup.

---

## Detailed Findings

### `scripts/setup_proxy.py`
- **Bugs & Logic Flaws**: Directly modifies `backend/.env` without verifying existing keys, appending duplicate environment entries on repeated runs.
- **Bad Practices & Dead Code**: Standalone script with no CLI validation or error recovery.
- **AI Slop**: Hardcoded scratch script committed to the root repository.
- **Scalability & Architecture**: **CRITICAL SECURITY RISK**: Hardcoded live Webshare proxy API token (`teeosbwqq39sbexhek8etoj56v0c2ttoemx5yz1z`) in line 5 committed directly to Git version control.

### `docker-compose.yml`
- **Bugs & Logic Flaws**: Celery beat service runs alongside worker but uses development-target hot reload with stale dependencies.
- **Bad Practices & Dead Code**: Orphaned volumes and unused environment variables (`AVIATIONSTACK_API_KEY`).
- **AI Slop**: Comments claiming hardened security while exposing critical attack surfaces.
- **Scalability & Architecture**: **HIGH SECURITY VULNERABILITY**: Line 109 mounts `/var/run/docker.sock:/var/run/docker.sock` into the Celery worker container. Any code execution within the worker yields root-level container breakout capabilities on the host daemon. Furthermore, TimescaleDB, Ollama, and Redis bind to localhost ports without authentication tokens.

### `cpp_core/src/engine.cpp`
- **Bugs & Logic Flaws**:
  - **Dominance Check Inversion**: In `dfs()` (lines 134-161), both `old_dominates` and `new_dominates` use the identical condition `state.last_meal_time >= m.last_meal_time`. For state dominance, if a later meal time is considered inferior (or superior), the inequality must invert between existing entry domination and candidate entry domination. This copy-paste error causes valid branches to be prematurely pruned.
  - **Round-Trip Cost & Duration Omission**: In lines 352-380, when `config.end_node_index` is configured, `final_score` accumulates `pois[target_end].score`, and `final_time` accumulates `return_dur`. However, `pois[target_end].cost` is **never added to `final_cost`**, and `pois[target_end].duration` is **never added to `final_time`**. Final itineraries returning to a base hotel under-report costs and elapsed time.
- **Bad Practices & Dead Code**: Large recursive function `dfs` (~330 lines) with excessive parameter passing (14 arguments) instead of encapsulating context into a solver class.
- **AI Slop**: Overly complex dominance conditions with redundant floating point epsilon comparisons.
- **Scalability & Architecture**: Hard limit of 64 nodes enforced by a single `uint64_t` bitmask (`visited_mask`). Exceeding 64 nodes throws `std::invalid_argument`.

### `cpp_core/include/engine.hpp` & `cpp_core/src/bindings.cpp`
- **Bugs & Logic Flaws**: **Default Parameter Discrepancy**: In `engine.hpp` (line 102), `OptimizationConfig.max_idle_time` defaults to `240` minutes. In `bindings.cpp` (line 65), the pybind11 constructor argument defaults to `45` minutes. Depending on whether the struct is instantiated in C++ or Python, the idle tolerance changes by over 500%.
- **Bad Practices & Dead Code**: `#ifdef PALADIO_TESTING` inline overload inside production header file introduces build flag contamination.
- **AI Slop**: Boilerplate Doxygen comments describing standard C++ types without providing operational guarantees.
- **Scalability & Architecture**: Pybind11 correctly releases the GIL (`py::gil_scoped_release`), but memory buffers are allocated on each invocation without reuse pools.

### `backend/app/domain/interfaces/poi_repository.py` & `backend/app/domain/interfaces/poi_provider.py`
- **Bugs & Logic Flaws**: None.
- **Bad Practices & Dead Code**: None.
- **AI Slop**: None.
- **Scalability & Architecture**: **CLEAN ARCHITECTURE VIOLATION**: Both interfaces import `Attraction` from `app.schemas.scraper` (an outer infrastructure / data-transfer schema) instead of returning core domain entities (`app.domain.entities.poi.Poi`). The inner domain layer is tightly coupled to scraping DTOs.

### `backend/app/domain/interfaces/optimization_engine.py`
- **Bugs & Logic Flaws**: The interface signature declares `run_optimization(...)` as a synchronous method (`def run_optimization`), but `CppOptimizationAdapter` implements it as `async def run_optimization`, violating the Liskov Substitution Principle and method signature contract.
- **Bad Practices & Dead Code**: Default parameters in domain interface method signatures.
- **AI Slop**: Redundant docstrings explaining standard clean architecture concepts.
- **Scalability & Architecture**: Imports `TravelConstraints` from `app.schemas.itinerary`, leaking API request schemas into the domain interface.

### `backend/app/engine/scoring/features.py`
- **Bugs & Logic Flaws**:
  - **Rating Key Mismatch**: Line 31 calls `poi.get("rating", 3.0)`. In the domain entity `Poi`, ratings are nested under `poi.scoring["google_rating"]`. `poi.get("rating")` always evaluates to `None`, causing **every single POI to default to a hardcoded 3.0 rating**.
- **Bad Practices & Dead Code**: Manual one-hot encoding array loop instead of vectorized or dictionary-based lookups.
- **AI Slop**: Generates a supposed "128D feature vector", but only computes 11 scalar values and pads the remaining 117 elements with hardcoded zeroes (`0.0`).
- **Scalability & Architecture**: Generates JAX arrays element-by-element inside Python loops rather than operating on vectorized batches.

### `backend/app/infrastructure/scoring/jax_ml_model.py`
- **Bugs & Logic Flaws**:
  - **Untrained Ephemeral Model**: The MLP weights are initialized with random Gaussian noise (`jax.random.key(42)`) in `main.py` on startup and never loaded from disk or pre-trained on travel datasets. All affinity predictions are arbitrary random projections.
- **Bad Practices & Dead Code**: Model gradient update (`update_user_embedding`) performs online gradient descent on user vectors with fixed learning rate (0.05) and no regularization or clipping, risking vector divergence.
- **AI Slop**: "Enterprisey" JAX / Flax neural network boilerplate wrapped around an untrained 3-layer perceptron.
- **Scalability & Architecture**: State is held in FastAPI process memory (`app.state.ml_params`). In a multi-worker production deployment, worker processes have isolated, out-of-sync parameters.

### `backend/app/engine/cluster_selector.py`
- **Bugs & Logic Flaws**:
  - **Centrality Over-Pollution**: Lines 65-68 treat any POI with `google_rating >= 4.5 and reviews > 1000` as "mandatory" (`mandatory_pois.append(p)`). In major tourist destinations (Rome, Paris, Madrid), dozens of attractions meet this threshold, flooding the mandatory pool and causing the C++ solver to fail feasibility checks.
- **Bad Practices & Dead Code**: Re-imports `is_poi_mandatory` inside the method body (line 57).
- **AI Slop**: Line 61 contains a hallucinated comment: `# True Eigenvector Centrality based on actual popularity/rating data`. There is zero graph construction, no adjacency matrix, and no eigenvector computation; it is simply a primitive scalar threshold check.
- **Scalability & Architecture**: Hardcoded `KMeans(random_state=42, n_init="auto")` called synchronously on CPU within the async request flow.

### `backend/app/infrastructure/engine/struct_mapper.py`
- **Bugs & Logic Flaws**:
  - **Meal Type Classification Failure**: `map_category_to_node_type` maps all `"RESTAURANT"` POIs to `NodeType::RESTAURANT_LUNCH`. Lines 70-76 only assign `is_dinner_spot = True` if the word `"dinner"` appears in the restaurant's lowercase name. Real restaurants rarely have "dinner" in their title, resulting in zero valid dinner spots. Any request with dinner constraints fails to generate an itinerary.
- **Bad Practices & Dead Code**: Repeated module imports within function bodies (`from app.utils.text import is_poi_mandatory`).
- **AI Slop**: Hardcoded heuristic string parsing for meal window classification.
- **Scalability & Architecture**: Dense $N \times N$ matrix flattening uses nested Python loops instead of NumPy vectorization.

### `backend/app/infrastructure/engine/bridge_adapter.py`
- **Bugs & Logic Flaws**:
  - **Timeline Time Desynchronization**: Lines 78-105 reconstruct itinerary schedule timestamps without accounting for POI opening hours. If an attraction opens at 10:00 AM but the solver arrives at 8:30 AM, the bridge adapter schedules the visit at 8:30 AM, ignoring the waiting time simulated by the C++ engine.
- **Bad Practices & Dead Code**: Interface signature mismatch with `IOptimizationEngine`.
- **AI Slop**: Generic `except Exception as e: raise OptimizationError` swallowing stack traces.
- **Scalability & Architecture**: Wraps synchronous C++ execution in `asyncio.to_thread`, which is appropriate, but serializes and deserializes large intermediate dictionaries.

### `backend/app/infrastructure/providers/overpass_provider.py`
- **Bugs & Logic Flaws**:
  - **Rigid Admin Level Overpass Query**: Line 120 queries `area["name"="{city_name}"]["admin_level"="8"]`. Many global metropolises (London, Tokyo, Berlin, New York) do not use OSM `admin_level=8`, causing area resolution to return empty and mandatory POI queries to fail.
  - **Unescaped Regex Injection**: Line 121 interpolates `m_name` directly into an Overpass regex query (`nwr["name"~"{m_name}",i]`), susceptible to query syntax errors if POI names contain parentheses or brackets.
- **Bad Practices & Dead Code**: Global state variables (`_nominatim_last_called`, `_nominatim_lock`) used for rate-limiting outside dependency injection.
- **AI Slop**: Hardcoded OSM tag heuristics and hardcoded fallback durations (120m for museums, 60m for restaurants).
- **Scalability & Architecture**: Sequential fallback through 4 public Overpass interpreter mirrors with 25s timeouts. Worst-case latency before failure is 100 seconds, blocking the user request pipeline.

### `backend/app/infrastructure/providers/travel_data.py`
- **Bugs & Logic Flaws**: `MockTravelDataProvider.get_pois` copies the exact production implementation of `LiveTravelDataProvider.get_pois`, querying real PostgreSQL sessions and calling Overpass APIs instead of using mock data.
- **Bad Practices & Dead Code**: Code duplication between `LiveTravelDataProvider` and `MockTravelDataProvider`.
- **AI Slop**: Redundant abstractions wrapping basic service calls.
- **Scalability & Architecture**: Instantiates short-lived database sessions on every invocation rather than utilizing FastAPI dependency injection.

### `backend/app/services/poi_service.py` & `backend/app/utils/text.py`
- **Bugs & Logic Flaws**:
  - **Matching Logic Inconsistency**: `poi_service.py` implements `is_poi_match` (using substring containment and word length $\ge 3$), while `text.py` implements `is_poi_mandatory` (using regex word boundaries and word length $> 3$). A POI deemed mandatory during cache revalidation may be deemed non-mandatory by the solver.
- **Bad Practices & Dead Code**: `city_name.strip().title()` corrupts multi-word names with lowercase particles (e.g., "Rio de Janeiro" becomes "Rio De Janeiro"), breaking Overpass exact matches.
- **AI Slop**: Redundant duplicate implementations of string matching algorithms.
- **Scalability & Architecture**: Celery background refresh task (`refresh_city_pois_task.delay`) triggered on stale cache hits is good practice, but has no idempotency or deduplication guard.

### `backend/app/use_cases/fetch_travel_context.py`
- **Bugs & Logic Flaws**: Unthrottled geocoding calls to public Nominatim (`https://nominatim.openstreetmap.org/search`) without required Contact headers or 1 req/sec pacing, risking permanent IP ban from OpenStreetMap Foundation.
- **Bad Practices & Dead Code**: Nested imports of `urllib.parse`, `httpx`, and `ClusterSelector` within method bodies.
- **AI Slop**: Procedural generation of 100 fake restaurants in `mock_generator.py` with randomized coordinates and names.
- **Scalability & Architecture**: Multi-day trip handling appends airports to day 0 and day $N-1$, but passes the entire cluster to the daily solver without validating whether total day transit fits within daily operational envelopes.

### `backend/app/use_cases/optimize_daily_itinerary.py`
- **Bugs & Logic Flaws**:
  - **Multi-Day Budget Multiplication**: In line 53, `local_constraints.budget_usd` is set to the total trip budget. Inside the `for day in range(num_days)` loop, this total budget is passed into each single-day optimization call. A user with a \$600 total budget across 3 days is permitted to spend \$600 *per day* (\$1,800 total).
  - **Hardcoded Flight Cost**: Line 44 sets `flight_cost = 0.0`. Real flight pricing is never deducted from the user's travel budget.
  - **Airport Bypass & Metric Inaccuracy**: Lines 173-176 filter out airports from the solver graph, and lines 232-254 manually prepend/append the airport to the route array. The transit time and cost of the airport leg are never added to `total_cost_eur`, `total_time_mins`, or `total_score`, producing inaccurate summary telemetry.
- **Bad Practices & Dead Code**: Deepcopy of constraints and matrix on every invocation.
- **AI Slop**: Dummy heuristic fallback transit matrices when Valhalla fails.
- **Scalability & Architecture**: Daily optimization loop runs sequentially on the event loop rather than exploiting parallel worker threads for independent days.

### `backend/app/swarm/graph.py` & `backend/app/swarm/nodes/retriever.py`
- **Bugs & Logic Flaws**:
  - **Zombie RAG Node**: `rag_node` queries PGVector, retrieves context, and writes it to `SwarmState.retrieved_context`. **No subsequent node (`check_missing`, `planner_scrape`, `planner_optimize`) ever reads or references `retrieved_context`**. It is completely dead computation.
  - **Unseeded PGVector**: PGVector tables are only populated by an offline manual seed script (`seed_pois.py`). For any user-queried city not pre-seeded, PGVector is empty and returns empty strings.
  - **Human-in-the-Loop Resume Corruption**: In `check_missing_fields_node`, `interrupt()` pauses execution. When resumed via WebSocket, the payload dictionary (including `action: "resume"`, `thread_id`, and JSON message) is unpacked directly into `constraints_dict`. Instantiating `TravelConstraints(**constraints_dict)` crashes with unexpected field errors.
- **Bad Practices & Dead Code**: Dead state variables in `SwarmState` (`error_count`, `retrieved_context`).
- **AI Slop**: "Swarm" marketing terminology applied to a strictly linear 6-node state graph with zero branching or agent autonomy.
- **Scalability & Architecture**: `MemorySaver` checkpointer stores all graph state in Python process RAM. Server restarts or worker scaling destroy active sessions.

### `backend/app/swarm/agents/ticket_parser.py` & `backend/app/swarm/agents/validator.py`
- **Bugs & Logic Flaws**:
  - Both agents run un-mocked LLM inference against Ollama on CPU during automated unit tests, causing test suite runs to hang for minutes and fail in environments without local LLMs.
- **Bad Practices & Dead Code**: Custom retry loops wrapping Pydantic AI agents with redundant exception logging.
- **AI Slop**: Lengthy system prompts attempting to force local LLMs to invoke specific tools via natural language hints.
- **Scalability & Architecture**: No pooling or rate limiting of Ollama API requests; concurrent WebSocket users trigger concurrent CPU-bound LLM generations.

### `backend/app/api/v1/websockets.py`
- **Bugs & Logic Flaws**:
  - **Session Lifetime & Thread Safety Violation**: Lines 35-40 instantiate a single SQLAlchemy `AsyncSession` per WebSocket connection and share it across all message handlers. Concurrent requests or streaming tasks sharing an un-synchronized `AsyncSession` trigger `IllegalStateChangeError: Method 'execute()' can't be called here; another operation is in progress`.
  - **Silent Stream Task Failure**: In `stream_task` (lines 98-99), errors are caught and logged, but never transmitted to `outbound_queue`. When an error occurs in the pipeline, the WebSocket client is never notified and hangs in the "SOLVER ACTIVE" state indefinitely.
- **Bad Practices & Dead Code**: Inverted exception handling where `OptimizationError` is handled outside the connection message loop.
- **AI Slop**: Telemetry strings mimicking fictional military/cyberpunk terminals (`"UPLINK ESTABLISHED"`, `"MISSION SAVED"`).
- **Scalability & Architecture**: Unbounded in-memory queue (`asyncio.Queue(maxsize=100)`) per connection with no backpressure mechanism.

### `backend/app/api/v1/trips.py`
- **Bugs & Logic Flaws**: Missing `GET /trips/{trip_id}` endpoint. The frontend routes users to `/vault/{id}`, but the backend API provides no endpoint to retrieve an individual trip by ID.
- **Bad Practices & Dead Code**: Mixing ISO timestamp generation in Python with PostgreSQL database timestamps.
- **AI Slop**: None.
- **Scalability & Architecture**: Unpaginated `GET /trips/` endpoint (`scalars().all()`) returning all historical trips and full JSON itinerary payloads.

### `backend/app/db/models.py` & `backend/migrations/`
- **Bugs & Logic Flaws**: **MISSING DATABASE MIGRATION**: `TripModel` is declared in `models.py`, but only two Alembic migrations exist (`5cef38496ec5_init_pois.py` and `67f4819ee5c6_add_users.py`). There is **NO migration creating the `trips` table**. Running migrations on a fresh PostgreSQL container leaves the schema without `trips`, causing trip operations to fail.
- **Bad Practices & Dead Code**: Ambiguous column renaming `metadata_field = Column("metadata", ...)` due to conflicts with SQLAlchemy's internal `Base.metadata`.
- **AI Slop**: Heavy reliance on unstructured `JSONB` for domain fields (financials, schedule, scoring) instead of strongly typed relational tables.
- **Scalability & Architecture**: No foreign keys between users and trips; user association is implicit.

### `backend/app/celery_app.py` & `backend/app/tasks.py`
- **Bugs & Logic Flaws**:
  - **Phantom Periodic Task**: In `celery_app.py` (lines 19-25), Celery Beat is scheduled to execute `app.tasks.scrape_flight_prices_task` every 300 seconds. This task was deleted from `tasks.py` during the scraper refactor. Celery Beat continuously logs errors dispatching a non-existent task.
  - **Failing Map Rebuild Webhook**: `build_city_map_task` in `tasks.py` downloads large OpenStreetMap `.pbf` files and attempts to POST to `http://host.docker.internal:8080/rebuild`. No server listens on port 8080, causing repeated network connection errors and task retries.
- **Bad Practices & Dead Code**: Blocking `urllib.request.urlretrieve` inside Celery worker process blocking worker concurrency.
- **AI Slop**: Remnants of deleted scrapers in `app/scraper/browser_pool.py` and `app/scraper/strategies/base.py` with zero consumers.
- **Scalability & Architecture**: Worker and beat share single Redis broker queue without task prioritization.

### `backend/app/main.py`
- **Bugs & Logic Flaws**: Insecure CORS configuration (`allow_origins=["*"]`, `allow_credentials=True`).
- **Bad Practices & Dead Code**: Synchronous initialization of ML parameters in lifespan hook without persistent storage.
- **AI Slop**: Comments claiming app state initialization solves horizontal scaling when it does the exact opposite.
- **Scalability & Architecture**: Single uvicorn process handles WebSocket streaming, database queries, and async dispatch without connection pools.

### `backend/tests/` (Test Suite Health)
- **Bugs & Logic Flaws**:
  - `tests/test_optimize_daily_itinerary.py`: Test `test_optimize_single_day_no_pois_except_hotel` crashes because `_optimize_single_day` updated its signature to require `matrix_dict_full`, but the test was never updated.
  - `tests/test_ticket_parser.py` and `tests/test_validator.py` make real HTTP calls to local Ollama LLMs on CPU, hanging test runs for minutes.
  - `tests/test_swarm_e2e.py` hardcodes `localhost:11435`, causing it to always skip when run inside Docker containers.
- **Bad Practices & Dead Code**: 19,000 lines of static test fixtures in `test_data.json`.
- **AI Slop**: Tests written to assert on mocked return values without exercising real validation boundaries.
- **Scalability & Architecture**: No separation between fast hermetic unit tests and slow end-to-end integration tests.

### `frontend/src/app/vault/[id]/page.tsx`
- **Bugs & Logic Flaws**:
  - **Entirely Fake Mock Implementation**: The page contains a hardcoded dictionary `MOCK_TRIPS` with only two entries (`"tokyo-hyper"` and `"paris-efficiency"`). Clicking on any real trip saved by the user produces `[ MISSION DATA NOT FOUND ]`. It has zero integration with the backend API.
  - **Next.js 15+ Async Params Incompatibility**: Accesses `params.id` synchronously, violating Next.js 15+ asynchronous route parameter contract (`Promise<{ id: string }>`).
- **Bad Practices & Dead Code**: Hardcoded Unsplash image URLs in component body.
- **AI Slop**: Fake mission data masquerading as functional trip detail views.
- **Scalability & Architecture**: No data fetching layer, SWR, or React Query integration.

### `frontend/src/app/vault/page.tsx` & `frontend/src/components/VaultMap.tsx`
- **Bugs & Logic Flaws**:
  - **Coordinates Default to (0, 0)**: In `VaultPage` (lines 13-19), `mappedTrips` attempts to read `t.lat` and `t.lng`. Neither field exists on `TripModel` or `TripResponse`. All saved trips are assigned coordinate (0, 0), rendering markers in the Atlantic Ocean.
  - **Choropleth Matching Flaw**: `VaultMap.tsx` checks `visitedCountries.includes(feature.properties.name)`. `visitedCountries` contains city names ("Madrid", "Paris"), while `feature.properties.name` contains country names ("Spain", "France"). Visited country styling never triggers.
  - **Unauthenticated Third-Party GitHub Fetch**: Line 37 fetches GeoJSON from `https://raw.githubusercontent.com/johan/world.geo.json/...` directly in client render. Subject to GitHub rate limiting and network failure.
- **Bad Practices & Dead Code**: Multiple ESLint warnings for `any` types.
- **AI Slop**: Fictional terminal headers (`"ITINERARY VAULT // GLOBAL MISSIONS DASHBOARD"`).
- **Scalability & Architecture**: Re-fetches large GeoJSON file on every page mount without caching.

### `frontend/src/components/TripTimeline.tsx`
- **Bugs & Logic Flaws**:
  - **Timestamp Field Mismatch**: Line 41 attempts to read `scheduledPoi.arrival_time`. The backend domain entity `ScheduledPoi` outputs `scheduled_start` and `scheduled_end`. Because `arrival_time` is undefined, **every single waypoint on the timeline renders time as `--:--`**.
- **Bad Practices & Dead Code**: Untyped `any` parameters and dead fallback branches.
- **AI Slop**: Non-functional dummy visual dividers.
- **Scalability & Architecture**: Renders all waypoints in a single unvirtualized DOM tree.

### `frontend/src/app/model/page.tsx`
- **Bugs & Logic Flaws**: Completely non-functional static page. Displays a hardcoded zeroed-out radar chart and a static message `[ WAITING FOR LIVE TELEMETRY UPDATE ]`. Has zero API calls, zero WebSocket subscriptions, and zero interactivity.
- **Bad Practices & Dead Code**: Misleading user-facing text claiming "The C++ engine uses these exact tensors" when no tensors are sent to or used by this page.
- **AI Slop**: High visual fidelity placeholder designed to simulate machine learning telemetry without actual engineering.
- **Scalability & Architecture**: None.

### `frontend/src/contexts/SocketContext.tsx`
- **Bugs & Logic Flaws**:
  - **Resume Command Payload Corruption**: Lines 289-294 construct an invalid resume payload stringifying answers into a `message` key, conflicting with LangGraph's expected dictionary resume schema.
- **Bad Practices & Dead Code**: Disables React Hook purity rules (`// eslint-disable-next-line react-hooks/purity`) to read `sessionStorage` in `useRef`.
- **AI Slop**: Cyberpunk status telemetry strings logged to session storage.
- **Scalability & Architecture**: WebSocket connection lifecycle tied to component mounting without automatic exponential backoff reconnection.

---

## Recommendations

### Phase 1: Critical Security & Safety Remediations (Immediate)
1. **Revoke and Remove Plaintext Secrets**:
   - Immediately rotate and revoke the exposed Webshare proxy token (`teeosbwqq39sbexhek8etoj56v0c2ttoemx5yz1z`).
   - Remove `scripts/setup_proxy.py` or refactor it to read strictly from `os.environ["WEBSHARE_API_KEY"]`.
   - Add `.env` and secret patterns to `.gitignore` and run `git filter-repo` / BFG to purge the secret from git history.
2. **Remove Host Docker Socket Mount**:
   - Delete `/var/run/docker.sock:/var/run/docker.sock` from `docker-compose.yml` under the `worker` service.
   - Restructure map compilation tasks to operate within containerized environments or via authenticated external worker jobs.
3. **Fix CORS Configuration**:
   - In `backend/app/main.py`, replace `allow_origins=["*"]` with explicit domain origins (`["http://localhost:3000"]`) when `allow_credentials=True`.

### Phase 2: Core Algorithm & Solver Corrections
1. **Correct Dominance Condition in `engine.cpp`**:
   - Fix the meal time comparison in `dfs()`: ensure that if `state.last_meal_time >= m.last_meal_time` indicates dominance in one direction, the inverse condition is evaluated for reverse dominance.
2. **Fix End-Node Financial and Duration Accounting**:
   - In `cpp_core/src/engine.cpp` (lines 352-380), add `pois[target_end].cost` to `final_cost` and `pois[target_end].duration` to `final_time`.
3. **Synchronize Default Configuration Values**:
   - Align `max_idle_time` in `cpp_core/include/engine.hpp` and `cpp_core/src/bindings.cpp` to a unified standard (e.g., 60 minutes).
4. **Fix Restaurant Meal Type Mapping**:
   - In `struct_mapper.py`, update meal classification to inspect opening hours and metadata tags (or mark restaurants as eligible for both lunch and dinner) rather than requiring the word "dinner" in the name.

### Phase 3: Machine Learning & Scoring Modernization (Deslop)
1. **Model Persistence or Heuristic Scoring**:
   - Either train and persist the JAX MLP weights using real travel preference datasets (saving weights via Flax `checkpoints`), or replace the random MLP with a deterministic multi-attribute utility function (combining rating, price tier, duration, and category match).
2. **Fix Feature Encoder Key Mismatches**:
   - Update `PoiEncoder.encode` in `features.py` to extract ratings correctly from `poi.get("scoring", {}).get("google_rating")` or `poi.get("rating")`.
3. **Deslop AI Buzzwords & Heuristics**:
   - In `cluster_selector.py`, remove misleading comments referencing "Eigenvector Centrality" and implement proper spatial-budget clustering with bounded mandatory node injection.

### Phase 4: Swarm, LangGraph & Backend Engineering
1. **Eliminate Zombie RAG Node or Complete Ingestion**:
   - Either remove `rag_node` from `graph.py` to save latency and database queries, or integrate `retrieved_context` into the prompt of downstream agent nodes.
   - Build an automated ingestion pipeline that indexes fresh Overpass POIs into PGVector with `nomic-embed-text` embeddings upon city retrieval.
2. **Implement Persistent LangGraph Checkpointer**:
   - Replace `MemorySaver` in `graph.py` with `PostgresSaver` / `AsyncpgSaver` utilizing the existing PostgreSQL connection pool.
3. **Fix Human-in-the-Loop Resume Data Flow**:
   - In `websockets.py` and `swarm_session_adapter.py`, extract the clean clarification dictionary and pass it directly to `Command(resume=clarification_dict)` so `check_missing_fields_node` updates constraints without schema pollution.
4. **Fix Multi-Day Budget Allocation**:
   - In `optimize_daily_itinerary.py`, divide the total trip budget across the days (or implement dynamic remaining-budget carryover) rather than allocating the entire budget to every individual day. Deduct actual flight costs from the total budget.
5. **Add Missing Alembic Migration for `trips`**:
   - Generate and commit an Alembic migration creating the `trips` table with appropriate indexes.
6. **Clean Up Celery Beat & Dead Scraper Code**:
   - Remove `scrape-every-5-minutes` from `celery_app.py`.
   - Delete orphaned scraper files (`app/scraper/browser_pool.py`, `app/scraper/strategies/base.py`).

### Phase 5: Frontend Integration & Real Data Binding
1. **Connect Vault Detail Page to Backend API**:
   - Add `GET /api/v1/trips/{id}` to the FastAPI backend.
   - Rewrite `frontend/src/app/vault/[id]/page.tsx` to fetch real trip data by ID, extract waypoints, and display them on LeafletMap. Remove `MOCK_TRIPS`.
2. **Fix Geocoding for Saved Vault Trips**:
   - Update `TripModel` or `extractDestination` to store destination center coordinates (`latitude`, `longitude`) so `VaultMap` markers render on actual geographic locations instead of (0, 0).
3. **Fix Timeline Field Mismatch**:
   - In `TripTimeline.tsx`, update property access to read `scheduledPoi.scheduled_start` and `scheduledPoi.scheduled_end` so arrival and dwell times display accurately.
4. **Bundle GeoJSON Assets**:
   - Download the world countries GeoJSON into `frontend/public/data/countries.geo.json` to eliminate external runtime dependencies on personal GitHub repositories.
5. **Replace Static Preference Mock with Real State**:
   - Connect `model/page.tsx` to the user embedding endpoint or WebSocket telemetry stream, or remove the page until live preference tuning is fully implemented.

### Phase 6: Testing & Quality Gates
1. **Fix Broken Backend Tests**:
   - Update `tests/test_optimize_daily_itinerary.py` to match the current signature of `_optimize_single_day`.
2. **Hermetic LLM Mocking**:
   - Mock Pydantic AI agent runs in `test_ticket_parser.py` and `test_validator.py` using `TestModel()` so the test suite runs deterministically in CI in under 5 seconds.
3. **Expand Frontend Test Coverage**:
   - Implement component and integration tests for `SocketContext`, `useTrips`, and `TripTimeline` using Playwright component testing.
