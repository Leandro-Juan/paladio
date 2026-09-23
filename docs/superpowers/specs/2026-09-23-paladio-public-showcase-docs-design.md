# Design Specification: Paladio Public Showcase, AGPLv3 Licensing & Documentation Portal

- **Date:** 2026-09-23
- **Author:** Leandro Juan (Lead Systems Architect & Core Developer)
- **Target Repository:** `Leandro-Juan/Paladio` (Root repository)
- **Primary Goal:** Transform Paladio into an elite, production-grade CV star project with an AGPLv3 open-source license protecting sole authorship, a high-impact flagship `README.md` (featuring an updated strategic roadmap inspired by `ROADMAP.md` and `BACKLOG.md`), and a comprehensive Diátaxis documentation site spotlighting the LangGraph Multi-Agent Swarm, the 768-D Continuous Semantic ML engine, the Next.js Frontend, and the PostgreSQL/pgvector POI Knowledge Vault.

---

## 1. Executive Summary & Value Proposition

Paladio is an air-gapped, 100% sovereign travel intelligence and combinatorial optimization platform designed for self-hosted execution via Docker. It solves a core architectural challenge in applied AI systems: **bridging stochastic, conversational multi-agent workflows with differentiable real-time machine learning, deterministic sub-millisecond mathematical combinatorial optimization, and rich interactive geospatial visualizations.**

This project serves as Leandro Juan's flagship CV demonstration of distributed backend engineering, state-machine agent orchestration, applied machine learning, database indexing, and clean systems architecture.

### Core Architectural Pillars
1. **LangGraph Multi-Agent Swarm:** StateGraph orchestration with cyclical self-healing retries, Pydantic AI validation guardrails, and non-blocking human-in-the-loop interruption via `interrupt()`.
2. **Sovereign Machine Learning & Continuous Learning:** 768-D semantic RAG using local embeddings (`nomic-embed-text` via Ollama) and `pgvector`, continuous online Exponential Moving Average (EMA) user taste learning, continuous-to-discrete harmonic projection to 8-D radar telemetry, and Bayesian multi-attribute utility scoring (`HybridSovereignScorer`).
3. **Deterministic Combinatorial Core (`paladio-core`):** Upstream C++20 engine (documented separately in `paladio-core`) solving the NP-hard Time-Constrained Orienteering Problem with Time Windows (TCOPTW) via branch-and-bound and fractional knapsack relaxation with sub-millisecond execution.
4. **PostgreSQL & pgvector Knowledge Vault:** Dense POI repository (`attractions`) with 768-D semantic vectors, 7-day operational minute arrays, OSM metadata, GTFS transit caching, and fare structures.
5. **Next.js Real-Time Reactive Frontend:** Interactive dashboard featuring `TripTimeline`, `PreferenceRadar` (dynamic SVG affinity radar), `VaultMap` (geospatial POI explorer), `TransitLegView` (multimodal transit directions), and WebSocket streaming.
6. **100% Air-Gapped Sovereignty:** Zero cloud API dependencies, zero vendor lock-in. Complete local containerization running on standard hardware (x86_64, ARM64, Apple Silicon).

---

## 2. Licensing & Authorship Framework

### 2.1. License Selection: GNU Affero General Public License v3.0 (AGPLv3)
- **File:** `LICENSE`
- **Copyright Statement:**
  ```text
  Copyright (c) 2026 Leandro Juan. All rights reserved.
  ```
- **SaaS / Network Copyleft Protection:** Section 13 enforces that any party running Paladio across a network or offering it as a service must make the complete source code available under AGPLv3.
- **Section 7(b) Attribution Notice:** All public deployments, interactive CLI sessions, and user interfaces must conspicuously display:
  `"Powered by Paladio | Created by Leandro Juan"`

### 2.2. Contribution Governance & Developer Certificate of Origin (DCO)
- **File:** `CONTRIBUTING.md`
- **Contributor Guidelines:**
  - Mandatory sign-off on commits (`git commit -s` / Developer Certificate of Origin 1.1).
  - Explicit agreement that contributors grant copyright license under AGPLv3 while acknowledging Leandro Juan as the sole original author and principal maintainer with full authority over release management.
  - Clear PR requirements: PEP 8 / Ruff compliance, 100% type annotations, passing test suite (`pytest tests/`), and clean documentation updates.

