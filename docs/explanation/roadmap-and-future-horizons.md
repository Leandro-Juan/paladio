# Architectural Explanation: Strategic Roadmap & Mathematical Horizons

This document provides a detailed architectural breakdown of Paladio's **8-Phase Strategic Roadmap**, detailing completed foundations, active engineering efforts, and upcoming mathematical horizons inspired by operations research, measure theory, and distributed systems.

---

## 1. The 8 Horizons at a Glance

| Horizon | Milestone | Status | Key Deliverables |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **Deterministic Combinatorial Core** | **Completed** | C++20 TCOPTW Branch & Bound solver, continuous knapsack upper bounding, bitmasks, `pybind11` zero-copy bindings ([`paladio-core`](https://github.com/Leandro-Juan/paladio-core)). |
| **Phase 2** | **Reactive Semantic Gateway & Multi-Agent Swarm** | **Completed** | FastAPI WebSocket streaming, LangGraph StateGraph, Pydantic AI local Ollama agents, `interrupt()` human-in-the-loop. |
| **Phase 3** | **Continuous ML & Semantic Knowledge Vault** | **Completed** | 768-D `pgvector` RAG, online EMA taste evolution, 8-D harmonic projection radar, 16-D `PoiEncoder`, POI batch hydration. |
| **Phase 4** | **Polished Reactive UI & Interactive Frontend Experience** | **Active / In Progress** | Elite Next.js 15 frontend: dynamic `TripTimeline` pacing, real-time WebSocket state streaming, interactive SVG `PreferenceRadar`, geospatial `VaultMap`, and multimodal `TransitLegView`. |
| **Phase 5** | **Distributed Ingestion & Anti-Ban Scraping** | **Upcoming** | Celery Beat cron cluster, Playwright stealth scrapers, residential proxy rotation, exponential backoff with jitter. |
| **Phase 6** | **In-Memory Matching & Anomaly Detection** | **Upcoming** | C++ RAM 2D Interval Tree daemon ($O(\log N + K)$ alert matching without disk I/O), TimescaleDB empirical price CDFs, 1-Wasserstein regime shift detection. |
| **Phase 7** | **Interactive Re-Planning & Model Context Protocol (MCP)** | **Planned** | Conversational post-plan re-routing (swapping POIs, adjusting pace dynamically), native Paladio MCP Server for external AI agent integration. |
| **Phase 8** | **Environmental Routing & Sovereign Vault Sync** | **Future** | Micro-climate sun/shade street routing via solar azimuth models, self-hosted Immich/Syncthing photo vault sync, multi-city GTFS global feeds. |

---

## 2. In-Depth Engineering Horizons

### Phase 4: Reactive UI & Interactive Frontend Experience (Active)
- **Dynamic Pacing & Rest Buffers:** Visual indicators warning users when daily walking exertion exceeds threshold parameters.
- **Multimodal Leg Detailing:** Turning raw OSM paths into clear station-by-station transit instructions (e.g., *"Take Metro Line 1 from Sol to Tribunal, 4 stops, 8 mins"*).
- **Interactive Canvas:** Drag-and-drop schedule re-ordering feeding back into the C++ validator.

---

### Phase 5: Distributed Ingestion & Anti-Ban Scraping
- **Anti-Ban Architecture:** To monitor travel prices 24/7 without IP bans, Celery Beat dispatches tasks across rotating residential proxies.
- **Exponential Backoff with Jitter:** When an airline or booking site returns HTTP 429 or CAPTCHA challenges, the scraper suspends requests for $2^c + \text{jitter}$ seconds.
- **Playwright Headless Stealth:** Bypassing Cloudflare and bot detection mechanisms using custom browser fingerprint masking.

---

### Phase 6: In-Memory Matching & 1-Wasserstein Anomaly Detection
- **$O(\log N + K)$ In-Memory Interval Tree (C++):** Instead of querying PostgreSQL for 50,000 active user price alerts on every scraped flight, an in-memory 2D interval tree matches incoming price ticks against price/date intervals in sub-millisecond RAM lookups.
- **1-Wasserstein Distance (Earth Mover's Distance):** To detect true market regime shifts (genuine flight deals vs. noise), the system evaluates empirical price distributions:
  $$W_1(\mu, \nu) = \int_{-\infty}^{\infty} |F_\mu(x) - F_\nu(x)| \, dx$$
  Discretely calculated in $O(N \log N + M \log M)$ by evaluating the area between step functions. When $W_1 > \text{Threshold}$ and the current median is below the historical median, high-confidence bargain alerts are dispatched.

---

### Phase 7: Interactive Re-Planning & Model Context Protocol (MCP)
- **Conversational Re-Routing:** Post-generation conversational tweaks (*"Replace the Prado with Reina Sofía and give me an extra hour for lunch"*), updating constraints and re-solving incrementally without recalculating unimpacted days.
- **Paladio MCP Server:** Exposing Paladio's itinerary solver, POI search, and taste telemetry as an official Model Context Protocol (MCP) server, allowing developers to connect Claude, ChatGPT, or custom autonomous agents directly to Paladio.

---

### Phase 8: Environmental Routing & Sovereign Vault Sync
- **Sun & Shade Walking Corridors:** Incorporating solar azimuth and building height data into Valhalla transit matrices, calculating walking routes that maximize shade during hot summer afternoons.
- **Sovereign Photo Sync:** Bi-directional sync with self-hosted media servers (Immich, Syncthing) to automatically cluster and geotag vacation photos into the completed itinerary timeline.
