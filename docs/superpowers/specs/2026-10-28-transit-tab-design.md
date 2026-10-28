# Design Specification: Dedicated Transit Tab Refactor

**Date**: 2026-10-28  
**Author**: Antigravity  
**Status**: Draft for User Review & Confirmation  
**Canonical Spec Path**: `docs/superpowers/specs/2026-10-28-transit-tab-design.md`  
**Tracking Source**: `PLAN.md`

---

## 1. Overview & Motivation

Transit stops are currently indexed as generic POIs in the `attractions` table (with IDs like `OSM-transit-<category>-<id>`). As a result, they appear indiscriminately in the Search tab alongside museums, restaurants, and sights, showing irrelevant fields on cards and detail inspectors (e.g. "Suggested stay: 10 mins", "% AFFINITY", star ratings, duration/price filters, photo carousels, and opening hours). Furthermore, station cards display a synthetic flat fare (e.g., €1.80 or €2 / person) derived from a citywide fallback, and stop codes (like `JB13`) are rendered as route badges.

### Core Objective
Move transit out of the Search tab into its own dedicated tab in the Plan left panel (**Route**, **Search**, **Transit**, **Saved**). Base the new tab on pruned GTFS feeds already compiled for Valhalla, using derived, compact PostgreSQL tables. Preserve existing Valhalla Route legs and itinerary generation completely intact.

### Key Invariants
- **Zero Mock Data & No Fabricated Fallbacks**: Values missing in feeds are hidden, explained honestly, or degraded gracefully (e.g. stop-sequence polylines when shapes are absent). No synthetic station prices or color hashing.
- **Air-Gappable & Self-Hosted**: 100% local operation without external cloud APIs.
- **Deterministic & High Performance**: Derived tables precalculate stop sequences, service spans, headways, and offsets once per feed build. Zero runtime scanning of multi-gigabyte `stop_times.txt`.
- **Capability-Driven UI**: Feeds vary by city (e.g. Tokyo has translations and fares but no shapes; Paris has shapes and transfers but no translations). The UI is a pure function of feed capability flags.

---

## 2. Phase 0 Audit Summary

| Area | Key Findings | References |
| :--- | :--- | :--- |
| **Frontend Architecture** | The sidebar tabs in `TripUnifiedSidebar.tsx` define `MainTabType = 'route' \| 'search' \| 'saved'`. Top-level workspace tabs are `Plan`, `Wallet`, `Costs`, `Collab`, `Photos`. Category chips live in `PROJECT_CATEGORIES` (with `'transit'`). Right-hand detail panel is `PoiDetailView` in `TripWorkspace.tsx`. `DAY` state is managed centrally in `TripWorkspace.tsx` (`selectedDay`). | `TripUnifiedSidebar.tsx:L183-196, L1930-2053`, `TripWorkspace.tsx:L34, L676-712`, `TripWorkspaceHeader.tsx:L112-141` |
| **Search Backend & Engine Isolation** | `pois.py` extracts transit metadata via `_extract_transit_info()`. `find_tiered_pois(max_tier=2)` in `candidate_pool.py` includes metro/train rows (`tier=2`). Excluding transit from Search (`AttractionModel.category != 'transit'` and `not id.startswith('OSM-transit-')`) cleanly isolates Search without mutating the candidate pool or itinerary solver. | `pois.py:L247-330, L408, L558-747`, `candidate_pool.py:L250-256`, `sql_poi_repository.py:L386-399` |
| **Migrations** | Standard **Alembic** async migrations (`backend/alembic.ini`, `backend/migrations/env.py`, `migrations/versions/`). | `backend/migrations/env.py`, `backend/migrations/versions/` |
| **Real Feeds Matrix** | Verified in Docker volume `paladio_gtfsdata`: <br>• **Tokyo**: `agency.txt`, `routes.txt`, `stops.txt`, `trips.txt`, `stop_times.txt` (5MB), `calendar.txt`, `calendar_dates.txt`, `translations.txt`, `fare_attributes.txt`, `fare_rules.txt`. **No shapes.txt**. Dates: `20260314`–`20270312`. Route types: `0` (Tram), `1` (Subway), `2` (Rail). <br>• **Paris**: `agency.txt`, `routes.txt`, `stops.txt`, `trips.txt`, `stop_times.txt` (1.0GB), `shapes.txt` (909MB), `transfers.txt`, `frequencies.txt`. **No translations.txt**. Dates: `20261024`–`20261124`. Route types: `0`, `1`, `3`, `6`, `7`, `108`, `109`, `200`, `702`, `715`. | `paladio_gtfsdata:/gtfs/tokyo/`, `paladio_gtfsdata:/gtfs/paris/` |
| **Status Plumbing** | `TransitCacheModel` (`backend/app/db/models.py`) tracks `status`, `osm_status`, `gtfs_status`, `valid_until`. Status enum: `PENDING`, `QUEUED`, `BUILDING`, `READY`, `FAILED`, `UNAVAILABLE`. Monitored via `GET /trips/{id}/transit-status` and `GET /trips/transit/registry`. | `models.py:L284-306`, `backend/app/api/trips.py:L779-802, L1008-1055`, `tasks.py:L1314-1980` |
| **Fares & Saved Items** | Card price (€1.80) originates from `ingest_transit_pois.py:390` (`cost_eur=1.80`). Inspector drawer rounds to €2 via `Math.round(poi.cost_eur)`. Saved items are stored client-side in `localStorage` under `paladio_saved_pois_${tripId}` as an array of IDs. | `ingest_transit_pois.py:L390`, `PoiDetailView.tsx:L913-922`, `TripUnifiedSidebar.tsx:L1248-1275, L2704-2708` |