---

## 3. Flagship Showcase `README.md` Specification

The root `README.md` is designed to be visually arresting and technically authoritative, providing immediate proof of senior-level software craftsmanship.

### 3.1. Badges & Header
- **Badges:**
  - `License: AGPLv3`
  - `Python: 3.11+`
  - `Frontend: Next.js 15 & Tailwind`
  - `Agent Framework: LangGraph & Pydantic AI`
  - `Core Solver: C++20 (paladio-core)`
  - `Database: TimescaleDB & pgvector`
  - `Sovereignty: 100% Air-Gapped`
  - `Container: Docker Compose`
- **Hero Hook:** Concise executive summary detailing the hybrid AI/deterministic engine.

### 3.2. Interactive System Architecture (Mermaid Diagram)
A complete visual diagram displaying the end-to-end flow:
```mermaid
graph TD
    Client[Next.js 15 Frontend\nRadar / Map / Timeline] <-->|WebSocket /ws/stream| Gateway[FastAPI Semantic Gateway]
    Gateway <--> Session[SwarmSessionManager]
    Session <--> Graph[LangGraph StateGraph Engine]
    
    subgraph Swarm[LangGraph Multi-Agent Swarm]
        TP[Ticket Parser Agent\nPydantic AI + Ollama] --> AC[Constraint Builder Node\nDeterministic Assembly]
        AC --> CM{Check Missing Fields\ninterrupt() Pause}
        CM -->|Human Input Resumed| PA[Prompt Analyzer Agent\nPydantic AI + Ollama]
        PA --> PS[Planner Scrape Node\nContext Ingestion & MLScorer]
        PS --> PO[Planner Optimize Node\nBridge to C++ Solver]
    end
    
    Graph --> Swarm
    PS <--> ML[MLScorer & Semantic Learning Engine]
    ML <--> PG[(PostgreSQL 16\nTimescaleDB + pgvector Vault)]
    PO <--> Engine[paladio-core C++20\nBranch & Bound TCOPTW]
```

### 3.3. Core Feature Spotlights

#### Spotlight 1: LangGraph Multi-Agent Swarm
- **Cyclical Self-Healing:** The state bus (`SwarmState`) handles parsing errors and schema correction without crashing or restarting the session.
- **Pydantic AI Guardrail:** Why stochastic LLM generation is strictly quarantined behind typed models (`TravelConstraints`, `BookingAnchors`) before passing into numerical scoring and routing.
- **Human-In-The-Loop (`interrupt()`):** How the system pauses mid-graph execution when vital constraints (budget, dates, meal slots) are ambiguous, streaming interactive prompt requests over WebSockets and resuming upon user input without losing state.

#### Spotlight 2: Dynamic ML & Continuous Semantic Taste Learning
- **768-D Semantic Hypersphere:** How natural language requests are embedded into dense continuous representations via local Ollama instances (`nomic-embed-text`) and stored in `pgvector`.
- **Permanent EMA Vector Evolution:**
  $$\mathbf{v}_{\text{new}} = (1 - \gamma)\mathbf{v}_{\text{hist}} + \gamma \mathbf{v}_{\text{prompt}} \quad (\gamma = 0.20)$$
  Showing how the system remembers user tastes across sessions without external fine-tuning.
- **Harmonic Projection to 8-D Category Affinities:**
  $$\mathbf{a}_k = \frac{\mathbf{v} \cdot \mathbf{u}_k + 1}{2} \quad \text{for } k \in [1, 8]$$
  Mapping latent vectors into interpretable categories (`art_culture`, `history_heritage`, `nature_outdoors`, `architecture`, `food_culinary`, `nightlife`, `shopping`, `scenic_views`) to drive real-time frontend Radar charts.
