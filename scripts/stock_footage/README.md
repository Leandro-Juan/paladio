# Paladio Full-App Stock Footage Recorder

Self-contained Playwright + FFmpeg recording suite that shoots, transcodes, and concatenates the complete 13-chapter 1080p walkthrough of Paladio (`chapters/*.mp4`, `paladio_complete_stock_footage.mp4`, `master_sheet.jpg`, and `FOOTAGE_INDEX.md`).

## Quick Start

Run from the repository root with the Paladio stack up (`frontend` at `http://localhost:3000`, `backend` API at `http://localhost:8000`, `paladio-db-1` Postgres container):

```bash
./scripts/stock_footage/shoot_all.sh
```

By default, artifacts are written to `.local/stock-footage/` at the repository root (gitignored and self-contained outside source trees).

## CLI Options

| Flag | Default | Description |
| ---- | ------- | ----------- |
| `--chapters <list>` | all 13 | Comma-separated chapter numbers (e.g. `01,02,07`) or full slugs |
| `--out <dir>` | `<repo>/.local/stock-footage` | Output root for `chapters/`, `paladio_complete_stock_footage.mp4`, `master_sheet.jpg`, and `FOOTAGE_INDEX.md` |
| `--user <username>` | `admin` | Login username or email used during recording (`admin` by default) |
| `--password <pass>` | `PaladioRecord2026!` | Login password (or temporary recording password when DB snapshot mode is active) |
| `--no-db-reset` | off | Skip `pg_dump` snapshot/restore, temp password override, and Tokyo photo restore |
| `--keep-raw` | off | Keep raw `.webm` Playwright recordings under `<out>/.work/raw/` |
| `--keep-work` | off | Keep intermediate `<out>/.work/` contact sheets, logs, metadata JSON, and concat manifest |
| `--preset <name>` | `fast` | FFmpeg `libx264` preset |
| `--crf <value>` | `18` | FFmpeg `libx264` CRF constant rate factor |
| `--skip-assemble` | off | Skip `assemble_master.py` after encoding selected chapters |
| `-h`, `--help` | — | Print usage help and chapter list |

## Prerequisites

- **Running Paladio stack**: Frontend (`http://localhost:3000`), Backend API (`http://localhost:8000`), and Postgres container (`paladio-db-1`, overrideable via `PALADIO_DB_CONTAINER`).
- **Node + Playwright**: `playwright` resolved from `frontend/package.json` with Chromium installed.
- **System tools**: `node`, `ffmpeg`, `ffprobe`, `python3`, `curl`, and `docker` (unless `--no-db-reset` is used).
- **Seeded fixtures**:
  - `backend/data/trip_photos/demo-trip-tokyo-active/tokyo-photo-1.jpg`
  - `backend/tests/fixtures/travel_documents/boarding_passes/boarding_pass_lufthansa.pkpass`
  - `backend/tests/fixtures/travel_documents/boarding_passes/boarding_pass_iberia_mad_svq.pdf`

## Chapters Recorded

1. `01_auth_and_dashboard` — Login, hero ticket, harmonic radar, best offer card, and dashboard trips
2. `02_trip_itinerary_days_map_edit` — Day 1–4 itinerary, POI inspector drawer, transit view, Edit mode, map pan
3. `03_trip_search_sliders_waypoints_custom_poi` — Keyword & semantic RAG search, sliders, waypoints, custom POI modal
4. `04_trip_transit_weather_collections` — Regional transit passes, weather telemetry, collections & import modal
5. `05_trip_wallet_costs_photos` — Boarding pass viewers, QR inspection, expenses & budget charts, photo gallery
6. `06_trip_config_agent_multicity` — Trip configuration, DateRangePicker, AI travel agent chat, multi-city workspaces
7. `07_engine_trip_creation` — Trip Engine guided/prompt flows, PDF boarding pass autofill, generated itinerary launch
8. `08_monitoring_deals_telemetry_calendar` — Fare alerts, sliders, TimescaleDB market ticks & seasonal calendar
9. `09_vault_world_map_stats_recaps` — Interactive World GeoJSON map, travel stats, milestones, and trip recaps
10. `10_taste_calibration_and_pois` — Taste calibration deck, category weights, and RAG affinity previews
11. `11_config_all_10_sections` — All 10 configuration sections including Solver Constraints & Pacing sliders
12. `12_themes_dock_and_i18n_rtl` — Theme presets, persistent dock, and i18n language switching including Arabic RTL
13. `13_help_center_all_categories` — Knowledge base categories, full articles, search, and shortcut reference

## Database & Asset Safety

When run without `--no-db-reset`:

1. `shoot_all.sh` snapshots the live Postgres database via `pg_dump -Fc` and backs up `backend/data/trip_photos/demo-trip-tokyo-active/` before launching any chapter.
2. An `EXIT INT TERM` trap guarantees restoration of the database (including TimescaleDB pre/post restore hooks and HNSW vector indexes) and sample photo directory even if aborted mid-run.
3. A checkpoint restore runs automatically between **Phase B** (`02`–`06`) and **Phase C** (`01`, `07`, `10`–`12`) so new trips, edits, and configuration changes record against a pristine seeded state.
4. If no `--password` is supplied and the default password does not match the database user, `shoot_all.sh` temporarily sets the PBKDF2 hash during the shoot and restores the original user credentials from the pre-shoot dump on exit.

## Directory Layout

- `shoot_all.sh` — Top-level phased CLI orchestrator
- `lib/recorder_lib.mjs` — Portable Playwright Chromium recorder (hardware ANGLE GL with automatic SwiftShader fallback), human cursor overlay, horizontal scroll reset helper (`resetWorkspaceHorizontalScroll`), and range-slider drag helper
- `lib/auth_bootstrap.mjs` — Headless login bootstrap writing `storageState` (`auth_state.json`)
- `lib/process_chapter.sh` — Bottom-right grey-frame auto-trimmer, `1920x1080` `30fps` H.264 encoder, and 4x3 contact sheet generator
- `lib/restore_db.sh` — TimescaleDB-aware `pg_restore` and HNSW index rebuild script
- `lib/assemble_master.py` — Chapter verifier, lossless FFmpeg concat, 5x4 `master_sheet.jpg`, and `FOOTAGE_INDEX.md` builder
- `chapters/rec_ch01..13_*.mjs` — Individual chapter choreography scripts
