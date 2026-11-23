<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-horizontal-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-horizontal.png">
  <img alt="Paladio" src="docs/assets/logo-horizontal.png" width="300">
</picture>

**Self-hosted travel planner for privacy-minded travelers — builds time-valid daily itineraries, tracks real fare drops, and keeps every booking on your own server.**

[![CI](https://github.com/Leandro-Juan/paladio/actions/workflows/ci.yml/badge.svg)](https://github.com/Leandro-Juan/paladio/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Leandro-Juan/paladio)](https://github.com/Leandro-Juan/paladio/releases)
[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/Docs-MkDocs-teal.svg)](https://leandro-juan.github.io/paladio/)

</div>

<!-- Demo visual (GIF / video) will be added here -->

## The Problem & Solution

Planning a multi-day trip usually means juggling spreadsheets, cloud travel apps that lock in your data, and AI chat itineraries that hallucinate opening hours, skip meals, or zigzag across a city. **Paladio** runs on your own infrastructure and separates conversation from math: it hydrates local city POIs, transit schedules, and weather into PostgreSQL, then uses a deterministic C++20 solver to build routes that actually fit your flights, opening times, pace, and budget — with no external LLM API keys required.

## Key Features

- **No LLM required to generate trips, so schedules never hallucinate times or budgets** — A deterministic 9-node pipeline and C++20 branch-and-bound solver (`paladio_core`) enforce opening hours, flight windows, meal spacing, and budget caps in **1.31 ms mean** (`2.05 ms` P95) for a 25-POI city day on a Ryzen 7 7730U ([benchmarks](./cpp_core/docs/benchmarks.md)).
- **Self-hosted street and public transit routing, so walking and transfers stay realistic** — Local Valhalla OSM graphs, compiled GTFS schedules, Transitous fallback, and a 5-tier fare engine compute actual footpaths, metro/rail/bus legs, and pass advice without commercial mapping API quotas.
- **Private on-device booking wallet, so tickets and door PINs never touch third-party clouds** — Local barcode decoding (`zxing-cpp`) and OCR (`tesseract-ocr`) ingest PDFs, screenshots, and Apple Wallet `.pkpass` files, encrypting door PINs and Wi-Fi keys with Fernet and displaying fullscreen scannable passes offline.
- **Statistical flight and hotel deal tracking, so alerts only fire on genuine price drops** — A TimescaleDB Deal Engine tracks fare corridors against 540-day `P10` quantile baselines, filters out red-eye and short-ground traps, and converts verified flight + hotel packages into trips in one click.
- **Optional AI assistant and 82-tool MCP server, so you can bring your own LLM safely** — Connect any of 13 LLM providers (OpenAI, Claude, Gemini, Ollama, vLLM, and more) or external MCP clients like Claude Desktop; high-impact changes pause for diff approval and every edit has instant revision undo.
- **Offline PWA, portable `.trip` archives, and 10 languages, so trips work in airplane mode anywhere** — Pin full itineraries, map tiles, wallet passes, and expenses to IndexedDB, export full or anonymized `.trip` bundles (plus PDF, `.ics`, `.gpx`, `.json`), and switch across 10 languages including full Arabic RTL.

<details>
<summary><strong>All features and capabilities in Paladio</strong></summary>

### Deterministic Trip Engine & C++20 Solver (`paladio_core`)
- **9-node deterministic LangGraph swarm**: Runs end-to-end without generative LLMs, featuring two human-in-the-loop checkpoints (`Verification Required` and PostgreSQL `Trip Overlap Warning`) plus hard date and duration guardrails (`<= 30` days).
- **8-stage Itinerary v2 pipeline**: Builds flight/hotel trip frames, gathers candidate POIs, runs submodular selection, clusters days via regret-2 insertion and Hungarian assignment, allocates pro-rata daily FX budgets, solves days concurrently in C++20, redistributes budget slack, and explains omitted venues (`dropped_pois`).
- **Exact TCOPTW & interactive TSPTW/TSP solvers**: Zero-dependency C++20 `optimize_itinerary` (`N <= 64`, continuous fractional knapsack upper bound, multi-criteria Pareto dominance, physiological meal/fatigue/idle/monotony rules, GIL-free via `pybind11`) plus `solve_tsptw` / `solve_tsp_tour` (EDF + multi-start nearest neighbor + 2-opt/Or-opt) for interactive day re-optimization.
- **Critic & repair loop**: Deterministic `planner_critic` and `planner_repair` (up to 3 passes) auditing missing Tier 1 sights, day overload/underload, meal gaps, excessive transit, idle gaps, and zigzag routing.
- **Personalized & Blank trip modes**: Full structured intake on `/engine` with automatic `localStorage` draft persistence, or Blank Trip mode for manual curation.

### Semantic Discovery & Continuous Taste Learning
- **In-process CPU ONNX embeddings**: Uses `fastembed` (`nomic-ai/nomic-embed-text-v1.5-Q`, 768-D) with automatic idle RAM reclamation and no external Ollama daemon.
- **Zero-LLM `PromptIntentExtractor`**: Projects natural-language trip intent onto 768-D semantic anchors and matches mandatory venues with `rapidfuzz`.
- **Hybrid SQL RRF + Spatial-Semantic MMR**: Fuses `pgvector` HNSW cosine similarity, PostgreSQL full-text search (`tsvector`), `pg_trgm` fuzzy trigrams, and JSONB facets in one query, then diversifies geographically.
- **8-axis Taste Star & nightly SGD ranker**: Calibrate preferences at `/taste-calibration` (`art_culture`, `history_heritage`, `nature_outdoors`, `architecture`, `food_culinary`, `nightlife`, `shopping`, `scenic_views`); 16-D `PoiEncoder` + pure-NumPy `HybridSovereignScorer` + online SGD retrain nightly via Celery Beat, support group taste consensus, and allow full export/reset/purge.

### Interactive Trip Workspace & Cartography (`/trips/[id]`)
- **2D vector & raster maps**: Leaflet + MapLibre GL (`OpenFreeMap` liberty tiles stripped of 3D clutter) plus OSM, Carto Voyager, Carto Dark, and Satellite basemaps with marker clustering.
- **6-tab Plan sidebar**: `Route`, `Search`, `Transit`, `Weather`, `Collections`, and `Agent` synced live with the map.
- **Bottom-left Speed Dial**: `EDIT ROUTE` (drag-and-drop reorder, lock fixed reservations, delete stops, C++ `Solve`), `DROP WAYPOINT` spatial radius filter, and `SIMPLE` / `DETAILED` card density.
- **Custom stops, weather & external navigation**: Trip-scoped custom POI pins, Wikimedia photos, on-demand POI translation (DeepL or LibreTranslate), Open-Meteo forecasts + AQI + seasonal climate fallback, and one-tap handoff to Google Maps, Apple Maps, CoMaps/Organic Maps, OsmAnd, Waze, and Citymapper.
- **Collections & immutable revisions**: Global and trip-scoped bookmark collections with visit-status tracking, GPX/KML/KMZ/Google Maps import, and full `trip_revisions` revert/restore history.

### Self-Hosted Public Transit & Street Routing
- **Valhalla OSM router**: Self-hosted `valhalla` container compiling regional OSM PBF extracts for footpaths, cycling, driving, and solver `N x N` travel matrices.
- **Local GTFS derivation**: Compiles open transit feeds into 14 indexed PostgreSQL tables powering `Directions`, agency-grouped `Lines` (independent Metro/Rail/Tram/Bus filters), and `Nearby` station departure boards.
- **Transitous fallback & 5-tier fares**: Falls back to Transitous (MOTIS) with Redis caching when local GTFS is unavailable, and estimates leg fares plus single-ticket vs. daily pass advice via GTFS fare rules, Tokyo ODPT, London TfL, and cited official fare quotes.

### Private Bookings Wallet & Document Scanner
- **Local parsing with zero cloud OCR**: Extracts metadata from `PDF`, `PNG`, `JPG`, `WEBP`, `TXT`, `.pkpass`, and pasted confirmation text using `zxing-cpp` (IATA BCBP, QR, Aztec, PDF417, Code128, DataMatrix) and `tesseract-ocr` + `poppler-utils`.
- **Category cards & encrypted secrets**: Tailored cards for Flights, Stays & Keys, Attractions, Transit, and Other; `WalletUpNext` countdown; Fernet-encrypted door PINs and Wi-Fi passwords masked behind copyable fields.
- **Gate-ready passes & anchor sync**: Fullscreen high-contrast barcode rendering and one-click `SYNC ITINERARY` to align flights, hotel check-in/out windows, and timed entry stops.

### Route Monitoring & Deal Engine (`/monitoring`)
- **Continuous fare & lodging sweeps**: Daily Celery Beat sweeps (`03:00 UTC`) into a TimescaleDB hypertable (`market_price_ticks`) across Aviasales/Travelpayouts cache, Ryanair public fares, and multi-provider hotel sources (`Booking`, `Google Travel`, `Agoda`, `Trip.com`) with circuit breakers and cross-provider hotel deduplication.
- **540-day quantile baselines**: Computes `q02`–`q90` percentiles across 6 booking lead-time buckets with `GREAT` / `GOOD` / `TYPICAL` / `HIGH` / `PEAK` verdicts.
- **Realism gates & calendars**: Filters dead-window flights (`00:00–05:00`), short ground times (`< 36h`), and low-rated lodging; pairs deals with public holidays; displays 24h/7d/30d/90d curves, multi-month Outbound/Inbound/Roundtrip calendars, and one-click **Make it a Trip** prefill into `/engine`.

### Costs, Live FX & Group Expense Splitting
- **Live ECB conversion & receipt OCR**: Compares recorded spend against target budgets with live ECB rates, converts planned route estimates into ledger items, scans receipt images/PDFs via Tesseract OCR, and exports CSV ledgers.
- **Group settlements**: Splits expenses equally or by custom shares across your Crew Roster and computes the minimum number of peer-to-peer transfers to settle balances.

### Optional AI Assistant (`Plan -> Agent`) & FastMCP Server
- **13 supported LLM providers**: OpenAI, Anthropic (Claude), Google Gemini, Groq, DeepSeek, Mistral AI, OpenRouter, xAI (Grok), Perplexity, Together AI, Cerebras, Custom OpenAI-compatible (vLLM / LocalAI), and local Ollama (with automatic host RAM checks and model unload).
- **82-tool FastMCP server**: Serves 82 tools, 6 resources, and 6 prompts over Streamable HTTP (`/mcp`, Bearer JWT + Host/Origin DNS-rebinding protection) and `stdio` (`python -m app.mcp`), with UI viewport awareness and dynamic toolset loading (21 core + 9 domain toolsets).
- **Tiered safety & audit trail**: `Read` / dry-run (`what_if`), `Tier W` routine writes with 10s Undo toast, and `Tier C` destructive edits gated by 600s diff-preview approval cards, plus 90s exclusive turn locking and SHA-256-hashed `agent_actions` logs.

### Trip Archive, Photo Sync, Exports & Offline PWA
- **World Vault (`/vault`)**: Interactive world map with lifetime trip stats, visited countries, cumulative distance vs. Earth's circumference, and read-only expedition recaps (`/vault/[id]`).
- **Photo Vault sync**: Local photo uploads plus automated bidirectional **Immich** and **Synology Photos / WebDAV** album synchronization.
- **5 export formats**: Self-contained `.trip` ZIP packages (`Full Vault` backup or sanitized `Shareable` profile with SHA-256 manifest and zip-slip protection), Printable PDF Dossier, `.ics` calendar sync, `.gpx` tracks, and `.json`.
- **Offline PWA**: Service Worker caching for app shell and map tiles paired with explicit per-trip IndexedDB pinning.

### Control Center, Self-Hosting & Localization
- **Operations Calendar & relays**: Statutory public holidays by country, interactive personal PTO mode, deal bar overlays, unified `.ics` export, and outbound alerts via **Pushify**, **Pushover**, **Ntfy**, and **Custom Webhooks**.
- **Security & admin controls**: PBKDF2-SHA256 + HS256 JWT auth, per-trip RBAC (`OWNER` / `EDITOR` / `VIEWER`), public registration disabled by default, dynamic `/config` settings & secrets, vault snapshots, and 6-hour GitHub release update checks.
- **Themes, Help Center & 10 languages**: 3 themes (`Pacific Jazz Light`, `Pacific Jazz Dark`, `Silent Waters`), 2 typography presets, Sidebar or Floating Dock navigation, built-in `/help` center (22 articles), standalone encrypted `demo` branch mode, and full localization across `ar` (RTL), `de`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `pt`, and `zh-CN`.

</details>

## Quick Start

Requires [Docker Engine and Docker Compose v2](https://docs.docker.com/engine/install/) (8 GB RAM minimum, 12–16 GB recommended).

```bash
git clone https://github.com/Leandro-Juan/paladio.git
cd paladio
./install.sh   # Windows PowerShell: .\install.ps1
```

`install.sh` verifies Docker, generates random `POSTGRES_PASSWORD` and `JWT_SECRET_KEY` secrets in `.env`, starts the 7-container stack, and waits until `GET http://127.0.0.1:8000/health` responds.

On a fresh database, apply migrations and seed the verified transit fare catalog:

```bash
docker compose exec api alembic upgrade head
docker compose exec api python scripts/migrate_verified_fares_to_quotes.py
```

Open **[`http://localhost:3000`](http://localhost:3000)**, create your first administrator account at `/setup`, and launch **New Trip (`/engine`)** to generate your first itinerary — no API keys required.

<details>
<summary><strong>Hardware sizing, manual install, services & local development</strong></summary>

- **Hardware sizing**: Minimum 8 GB RAM / 4 CPU cores / 20 GB disk; recommended 12–16 GB RAM / 6+ cores / 50 GB+ disk for PostgreSQL, Valhalla OSM extracts, GTFS feeds, and CPU ONNX embeddings.
- **Manual `.env` setup**:
  ```bash
  cp .env.example .env
  # Generate random secrets for POSTGRES_PASSWORD and JWT_SECRET_KEY:
  openssl rand -hex 32
  docker compose up -d --build
  ```
- **Docker Compose services (7)**: `api` (FastAPI + WebSockets + `/mcp`, port `8000`), `frontend` (Next.js 16 + React 19, port `3000`), `db` (PostgreSQL 16 + TimescaleDB + `pgvector`), `redis` (Redis 7 broker & pub/sub), `valhalla` (self-hosted OSM street router), `worker` (Celery across `celery`, `transit_build`, `poi_hydration`), and `beat` (Celery Beat scheduler).
- **Local native development & C++20 build**: See [Install with Docker](./docs/getting-started/installation.md) and [Local Development](./docs/getting-started/local-development.md) for compiling `cpp_core` via CMake/GoogleTest, running `uvicorn`/Celery natively, and running Playwright tests.

</details>

## Usage Examples

### 1. Turn a flight confirmation into a realistic itinerary (Web UI)

1. Open **New Trip (`/engine`)**, choose **Personalized Trip**, and drop a flight/hotel confirmation (`PDF`, screenshot, or `.pkpass`) — or fill in `ORIG` / `DEST`, travel dates, hotel anchor, and budget.
2. Add your travel intent (for example, `Quiet museums, historic neighborhoods, specialty coffee, and late tapas`) and click **Generate Sovereign Trip Plan**.
3. Confirm the extracted constraints at the **Verification Required** modal; Paladio hydrates POIs, solves each day in `paladio_core`, and opens your trip workspace at `/trips/[id]`.
4. Expand the bottom-left **Speed Dial (`+`)**, toggle **EDIT ROUTE**, lock any timed museum or restaurant booking, reorder or swap stops, and click **Solve** to re-optimize around your locked anchors.

### 2. Connect Claude Desktop (or any MCP client) to your trips

Add `PALADIO_API_TOKEN` to `.env`, restart the `api` container, and add Paladio to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paladio": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/path/to/paladio/docker-compose.yml",
        "exec",
        "-T",
        "-e",
        "PALADIO_API_TOKEN=your_paladio_api_token_here",
        "api",
        "python",
        "-m",
        "app.mcp"
      ]
    }
  }
}
```

You can then ask your MCP client things like *"Review my Kyoto trip for tight transfers or meal gaps"* (`review_my_trip` / `get_trip_issues`) or *"Simulate swapping outdoor stops on Day 2 for indoor museums if it rains"* (`what_if` dry-run without modifying your itinerary). See [LLM Providers & MCP Clients](./docs/self-hosting/llm-providers-and-mcp.md) for Streamable HTTP (`/mcp`) setup.

## Why Paladio?

| Capability | Paladio | Cloud Trip Planners | LLM Chat Itineraries |
| :--- | :---: | :---: | :---: |
| **Self-hosted & owns your data** | Yes (Docker + local Postgres) | No (cloud account required) | No (unless local LLM) |
| **Enforces opening hours, flights & budgets mathematically** | Yes (C++20 TCOPTW / TSPTW) | Manual / partial | No (prone to hallucination) |
| **Offline-capable street & public transit routing** | Yes (Valhalla + local GTFS) | Paid tiers / limited | No |
| **Private local ticket OCR & encrypted door PINs** | Yes (`zxing-cpp` + Fernet) | Cloud upload / email forwarding | Manual paste |
| **Automated `P10` flight & hotel deal monitoring** | Built-in (TimescaleDB) | Separate tools | No |
| **Generative LLM required to plan a trip** | No (optional 13-provider chat + MCP) | N/A | Always |

## Documentation & Roadmap

- **Documentation Portal:** [leandro-juan.github.io/paladio](https://leandro-juan.github.io/paladio/) (source in [`docs/`](./docs/))
  - [Installation](./docs/getting-started/installation.md) · [Quickstart](./docs/getting-started/quickstart.md) · [User Guide](./docs/user-guide/trip-workspace.md) · [Self-Hosting](./docs/self-hosting/configuration.md) · [Architecture](./docs/architecture/system-overview.md) · [REST API](./docs/reference/rest-api.md) · [MCP Server (82 Tools)](./docs/reference/mcp-server.md)
- **GitHub Wiki:** [github.com/Leandro-Juan/paladio/wiki](https://github.com/Leandro-Juan/paladio/wiki) (auto-synced from `docs/`)
- **In-App Help Center:** Built into every running instance at `/help` (22 articles across 10 languages)
- **Standalone C++20 Solver:** [`Leandro-Juan/paladio-core`](https://github.com/Leandro-Juan/paladio-core) (mirrored from [`cpp_core/`](./cpp_core/))
- **Roadmap & Changelog:** [`ROADMAP.md`](./ROADMAP.md) · [`BACKLOG.md`](./BACKLOG.md) · [`CHANGELOG.md`](./CHANGELOG.md)

## Contributing, License & Contact

- **Contributing:** Pull requests and bug reports are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) (all commits require DCO sign-off via `git commit -s`), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), and the [Developer Guide](./docs/contributing/developer-guide.md).
- **License:** Released under the [GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE). Created and maintained by [Leandro Juan](https://github.com/Leandro-Juan); original copyright and UI attribution notices must remain intact per AGPLv3 Sections 4 & 7.
- **Contact & Security:** Ask questions in [GitHub Discussions](https://github.com/Leandro-Juan/paladio/discussions), file bugs in [GitHub Issues](https://github.com/Leandro-Juan/paladio/issues), and disclose vulnerabilities privately via [`SECURITY.md`](./SECURITY.md).