- **Deterministic 16-D `PoiEncoder` & Bayesian Scoring:**
  - 16-D feature tensor layout.
  - Bayesian rating smoothing prior:
    $$S_{\text{qual}} = \frac{R \cdot v + C \cdot m}{v + m} \quad (m = 50, C = 4.0)$$
  - Multi-attribute utility function combining quality, affinity, pacing, and budget.

#### Spotlight 3: POI Knowledge Vault & Transit Database
- **PostgreSQL 16 + pgvector Schema:** `attractions` table storing 768-D embeddings, 7-day operational minute vectors (`ARRAY(Integer)`), cost models, and metadata.
- **POI Hydration CLI:** Automated batch synthesis (`PoiNaturalLanguageSynthesizer` + `app.cli.hydrate_pois`) for populating semantic vector spaces.
- **Multimodal Transit Engine:** Local Valhalla routing, GTFS feed resolver (`transit_cache`), and public transport ticketing models (`city_transit_fares`).

#### Spotlight 4: Modern Reactive Frontend (Next.js 15)
- **Interactive UI Capabilities:**
  - **`TripTimeline`:** Dynamic schedule cards, pacing bars, meal slot indicators, and expense tracking.
  - **`PreferenceRadar`:** Live SVG 8-axis affinity radar rendering real-time taste evolution from the backend ML model.
  - **`VaultMap`:** Geospatial POI catalog exploration with category filtering.
  - **`TransitLegView`:** Turn-by-turn multimodal transit legs (metro lines, walking paths, station transfers).

### 3.4. Strategic Product & Technical Roadmap
An updated, structured roadmap synthesizing the completed foundation and future horizons, integrating inspirations from `ROADMAP.md` and `BACKLOG.md`:

| Horizon | Milestone | Status | Key Deliverables & Innovations |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **Deterministic Combinatorial Core** | **Completed** | C++20 TCOPTW Branch & Bound solver, continuous knapsack upper bounding, bitmasks, `pybind11` zero-copy bindings (`paladio-core`). |
| **Phase 2** | **Reactive Semantic Gateway & Multi-Agent Swarm** | **Completed** | FastAPI WebSocket streaming, LangGraph StateGraph, Pydantic AI local Ollama agents, `interrupt()` human-in-the-loop. |
| **Phase 3** | **Continuous ML & Semantic Knowledge Vault** | **Completed** | 768-D `pgvector` RAG, online EMA taste evolution, 8-D harmonic projection radar, 16-D `PoiEncoder`, POI batch hydration. |
| **Phase 4** | **Polished Reactive UI & Interactive Frontend Experience** | **Active / In Progress** | Elite Next.js 15 frontend: dynamic `TripTimeline` pacing, real-time WebSocket state streaming, interactive SVG `PreferenceRadar`, geospatial `VaultMap`, and multimodal `TransitLegView`. |
| **Phase 5** | **Distributed Ingestion & Anti-Ban Scraping** | **Upcoming** | Celery Beat cron cluster, Playwright stealth scrapers, residential proxy rotation, exponential backoff with jitter. |
| **Phase 6** | **In-Memory Matching & Anomaly Detection** | **Upcoming** | C++ RAM 2D Interval Tree daemon ($O(\log N + K)$ alert matching without disk I/O), TimescaleDB empirical price CDFs, 1-Wasserstein regime shift detection. |
| **Phase 7** | **Interactive Re-Planning & Model Context Protocol (MCP)** | **Planned** | Conversational post-plan re-routing (swapping POIs, adjusting pace dynamically), native Paladio MCP Server for external AI agent integration. |
| **Phase 8** | **Environmental Routing & Sovereign Vault Sync** | **Future** | Micro-climate sun/shade street routing via solar azimuth models, self-hosted Immich/Syncthing photo vault sync, multi-city GTFS global feeds. |

### 3.5. 3-Step Docker Quickstart
```bash
git clone https://github.com/Leandro-Juan/Paladio.git
cd Paladio
docker compose up -d
```
Verified instructions for accessing the web UI at `http://localhost:3000` and the WebSocket gateway at `ws://localhost:8000/ws/stream`.

---

## 4. Diátaxis Documentation Portal Architecture (`docs/` + `mkdocs.yml`)

