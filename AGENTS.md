# Workspace Agent Rules: Token Optimization & Engineering Standards

## 1. Strict Token Conservation Protocol (MANDATORY)
Every agent working in this repository must actively minimize token consumption:

- **DO NOT read full files over 200 lines**:
  - Always use `grep_search` or `find_by_name` to locate symbols.
  - When inspecting code, use `view_file` with precise `StartLine` and `EndLine` slices.
- **NEVER load or pack high-token data files**:
  - `frontend/public/data/world.geo.json` (116k+ tokens)
  - `backend/tests/test_data.json` (140k+ tokens)
  - `cpp_core/tests/cpp/real_pois_data.hpp` (10k tokens)
  - `comprehensive_audit_report.md`
  - Lockfiles (`package-lock.json`, `poetry.lock`, `skills-lock.json`)
- **Use Compressed Architecture Views**:
  - Before analyzing wide modules, run `repomix --compress --include "<pattern>" --stdout` to inspect Tree-sitter AST skeletons rather than raw implementation files.
- **Targeted Code Modifications**:
  - Use `replace_file_content` for precise, single-block edits. Never rewrite an entire multi-hundred-line file with `write_to_file` unless creating a new file.
- **Quiet & Scoped Commands**:
  - Never run full test suites or commands with verbose debug logging (`-vv`, `--debug`).
  - Run pinpoint tests only: `pytest <test_file> -k <test_name> -q` or `playwright test <spec_file>`.
- **Isolate Broad Research in Subagents**:
  - When broad codebase exploration or multi-file research is needed, spawn a `research` subagent so intermediate search dumps do not pollute the primary conversation context.

## 2. Paladio Architecture & Domain Guardrails (MANDATORY)

### Sovereignty & Portability
- **100% Self-Hosted & Air-Gappable**: Everything runs via `docker-compose`. 
- **NO Cloud LLM APIs**: Strictly forbidden to propose or integrate cloud APIs (OpenAI, Anthropic, AWS, etc.). Local inference only (Ollama/vLLM for quantized models).
- **Designed for Few Users**: Private deployment. Do not over-engineer for massive multi-tenancy.

### Determinism & Performance
- **C++20 Core**: TSPTW, Budget Knapsack, and In-Memory Interval Trees must run deterministically in C++20 via `pybind11` (`paladio_core`). Sub-50ms latency target for 25-node graphs. Zero dynamic heap allocation in hot loops. Always release the Python GIL during C++ computations (`pybind11::gil_scoped_release`).
- **LLM Boundary**: LLMs are strictly for semantic NLP extraction and intent classification. NEVER use LLMs for arithmetic, routing, or combinatorial optimization.
- **Strict Validation**: Enforce Pydantic validation before passing NLP data into C++ binaries.

### Tech Stack Reference
- **Backend**: FastAPI (`backend/app/`), LangGraph swarm (`backend/app/swarm/`), PostgreSQL 16 + pgvector, Redis, Celery Beat.
- **Core Engine**: C++20 optimization solver (`cpp_core/src/`) exposed via pybind11 (`paladio_core`).
- **Frontend**: Next.js 16 (`frontend/src/app/`), React 19, Leaflet, Zustand.

