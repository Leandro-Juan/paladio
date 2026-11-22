# Developer guide and contributing conventions

Follow Paladio's strict dynamic-data, zero-legacy, and 10-locale internationalization rules, extend backend capabilities cleanly through Clean Architecture ports or FastMCP tools, verify changes with scoped test commands, and synchronize documentation to the GitHub Wiki.

## Non-negotiable engineering invariants

Contributions across `backend/`, `cpp_core/`, and `frontend/` must adhere to the repository rules enforced by code review and pre-commit tooling:

- **Dynamic data everywhere**: Never introduce mock fallbacks, hardcoded POI fixtures, or static business tables into production paths (`backend/app/`, `frontend/src/`, `cpp_core/src/`). Fail fast when external APIs or database catalogs are missing; isolate test fixtures strictly inside `backend/tests/`, `frontend/tests/`, and `cpp_core/tests/`.
- **Zero-legacy architecture**: Do not add `/api/v1` route aliases, schema synonym fields, or backward-compatibility wrappers. Refactor callers across frontend, backend, MCP tools, and tests directly into the unified modern contract.
- **Mandatory 10-locale i18n**: Wrap every new or modified user-facing string in `useTranslation()` (`t(...)`) and add matching translations across all 10 files in `frontend/public/locales/` (`ar.json`, `de.json`, `en.json`, `es.json`, `fr.json`, `it.json`, `ja.json`, `ko.json`, `pt.json`, `zh-CN.json`).
- **DCO 1.1 sign-off and branch protection**: Sign every commit (`git commit -s`). The pre-commit hook runs `ruff`, `ruff-format`, `eslint`, `clang-format`, and `scripts/guard_demo_branch.sh` (which blocks accidental direct commits onto `demo`).

## Verifying changes with scoped checks

Run pinpoint tests matching the files you modified rather than slow whole-repo verbose runs, and validate all 10 translation files whenever editing UI text.

```bash
# 1. C++20 unit & stress tests
cmake -S cpp_core -B cpp_core/build -DPALADIO_BUILD_TESTS=ON
cmake --build cpp_core/build -j4 && ctest --test-dir cpp_core/build --output-on-failure

# 2. Scoped backend pytest run
pytest backend/tests/test_bridge.py -k test_bridge_solver -q

# 3. Frontend lint, component tests, and scoped Playwright E2E
cd frontend && npm run lint && npm run test:ct && npx playwright test tests/e2e/engine.spec.ts

# 4. 10-locale translation parity & untranslated string check
python3 scripts/i18n/validate_locales.py
python3 scripts/i18n/find_untranslated.py
```

## Common extension recipes

Each subsystem isolates extension points so new capabilities inherit authentication, revision snapshots, and strict validation automatically.

### Adding a new MCP tool and agent toolset entry

1. Implement the async tool function inside the matching module under `backend/app/mcp/tools/`, validating trip access via `get_user_context` and `assert_trip_access`, and returning `create_proposal(...)` if the operation requires Tier C confirmation.
2. Export the function in `backend/app/mcp/tools/__init__.py`.
3. Register it in `backend/app/mcp/server.py` with `mcp.tool(name=…, description=…, annotations=make_annotations(read_only=…, idempotent=…, destructive=…))`.
4. Add the tool name either to `CORE_TOOLS` or a domain bucket in `DOMAIN_TOOLSETS` inside `backend/app/agent/toolsets.py` so `TripAgentRunner` discovers it dynamically.

### Adding a city transit fare adapter

1. Subclass `BaseFareAdapter` (`backend/app/adapters/fares/base_fare_adapter.py`) following `odpt.py` or `tfl.py`.
2. Return normalized fare quotes with provenance URLs and `evidence_hash` digests for `FareResolver` (`backend/app/services/fare_resolver.py`) to persist in `transit_fare_quotes`.

### Extending `paladio_core` C++20 constraints

1. Add fields to `POI` or `OptimizationConfig` in `cpp_core/include/paladio/engine.hpp` with clean default values.
2. Enforce the constraint inside `cpp_core/src/engine.cpp` without adding heap allocations to `SearchState`.
3. Expose matching read/write properties and constructor arguments in `cpp_core/src/bindings.cpp`, update `cpp_core/src/paladio_core.pyi` and `backend/paladio_core.pyi`, and add GoogleTest coverage in `cpp_core/tests/cpp/engine_test.cpp`.

## Building docs locally and syncing the GitHub Wiki

`mkdocs.yml` is the single source of truth for both the GitHub Pages portal (`.github/workflows/docs.yml`) and the GitHub Wiki (`scripts/sync_wiki.py`).

1. Validate the MkDocs site with `--strict` before committing documentation changes (building into `/tmp` avoids cluttering the workspace):

```bash
.venv/bin/mkdocs build --strict -d /tmp/paladio_mkdocs_verify && rm -rf /tmp/paladio_mkdocs_verify
```

2. Regenerate and push the synchronized GitHub Wiki (converting admonitions, tabs, relative links, and screenshot URLs while pruning retired wiki pages):

```bash
git clone git@github.com:Leandro-Juan/paladio.wiki.git /tmp/paladio_wiki_sync
.venv/bin/python scripts/sync_wiki.py --docs-dir docs --wiki-dir /tmp/paladio_wiki_sync --push
rm -rf /tmp/paladio_wiki_sync
```