### 4.1. Configuration (`mkdocs.yml`)
- **Theme:** `material` with dark/light auto-toggle, code block copy buttons, and deep search.
- **Markdown Extensions:** `pymdownx.arithmatex` (KaTeX math support), `pymdownx.superfences` (Mermaid diagram support), `admonition`, `pymdownx.details`, `pymdownx.tabbed`.
- **Navigation:** Organized cleanly into Diátaxis quadrants.

### 4.2. File Hierarchy & Scope
```text
docs/
├── index.md                                     # Documentation Portal Homepage & Architecture Map
├── tutorials/
│   ├── quickstart-docker.md                     # 5-minute containerized setup
│   └── first-autonomous-swarm-trip.md           # End-to-end interactive itinerary generation
├── how-to/
│   ├── add-custom-langgraph-agent.md            # Extending SwarmState and adding Pydantic AI agents
│   ├── tune-ml-taste-learning.md                # Modifying EMA gamma, anchors, and harmonic projections
│   ├── configure-hybrid-scoring-weights.md      # Calibrating Bayesian priors and multi-attribute utility
│   ├── handle-human-in-the-loop.md              # WebSocket client integration with interrupt()
│   └── hydrate-poi-embeddings.md                # Running CLI batch hydration for pgvector
├── reference/
│   ├── langgraph-swarm-architecture.md          # State schema, node signatures, checkpointer API
│   ├── ml-feature-tensor-16d.md                 # 16-D PoiEncoder specification & regex rules
│   ├── semantic-learning-engine.md              # SemanticLearningEngine API, anchor vectors, EMA math
│   ├── poi-database-schema.md                   # PostgreSQL schema (attractions, users, transit)
│   ├── frontend-architecture.md                 # Next.js component hierarchy, radar telemetry, stores
│   ├── websocket-gateway-telemetry.md           # Granular streaming event dictionary & payload schemas
│   └── fastapi-gateway.md                       # REST/WS endpoints, auth dependencies, error codes
└── explanation/
    ├── system-architecture.md                   # Macro architectural treatise & sovereign mandate
    ├── langgraph-vs-chains.md                   # StateGraph vs linear chains, fault tolerance, cycles
    ├── sovereign-ml-and-semantic-rag.md         # Continuous localized ML, pgvector RAG, privacy
    ├── continuous-to-discrete-harmonics.md      # Geometry of 768D-to-8D hypersphere projection
    └── roadmap-and-future-horizons.md           # In-depth architectural roadmap & mathematical horizon
```

### 4.3. Legacy Documentation Cleanup
The following outdated files from early prototypes will be safely removed:
- `docs/reference/autograd-api.md` (superseded by pure NumPy/EMA engine)
- `docs/reference/feature-pipeline-mlp.md` (superseded by `ml-feature-tensor-16d.md`)
- `docs/explanation/dynamic-scoring-architecture.md` (superseded by `sovereign-ml-and-semantic-rag.md`)

---

## 5. CI/CD & Deployment Automation (`.github/workflows/docs.yml`)

A production GitHub Actions workflow to build and publish the documentation portal:
- **Triggers:** Push to `main` when changes occur in `docs/**`, `mkdocs.yml`, or `README.md`.
- **Environment:** Ubuntu latest, Python 3.11.
- **Action:** Runs `mkdocs gh-deploy --force` to publish static artifacts to the `gh-pages` branch.
- **Consequence:** Zero maintenance public documentation site at `https://leandro-juan.github.io/Paladio/`.

---

## 6. Implementation Verification Plan

1. **Linting & Formatting:** Ensure all markdown documents follow clean CommonMark standards with working relative links and valid Mermaid diagrams.
2. **Local Documentation Build:** Execute `mkdocs build --strict` locally to verify that all links, KaTeX math blocks, and search indices compile without warnings or broken references.
3. **License Verification:** Confirm that `LICENSE` is valid AGPLv3 and that copyright headers explicitly attribute **Leandro Juan**.
4. **Git Cleanliness:** Ensure all new and updated files are committed cleanly with standard git conventions.
