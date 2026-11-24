# Database schema, Redis keys, and Celery tasks

Paladio persists state across **54 SQLAlchemy ORM tables** in PostgreSQL 16 (with `timescaledb` and `vector` extensions managed across 34 Alembic migrations), **Redis 7** pub/sub channels and locks, and **18 Celery tasks** running across 3 queues and 3 Celery Beat schedules.

## PostgreSQL 16 + TimescaleDB + `pgvector` tables (54)

All ORM models are defined in `backend/app/db/models.py`. Legacy `city_transit_fares` was dropped in migration `9c8d7e6f5a4b` in favor of normalized `transit_fares`, `transit_fare_rules`, and `transit_fare_quotes`.

| Domain | Count | Table names (`__tablename__`) and notable indexes |
| :--- | :---: | :--- |
| **Geo, POIs & Pricing** | 4 | `cities`, `attractions` (46 cols; `Vector(768)` HNSW cosine index `m=16, ef_construction=128`, GIN trigram, GIN FTS `tsvector`, GIN `facets jsonb_path_ops`), `poi_price_catalog`, `poi_travel_cache` |
| **Users & Taste Learning** | 3 | `users` (`Vector(768)`), `taste_events`, `user_taste_profiles` (`Vector(768)`, category posteriors, ranker weights) |
| **Trips, Edits, Collab & Audit** | 7 | `trips` (`revision`, `itinerary_data` JSON), `trip_revisions`, `agent_actions` (SHA-256 args audit), `trip_participants`, `trip_expenses`, `trip_collections` (nullable `trip_id` for global lists), `trip_collection_items` |
| **Bookings Wallet** | 2 | `trip_tickets` (30 cols; Fernet-encrypted secrets, BCBP/QR metadata), `trip_ticket_attachments` |
| **Transit, GTFS & Fares** | 18 | `transit_cache`, `transit_coverage`, `transit_agencies`, `transit_lines`, `transit_stations`, `transit_patterns`, `transit_pattern_stops`, `transit_pattern_trips`, `transit_station_lines`, `transit_service_summary`, `transit_service_days`, `transit_shapes`, `transit_transfers`, `transit_fares`, `transit_fare_rules`, `transit_fare_quotes` (5-tier provenance + `evidence_hash`), `transit_feeds`, `transit_provider_health` |
| **Market / Deal Engine & Lodging** | 18 | `market_price_ticks` (TimescaleDB hypertable with compression), `price_daily`, `route_baselines`, `route_corpus_status`, `fee_models`, `destination_airports`, `deal_watch_alerts`, `deal_candidates`, `deal_events`, `lodging_offers`, `provider_health`, `hotel_properties`, `hotel_property_sources`, `hotel_rate_observations`, `hotel_scan_runs`, `lodging_providers`, `market_sweep_runs`, `route_month_coverage` |
| **FX & Dynamic Settings** | 2 | `fx_rates`, `system_config` (JSON store for `llm_config`, `secrets`, `updater`, and `settings` domains `engine`, `swarm`, `vault`, `notifications`) |

## Redis channels, locks, and ephemeral keys

Redis serves simultaneously as Celery's broker/backend, cross-container pub/sub bus, and distributed coordination store.

| Key or channel pattern | Purpose | TTL / lifecycle |
| :--- | :--- | :--- |
| `paladio:events` | Global pub/sub channel fanned out to `/api/ws/stream` (deals, hydration, GTFS builds, edits) | Pub/sub stream |
| `paladio:trip:{trip_id}` | Per-trip pub/sub channel forwarded to `/api/ws/trip-agent/{trip_id}` | Pub/sub stream |
| `paladio:city_hydration:{city_id}` | City ingestion progress pub/sub updates | Pub/sub stream |
| `paladio:transit_compiler_lock`, `paladio:transit_compiler_current_city`, `paladio:transit_task_id:{city}`, `paladio:transit_cancelled:{city}`, `paladio:transit_queued_notified:{city}` | Serializes city GTFS/Valhalla builds across workers; cleared cleanly on worker startup | Lock / 3600s notice |
| `paladio:lock:hydrate_city:{city}`, `paladio:city_hydration_active:{city}` | Prevents duplicate concurrent POI hydration pipelines for the same city | Active lock |
| `paladio:agent:session:{trip_id}:{user_id}` | Persists recent interactive chat history (up to 14 messages) | 24h TTL |
| `paladio:agent:lock:{trip_id}` | Exclusive turn lock guarding concurrent Trip Agent runs on one trip | 90s TTL |
| `paladio:proposal:{proposal_id}` | Pending Tier C confirmation proposal JSON payload | 600s TTL |
| `paladio:nominatim_last_called` | Respects external Nominatim rate limits across workers, alongside Wikimedia photo and Transitous caches | Rate-limit / cache TTL |

## Celery worker queues, 18 tasks, and Beat schedule

`backend/app/celery_app.py` configures 3 queues (`celery`, `transit_build`, `poi_hydration`) with `task_acks_late=True` and `worker_prefetch_multiplier=1`.

| Queue | Task names (`app.tasks.*`) |
| :--- | :--- |
| **`poi_hydration`** (5) | `ingest_city_pois_task`, `enrich_tier12_city_pois_task`, `enrich_long_tail_city_pois_task`, `hydrate_city_pipeline_task`, `refresh_city_pois_task` |
| **`transit_build`** (4 routed + `build_city_map_task`) | `cleanup_city_gtfs_task`, `build_city_gtfs_task`, `derive_city_transit_task`, `reconcile_interrupted_transit_builds`, plus `build_city_map_task` |
| **`celery`** (8) | `daily_flight_sweep_task`, `daily_baseline_compute_task`, `daily_deal_detection_task`, `daily_market_pipeline_task`, `backfill_route_corpus_task`, `prewarm_route_lodging_task`, `periodic_autoupdate_check_task`, `retrain_taste_profiles_task` |

Celery Beat executes three recurring jobs automatically in UTC:

- **`daily-market-pipeline`**: `app.tasks.daily_market_pipeline_task` daily at `03:00 UTC`.
- **`retrain-taste-profiles`**: `app.tasks.retrain_taste_profiles_task` daily at `04:00 UTC`.
- **`periodic-autoupdate-check`**: `app.tasks.periodic_autoupdate_check_task` every `21600s` (6 hours).