---

## 3. Architecture & Data Flow

```
[ Pruned GTFS Feed on Disk (/gtfs_feeds/<city>) ]
                    │
                    ▼ (Triggered after build_city_gtfs_task or backfill CLI)
[ Celery Task: derive_city_transit_task ]
                    │
                    ├── 1. Compute Capability Flags & Date Spans
                    ├── 2. Collapse Platforms -> transit_stations (WGS84 lat/lon indexed)
                    ├── 3. Parse Routes & Normalize Colors -> transit_lines
                    ├── 4. Group Stop Sequences -> transit_patterns & transit_pattern_stops
                    ├── 5. Extract First Departures & Offsets -> transit_pattern_trips
                    ├── 6. Summarize Spans & Headways -> transit_service_summary
                    ├── 7. Optional Shapes / Transfers -> transit_shapes, transit_transfers
                    │
                    ▼ (Single-transaction atomic swap of active_build_id)
[ PostgreSQL: Compact Derived Transit Schema ]
                    │
                    ▼
[ FastAPI: /api/v1/trips/{trip_id}/transit/* & /api/v1/transit/* ]
   ├── /availability     -> City state, capability flags, feed validity
   ├── /nearby           -> Stations grouped by anchor (Lodging + Day stops)
   ├── /lines            -> Lines grouped by agency & mode
   ├── /lines/{id}       -> Pattern geometry, ordered stops
   ├── /stations/{id}    -> Lines, headways, next departures for selected Day
   └── /map-stations     -> Bounding-box station pins with mode/line badges
                    │
                    ▼
[ Next.js 16 Frontend: TripUnifiedSidebar (Transit Tab) ]
   ├── State Switcher: Empty / Building / Unavailable / Expired / Ready
   ├── Segmented Control: [ Nearby | Lines ] + Mode Chips [ Metro, Rail, Tram, Bus ]
   ├── Station Cards: Real lines, walking time from anchor, explicit accessibility
   ├── Drill-in Detail: Real schedule spans, next scheduled departures
   └── Map Synchronization: Station markers & route polylines
```

---

## 4. Phase-by-Phase Execution Plan

### Phase 1: Clean up Search and add Tab Shell
1. **Search Backend**:
   - In `backend/app/api/pois.py`, filter out transit POIs from `get_pois()` and `hybrid_retriever`:
     - Exclude `AttractionModel.category == 'transit'` and `AttractionModel.id.like('OSM-transit-%')`.
     - Remove `'transit'` from `CATEGORY_SYNONYMS`.
   - Deprecate `_extract_transit_info` and `GET /transit-line` with TODO referencing Phase 6.
2. **Search Frontend**:
   - In `TripUnifiedSidebar.tsx`, remove `'transit'` from `PROJECT_CATEGORIES`.
   - Remove Transit toggle from `TripPlacesSidebar.tsx` and `TripSpeedDial.tsx` where applicable.
3. **Ingest Fix**:
   - In `backend/app/cli/ingest_transit_pois.py`, ensure `stop_code` is stored in its own field rather than appended to the lines list.
