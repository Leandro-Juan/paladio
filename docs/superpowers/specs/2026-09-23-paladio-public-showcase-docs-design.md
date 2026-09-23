# Design Specification: Paladio Public Showcase, AGPLv3 Licensing & Documentation Portal

- **Date:** 2026-09-23
- **Author:** Leandro Juan (Lead Systems Architect & Core Developer)
- **Target Repository:** `Leandro-Juan/Paladio` (Root repository)
- **Primary Goal:** Transform Paladio into an elite, production-grade CV star project with an AGPLv3 open-source license protecting sole authorship, a high-impact flagship `README.md`, and a comprehensive Diátaxis documentation site focusing on the LangGraph Multi-Agent Swarm and the 768-D Continuous Semantic Machine Learning engine.

---

## 1. Executive Summary & Value Proposition

Paladio is an air-gapped, 100% sovereign travel intelligence and combinatorial optimization platform designed for self-hosted execution via Docker. It solves a core architectural challenge in applied AI systems: **bridging stochastic, conversational multi-agent workflows with differentiable real-time machine learning and deterministic, sub-millisecond mathematical combinatorial optimization.**

This project serves as Leandro Juan's flagship CV demonstration of distributed backend engineering, state-machine agent orchestration, applied machine learning, and clean systems architecture.

### Core Architectural Pillars
1. **LangGraph Multi-Agent Swarm:** StateGraph orchestration with cyclical self-healing retries, Pydantic AI validation guardrails, and non-blocking human-in-the-loop interruption via `interrupt()`.
2. **Sovereign Machine Learning & Continuous Learning:** 768-D semantic RAG using local embeddings (`nomic-embed-text` via Ollama) and `pgvector`, continuous online Exponential Moving Average (EMA) user taste learning, continuous-to-discrete harmonic projection to 8-D radar telemetry, and Bayesian multi-attribute utility scoring (`HybridSovereignScorer`).
3. **Deterministic Combinatorial Core (`paladio-core`):** Upstream C++20 engine solving the NP-hard Time-Constrained Orienteering Problem with Time Windows (TCOPTW) via branch-and-bound and fractional knapsack relaxation with sub-millisecond execution.
4. **100% Air-Gapped Sovereignty:** Zero cloud API dependencies, zero vendor lock-in. Complete local containerization running on standard hardware (x86_64, ARM64, Apple Silicon).

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
  - `Agent Framework: LangGraph & Pydantic AI`
  - `Core Solver: C++20 (paladio-core)`
  - `Sovereignty: 100% Air-Gapped`
  - `Container: Docker Compose`
- **Hero Hook:** Concise executive summary detailing the hybrid AI/deterministic engine.

### 3.2. Interactive System Architecture (Mermaid Diagram)
A complete visual diagram displaying the end-to-end flow:
```mermaid
graph TD
    Client[Web Client / Mobile App] <-->|WebSocket /ws/stream| Gateway[FastAPI Semantic Gateway]
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
    PS <--> ML[MLScorer & Semantic Learning]
    ML <--> PG[(PostgreSQL 16\nTimescaleDB + pgvector)]
    PO <--> Engine[paladio-core C++20\nBranch & Bound TCOPTW]
```

### 3.3. Deep-Dive Spotlight 1: LangGraph Multi-Agent Swarm
- **Cyclical Self-Healing:** Explanation of how the state bus (`SwarmState`) handles parsing errors and schema correction without crashing or restarting the session.
- **Pydantic AI Guardrail:** Why stochastic LLM generation is strictly quarantined behind typed models (`TravelConstraints`, `BookingAnchors`) before passing into numerical scoring and routing.
- **Human-In-The-Loop (`interrupt()`):** How the system pauses mid-graph execution when vital constraints (budget, dates, meal slots) are ambiguous, streaming interactive prompt requests over WebSockets and resuming upon user input without losing state.

### 3.4. Deep-Dive Spotlight 2: Continuous Machine Learning & Semantic Taste Learning
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

### 3.5. Submodule Reference (`paladio-core`)
- Clear attribution and reference link to `cpp_core/` (`paladio-core`), explaining how the Python orchestrator communicates with the high-performance C++20 solver via `pybind11` and zero-copy data structures.

### 3.6. 3-Step Docker Quickstart
```bash
git clone https://github.com/Leandro-Juan/Paladio.git
cd Paladio
docker compose up -d
```
Verified instructions for accessing the WebSocket gateway at `ws://localhost:8000/ws/stream` and the web interface at `http://localhost:3000`.

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
│   └── handle-human-in-the-loop.md              # WebSocket client integration with interrupt()
├── reference/
│   ├── langgraph-swarm-architecture.md          # State schema, node signatures, checkpointer API
│   ├── ml-feature-tensor-16d.md                 # 16-D PoiEncoder specification & regex rules
│   ├── semantic-learning-engine.md              # SemanticLearningEngine API, anchor vectors, EMA math
│   ├── websocket-gateway-telemetry.md           # Granular streaming event dictionary & payload schemas
│   ├── fastapi-gateway.md                       # REST/WS endpoints, auth dependencies, error codes
│   └── core-engine.md                           # Interface to paladio_core C++ module
└── explanation/
    ├── system-architecture.md                   # Macro architectural treatise & sovereign mandate
    ├── langgraph-vs-chains.md                   # StateGraph vs linear chains, fault tolerance, cycles
    ├── sovereign-ml-and-semantic-rag.md         # Continuous localized ML, pgvector RAG, privacy
    └── continuous-to-discrete-harmonics.md      # Geometry of 768D-to-8D hypersphere projection
```

### 4.3. Legacy Documentation Cleanup
The following outdated files from early prototypes will be safely removed to ensure zero confusion or technical contradictions:
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
