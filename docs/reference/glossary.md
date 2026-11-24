# Glossary of Paladio terms and engines

Canonical definitions for optimization algorithms, routing backends, storage formats, and product metrics referenced across the Paladio web interface and technical documentation.

| Term | Category | Definition |
| :--- | :--- | :--- |
| **30D Median (`P50`)** | Deal telemetry | The 50th-percentile historical price across the trailing baseline window used to calculate `% OFF` savings on deal banners |
| **8-Stage Itinerary v2** | Core engine | Deterministic multi-day planning pipeline chaining trip framing, candidate pooling, submodular selection, day assignment, FX budgeting, parallel C++ solving, budget slack redistribution, and explainable synthesis |
| **Confirmation Gate (`Tier C`)** | Agent safety | High-impact or destructive MCP tool classification requiring user approval on a `ProposalCard` (`600s` Redis TTL) before database execution |
| **Crew Roster** | Collaboration | Participants (`trip_participants`, both Paladio accounts and guests) used for group taste merging and shared expense splitting |
| **Demo Snapshot** | Deployment | Gzipped + AES-256-GCM encrypted export (`demo-snapshot.enc`) powering the database-free `demo` branch preview |
| **FastMCP** | Protocol server | Python MCP server (`backend/app/mcp/`) exposing 82 tools, 6 resources, and 6 prompts over Streamable HTTP (`/mcp`) and `stdio` |
| **Fernet Encryption** | Security | Symmetric authenticated encryption (`WALLET_ENCRYPTION_KEY`) protecting stored door PINs, Wi-Fi codes, and booking secrets in `trip_tickets` |
| **GTFS** | Transit data | General Transit Feed Specification archives compiled locally into 14 PostgreSQL tables (`transit_*`) to power offline-ready **Directions**, **Lines**, and **Nearby** departures |
| **HITL Interrupt** | Swarm flow | LangGraph human-in-the-loop pause (`verify_constraints` or `guardrails` overlap warning) awaiting client `"resume"` input over `WS /api/ws/stream` |
| **Hybrid RRF & MMR** | Semantic RAG | SQL Reciprocal Rank Fusion merging `pgvector` HNSW cosine, FTS, trigram, and JSONB facets followed by Spatial-Semantic Maximal Marginal Relevance diversification |
| **`HybridSovereignScorer`** | ML ranking | Pure-NumPy multi-attribute POI utility scorer combining Bayesian rating smoothing, 16-D `PoiEncoder` tags, pacing/budget fit, and online SGD adaptation |
| **IATA BCBP** | Wallet scanner | Bar Coded Boarding Pass payload (`M1`/`M2` Aztec, PDF417, QR, DataMatrix) decoded locally with `zxing-cpp` |
| **LangGraph Swarm** | Orchestrator | 9-node deterministic state machine (`backend/app/swarm/`) coordinating ticket parsing, constraints, guardrails, intent extraction, scraping, solving, critic scoring (`J`), and repair loops |
| **Offline Pinning** | PWA | Explicit browser IndexedDB caching (`pinTripOffline`) saving trip JSON, Wallet passes, ticket attachments, and expenses for offline field access |
| **ONNX Embeddings (`fastembed`)** | Local ML | In-process CPU inference (`nomic-ai/nomic-embed-text-v1.5-Q`, 768-D L2-normalized vectors) replacing external Ollama embedding calls |
| **P10 Target** | Deal telemetry | The 10th-percentile historical price threshold computed per route and lead-time bucket; verified packages below target trigger deal alerts |
| **Pacific Jazz** | Design system | Paladio's custom token palette (`light`, `dark`, and `silent-waters` themes) implemented in CSS Modules without Tailwind |
| **Paladio Package (`.trip`)** | File format | Self-contained ZIP archive (`application/vnd.paladio.trip+zip`) exported in `full_vault` or sanitized `community_shareable` mode |
| **`paladio_core`** | C++20 engine | GIL-releasing `pybind11` module providing `optimize_itinerary`, `solve_tsp_tour`, and `solve_tsptw` |
| **Taste Star** | Personalization | 8-axis travel preference radar (`art_culture`, `history_heritage`, `nature_outdoors`, `architecture`, `food_culinary`, `nightlife`, `shopping`, `scenic_views`) shown on Control Center |
| **TCOPTW** | Optimization | Time-Constrained Orienteering Problem with Time Windows solved exactly (`N <= 64`) by `paladio_core.optimize_itinerary` |
| **Transitous** | Transit fallback | Public MOTIS routing API queried with Redis caching when a destination city has no compiled local GTFS archive |
| **`TripRevision`** | Audit / Undo | Immutable before/after itinerary JSON snapshot stored in PostgreSQL on every UI, solver, or agent mutation for one-click revert/restore |
| **TSPTW** | Optimization | Traveling Salesman Problem with Time Windows solved by `paladio_core.solve_tsptw` when re-optimizing locked day routes (`Solve`) |
| **Valhalla** | Routing engine | Self-hosted OpenStreetMap container (`ghcr.io/gis-ops/docker-valhalla/valhalla`) providing local street walking, cycling, and driving legs plus distance matrices |