4. **Tab Shell**:
   - Extend `MainTabType = 'route' | 'search' | 'transit' | 'saved'`.
   - Add the Transit tab button between Search and Saved.
   - Implement the tab shell with capability and lifecycle awareness (Empty, Building/Queued, Failed, Unavailable, Expired, Ready).

### Phase 2: Derived Transit Database Schema & Ingestion
1. **Alembic Migration**:
   - Create tables: `transit_agencies`, `transit_lines`, `transit_stations`, `transit_patterns`, `transit_pattern_stops`, `transit_pattern_trips`, `transit_service_summary`, `transit_service_days`, `transit_shapes`, `transit_transfers`, `transit_fares`.
   - Add columns to `transit_cache`: `derived_status`, `derived_at`, `active_build_id`, `capabilities` (JSONB), `feed_valid_from`, `feed_valid_to`, `quality` (JSONB).
2. **Derivation Engine (`backend/app/services/transit_derivation_service.py`)**:
   - Stream CSVs in batches (memory-safe for Paris-scale 1GB `stop_times.txt`).
   - Parse GTFS times (handle `> 24:00:00` as service day seconds).
   - Collapse platforms into parent stations; compute fallback contrast colors.
   - Versioned writes under a UUID `build_id`, atomic activation.
3. **Celery Task & CLI**:
   - Register `derive_city_transit_task` in `backend/app/tasks.py`.
   - Add CLI `backend/app/cli/derive_transit.py` for backfilling ready cities.

### Phase 3: Services & API Endpoints
1. **Repository & Service**:
   - `SQLTransitRepository` implementing `ITransitRepository`.
   - `TransitService` handling nearby spatial search (bounding box + Haversine), line details, and scheduled departures.
2. **API Router (`backend/app/api/transit.py`)**:
   - `GET /trips/{trip_id}/transit/availability`
   - `GET /trips/{trip_id}/transit/nearby?day={day_index}`
   - `GET /trips/{trip_id}/transit/lines`
   - `GET /trips/{trip_id}/transit/lines/{line_id}`
   - `GET /trips/{trip_id}/transit/stations/{station_id}`
   - `GET /transit/{city}/map-stations?bbox=...`
3. **Redis Caching**:
   - Cache static line and station details briefly (TTL 1 hour).

### Phase 4: Transit Tab UI
1. **Nearby View**:
   - Anchors: Lodging + Day itinerary stops.
   - Purpose-built station card: official line chips, walking minutes (~80m/min), distance, explicit accessibility badge, save button.
   - Pure distance sort (no fake affinity or recommended rankings).
2. **Lines View**:
   - Grouped by agency and mode.
   - Drill-down: route pattern, ordered stations, map highlight.
3. **Station Detail Drill-in**:
   - Header, serving lines, day-type headways, next scheduled departures.
4. **Missing-Data States**:
   - Shared `TransitExplainBanner` explaining absence cleanly without empty cards.

### Phase 5: Map Layer & Station Detail Panel
1. **Map Layer**:
   - Synchronize station markers and route polylines with the Transit tab.
   - Approximate dashed polyline when `geometry_source == 'stop_sequence'`.
2. **Station Inspector Drawer**:
   - When a station is selected, render a transit-specific station panel in `PoiDetailView` instead of the attraction inspector (no photo carousel, no per-person price, no suggested stay).

### Phase 6: Saved Items & Legacy Retirement
1. **Station Saving**:
   - Use stable IDs `gtfs:<city>:<station_id>` in `localStorage`.
   - Support backwards-compatibility for legacy `OSM-transit-*` IDs.
2. **Retire Legacy Paths**:
   - Remove deprecated `transit_info` and legacy `/transit-line` endpoint once frontend has fully migrated.

### Phase 7: Fares Clarification
1. **Station Cards**:
   - Ensure stations display zero fare.
2. **City-Level Transit Note**:
   - Display a single informational note in the Transit tab header sourced from `TransitFareService` only when `fare_unknown == false`.
   - Label estimated fares clearly.

---

## 5. Verification Plan
- **Automated Tests (`backend/tests/`)**:
  - `test_transit_search_exclusion.py`: Verify Search never returns transit POIs across category, All, and text search.
  - `test_transit_derivation.py`: Synthetic feeds for parent station collapsing, extended route types, `>24h` times, missing files.
  - `test_transit_api.py`: Verify `/availability`, `/nearby`, `/lines`, and `/stations` with trip permission checks.
- **Frontend Tests**:
  - Verify tab navigation, state rendering, mode filtering, and absence banners.
