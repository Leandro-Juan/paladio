# Managing city POIs, Valhalla maps, and GTFS

Hydrate destination Point of Interest (POI) catalogs, download OpenStreetMap extracts for Valhalla street routing, compile open General Transit Feed Specification (GTFS) schedules into 14 PostgreSQL tables, and inspect storage footprints inside **Settings** (`/config` under **City Data**).

## How city storage is organized

Every destination stored in Paladio spans three complementary local datasets so itinerary generation, walking legs, and transit routing stay fast and self-contained.

| Dataset | Storage location | Celery queue | How it is refreshed |
| :--- | :--- | :--- | :--- |
| **POIs & 768-D embeddings** | PostgreSQL `cities` + `attractions` (`Vector(768)` HNSW index) | `poi_hydration` | 3-stage pipeline: `ingest_city_pois_task`, `enrich_tier12_city_pois_task`, `enrich_long_tail_city_pois_task` |
| **Street & walk graph** | Docker volume `valhalladata` (`/custom_files`) | `transit_build` | `build_city_map_task` downloads regional OSM PBF extracts and triggers Valhalla tile reloads |
| **Compiled transit schedules** | Docker volume `gtfsdata` (`/gtfs_feeds`) + 14 `transit_*` PostgreSQL tables | `transit_build` | `build_city_gtfs_task` followed by `derive_city_transit_task` |

## Managing cities from Settings (`/config`)

Open **Settings** (`/config`), select **Travel Engine & Optimization -> City Data**, and inspect the storage vault table listing every hydrated or planned city.

1. Click **Sync Planned Trips GTFS** (`POST /api/trips/transit/sync-planned`) to verify every upcoming expedition and enqueue GTFS compilation for missing destination cities automatically.
2. Trigger **Download POIs** or **Compile GTFS** on an individual city row when pre-warming a new destination before building a trip.
3. Click **Delete POIs** (`DELETE /api/trips/city/{city}/pois`) or **Delete GTFS** (`DELETE /api/trips/transit/{city}`) to reclaim PostgreSQL rows and disk space after completing an expedition.

!!! note "Single-city compiler lock and crash recovery"
    To prevent RAM spikes from concurrent Valhalla tile builds, `build_city_gtfs_task` acquires a distributed Redis lock (`paladio:transit_compiler_lock`) and processes queued cities sequentially. When a worker starts or recovers from a container restart, `on_worker_ready` clears stale locks and dispatches `reconcile_interrupted_transit_builds` to resume interrupted `BUILDING` or `QUEUED` jobs automatically.

## Running operational maintenance scripts and CLIs

When bootstrapping cities offline, troubleshooting corrupted cache entries, or auditing database quality, execute Paladio's built-in administrative commands inside the `api` container.

| Command | Module / Script | Purpose |
| :--- | :--- | :--- |
| Hydrate city POIs from CLI | `python -m app.cli.hydrate_pois` | Hydrate and embed POIs for target cities directly |
| Enrich POI tiers & ratings | `python -m app.cli.enrich_pois` / `tier_pois` | Run Wikidata, Wikivoyage, and tier classification passes |
| Derive GTFS PostgreSQL tables | `python -m app.cli.derive_transit` | Rebuild the 14 derived `transit_*` tables from a GTFS archive |
| Probe city coverage & quality | `python -m app.cli.city_quality_probe` | Inspect POI density, opening hours, and embedding readiness |
| Clean corrupted POI data | `python scripts/cleanup_corrupted_poi_data.py` | Flush corrupted Redis Wikimedia caches and reset affected POI descriptions |
| Reseed verified fare quotes | `python scripts/migrate_verified_fares_to_quotes.py` | Populate `transit_fare_quotes` with cited official fares |

Execute any script cleanly through Docker Compose:

```bash
docker compose exec api python scripts/cleanup_corrupted_poi_data.py
```

If a city lacks an open GTFS feed in the global catalog, Paladio logs the `UNAVAILABLE` status in `transit_coverage` and automatically falls back to Valhalla street walking/driving plus Transitous live transit queries without blocking itinerary generation.
