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

## 3. Versioning, Tagging & Release Protocol (MANDATORY)

Every agent must follow strict Semantic Versioning (`vMAJOR.MINOR.PATCH`) whenever a version bump or tag update is needed:

- **Semantic Nomenclature**:
  - `PATCH` (`v1.0.X`): Bug fixes, non-breaking minor optimizations, UI adjustments, chore updates.
  - `MINOR` (`v1.X.0`): New capabilities, new solver heuristics, new agent swarm features, non-breaking API additions.
  - `MAJOR` (`vX.0.0`): Architectural overhauls, schema-breaking database migrations, backwards-incompatible core C++ interfaces.
- **Strict Prefix**: All git tags **MUST** start with lowercase `v` (e.g., `v1.0.1`, never `1.0.1`).
- **Synchronized Version Triad**:
  Before creating or updating any tag, the version **MUST** be synchronized across all three manifests:
  1. `frontend/package.json` (update via `npm --prefix frontend version X.Y.Z --no-git-tag-version`).
  2. `backend/pyproject.toml` (`version = "X.Y.Z"`).
  3. `frontend/src/components/Sidebar.tsx` (`// vX.Y.Z ENGINE`).
- **Tagging & Release Command Flow**:
  1. Commit changes with DCO sign-off:
     ```bash
     git commit -s -m "chore(release): bump version to vX.Y.Z"
     ```
  2. Create annotated tag:
     ```bash
     git tag -a vX.Y.Z -m "Release vX.Y.Z - <Descriptive Summary>"
     ```
  3. Push commit and tag to origin:
     ```bash
     git push origin main && git push origin vX.Y.Z
     ```
  4. Publish the GitHub release with auto-generated notes:
     ```bash
     gh release create vX.Y.Z --title "Paladio vX.Y.Z - <Descriptive Title>" --generate-notes
     ```

