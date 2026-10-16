# Paladio Deal Engine: Codebase Map (Task 0.2)

Record of all 12 pre-existing building blocks mapped to their exact file paths, signatures, input/output types, side effects, and verified test calls.

---

### 1. TimescaleDB
- **File / Container**: `docker-compose.yml` (`db` service, image `timescale/timescaledb:latest-pg16`).
- **Installed Extensions**: `timescaledb` (v2.29.1), `vector` (v0.8.1), `pg_trgm` (v1.6), `unaccent` (v1.1).
- **Connection URI**: `postgresql+asyncpg://postgres:postgres@db:5432/paladio` (backend internal) / `127.0.0.1:5432` (host).
- **Side Effects**: Disk persistence via Docker named volume `pgdata`.
- **Verified in Tests**: `backend/tests/` via SQLAlchemy session fixtures.

---

### 2. Redis Cache & Broker
- **File / Container**: `docker-compose.yml` (`redis` service, image `redis:7-alpine`).
- **Connection URI**: `redis://redis:6379/0` (backend internal) / `127.0.0.1:6379` (host).
- **Side Effects**: In-memory caching, Celery task queuing, Pub/Sub channels (`paladio:events`).
- **Verified in Tests**: Used across Celery worker and WebSocket connection tests.

---

### 3. Celery Beat & Workers
- **File**: `backend/app/celery_app.py`
- **Signature**: `celery_app = Celery("paladio", broker=settings.REDIS_URL, backend=settings.REDIS_URL)`
- **Configuration**: `app.conf.beat_schedule`, `task_serializer="json"`, `result_serializer="json"`.
- **Side Effects**: Enqueues and executes background jobs via Redis broker.
- **Example Usage**: `backend/app/tasks.py`.

---

### 4. FlightSegment, HotelAnchor, BookingAnchors
- **File**: `backend/app/schemas/itinerary.py`
- **Signatures**:
  - `class FlightSegment(BaseModel)`: fields `departure_airport: str`, `arrival_airport: str`, `departure_time: str`, `arrival_time: str`, `price_cents: int`, `carrier: str | None`, `flight_number: str | None`, `duration_minutes: int | None`. Method `resolve_arrival_and_duration() -> FlightSegment`.
  - `class HotelAnchor(BaseModel)`: fields `id: str`, `name: str`, `location: dict`, `cost_per_night_cents: int`, `currency: str`.
  - `class BookingAnchors(BaseModel)`: fields `outbound_flight: FlightSegment | None`, `return_flight: FlightSegment | None`, `hotel: HotelAnchor | None`.
- **Example Call**: `backend/tests/test_auto_itinerary.py#L50`.

---

### 5. HybridSovereignScorer
- **File**: `backend/app/infrastructure/scoring/hybrid_scorer.py`
- **Class**: `class HybridSovereignScorer(IScoringModel)`
- **Signature**:
  ```python
  def batch_score(
      self,
      features: np.ndarray,      # (N, D) float32 feature tensor
      params: dict[str, Any] | None = None,
      user_embedding: Any = None,
  ) -> np.ndarray: ...          # (N,) float32 scores in [0.0, 100.0]
  ```
- **Side Effects**: Pure deterministic CPU computation; zero heap allocation inside scoring loops; zero cloud network calls.
- **Example Call**: `backend/tests/test_ml_scorer.py#L15`.

---

### 6. run_itinerary_v2_pipeline
- **File**: `backend/app/engine/v2/pipeline.py:L72`
- **Signature**:
  ```python
  async def run_itinerary_v2_pipeline(
      city: str,
      constraints: TravelConstraints,
      poi_repo: IPoiRepository,
      transit_matrix_fn: Callable[[list[dict[str, Any]], str], list[list[Any]]],
      depot_poi: Poi | None = None,
      outbound_flight: dict[str, Any] | None = None,
      return_flight: dict[str, Any] | None = None,
      max_nodes_expanded: int = 50000,
      user_vector: list[float] | None = None,
  ) -> ItineraryV2Result: ...
  ```
- **Returns**: `ItineraryV2Result(itinerary: dict, candidate_pool: list, metadata: dict)`.
- **Example Call**: `backend/tests/test_v2_phase5b_integration.py#L286`.

---

### 7. evaluate_itinerary_quality
- **File**: `backend/app/quality/itinerary_metrics.py:L252`
- **Signature**:
  ```python
  def evaluate_itinerary_quality(
      itinerary_payload: dict[str, Any],
  ) -> ItineraryQualityReport: ...
  ```
- **Returns**: `ItineraryQualityReport(gates_passed: bool, overall_score: float, gate_failures: list[str], day_metrics: list)`.
- **Example Call**: `backend/tests/test_itinerary_metrics.py#L91`.

---

### 8. TripModel
- **File**: `backend/app/db/models.py:L194`
- **Signature**:
  ```python
  class TripModel(Base):
      __tablename__ = "trips"
      id = Column(String, primary_key=True, index=True)
      user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
      destination = Column(String, nullable=False)
      start_date = Column(String, nullable=False)
      end_date = Column(String, nullable=False)
      itinerary_data = Column(JSONB, nullable=False)
      status = Column(String, default="active", nullable=False) # Added for Deal Engine proposals
  ```
- **Side Effects**: Relational CRUD in PostgreSQL.
- **Example Call**: `backend/tests/test_trips.py`.

---

### 9. SwarmState with prompt_analyzer_node
- **File**: `backend/app/swarm/agents/prompt_analyzer.py:L56`
- **Signature**:
  ```python
  async def prompt_analyzer_node(state: SwarmState) -> dict: ...
  ```
- **Returns**: Partial state dictionary containing `extracted_preferences`, `mandatory_pois`, and `tag_affinities`.
- **Example Call**: `backend/tests/test_prompt_analyzer.py#L40`.

---

### 10. Redis Pub/Sub to WebSocket Bridge
- **File**: `backend/app/api/v1/websockets.py:L93`
- **Signature**:
  ```python
  pubsub = r.pubsub()
  await pubsub.subscribe("paladio:events")
  async for message in pubsub.listen(): ...
  ```
- **Side Effects**: Relays background worker alerts to active client WebSocket connections.
- **Example Call**: `backend/tests/test_websockets.py`.

---

### 11. Scraper Hierarchy & Resilience
- **Files**: `backend/app/utils/` and Celery worker settings.
- **Pattern**: Exponential backoff with jitter on HTTP 429 / 5xx; fail-fast error emission without mocked synthetic fallbacks in production.

---

### 12. paladio_core C++ Engine
- **File**: `.venv/lib/python3.14/site-packages/paladio_core.cpython-314-x86_64-linux-gnu.so`
- **Exports**: `optimize_itinerary`, `solve_tsptw`, `solve_tsp_tour`, `OptimizationConfig`, `OptimizationResult`, `POI`, `TransitInfo`.
- **GIL Management**: GIL released via `pybind11::gil_scoped_release` during solver loops.
- **Example Call**: `backend/app/infrastructure/engine/pybind_core_engine.py`.
