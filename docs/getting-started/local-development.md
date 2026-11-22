# Local development setup

Build the `cpp_core` C++20 extension, run the FastAPI gateway and Celery workers in Python 3.12+, start the Next.js 16 development server, and execute targeted component and end-to-end test suites outside Docker.

## Build and test the C++20 core (`cpp_core`)

`cpp_core/` has zero third-party C++ runtime dependencies and uses CMake 3.20+ with `FetchContent` to download `pybind11 v2.11.1` and `GoogleTest v1.14.0` during configuration. Compiler warnings are treated as errors (`-Wall -Wextra -Werror`).

1. Configure and compile the static library (`paladio_engine_static`), `pybind11` module (`paladio_core`), and C++ unit tests:

```bash
cmake -S cpp_core -B cpp_core/build -DPALADIO_BUILD_TESTS=ON
cmake --build cpp_core/build -j4
```

2. Run the 23 GoogleTest cases via CTest:

```bash
ctest --test-dir cpp_core/build --output-on-failure
```

3. Build with AddressSanitizer and UndefinedBehaviorSanitizer when debugging memory or bitmask logic:

```bash
cmake -S cpp_core -B cpp_core/build-asan \
  -DPALADIO_BUILD_TESTS=ON \
  -DPALADIO_ENABLE_SANITIZERS=ON
cmake --build cpp_core/build-asan -j4
ctest --test-dir cpp_core/build-asan --output-on-failure
```

4. Install `paladio_core` into your active Python virtual environment via `scikit-build-core`:

```bash
pip install -e ./cpp_core --no-build-isolation
pytest cpp_core/tests/python/test_engine.py -q
```

!!! tip "Standalone `paladio_core` build flags"
    Pass `-DPALADIO_ENABLE_NATIVE=ON` in Release builds to add `-march=native` alongside `-O3 -DNDEBUG`, or `-DPALADIO_BUILD_PYTHON=OFF` when embedding only the `paladio::engine` C++ static target.

## Run the FastAPI backend and Celery workers

The backend requires Python 3.10+ (Docker uses Python 3.12), PostgreSQL 16 with `timescaledb` and `vector` extensions, Redis 7, Valhalla (optional for local unit tests), Tesseract OCR, and Poppler utilities.

1. Install OS packages required for boarding pass and receipt OCR on Debian/Ubuntu:

```bash
sudo apt-get update && sudo apt-get install -y \
  tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa poppler-utils fonts-liberation
```

2. Create a Python virtual environment, install `backend` with dev extras, and ensure `paladio_core*.so` is importable in `backend/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e "./backend[dev]"
```

3. Start PostgreSQL, Redis, and Valhalla via Docker Compose while running Python processes natively on your host, then apply Alembic migrations and verified fare quotes:

```bash
docker compose up -d db redis valhalla
cd backend
alembic upgrade head
python scripts/migrate_verified_fares_to_quotes.py
```

4. Launch FastAPI, the Celery worker across all three queues (`celery`, `transit_build`, `poi_hydration`), and Celery Beat in separate terminals:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
```

```bash
celery -A app.celery_app worker --loglevel=info \
  -Q celery,transit_build,poi_hydration -c 2 --prefetch-multiplier=1
```

```bash
celery -A app.celery_app beat --loglevel=info
```

5. Run targeted backend tests (`backend/tests/conftest.py` installs a Python fallback mock only if compiled `paladio_core` is missing, so test with compiled `paladio_core` whenever verifying solver output):

```bash
pytest backend/tests/test_bridge.py -k test_bridge_solver -q
```

!!! note "Optional Playwright scraping dependency"
    `playwright` is intentionally omitted from `backend/pyproject.toml` and `backend/Dockerfile`, and is lazy-imported only when optional browser-based lodging or rating enrichment fallbacks run (`booking_scraper.py`, `google_maps_rating_resolver.py`, `cli/enrich_ratings.py`).

## Run the Next.js 16 frontend and Playwright suites

The frontend uses Node.js 22, Next.js 16 (`^16.4.6`), React 19 (`19.2.8`), CSS Modules, and Playwright for both React component testing and full end-to-end tests.

1. Install dependencies and start the development server:

```bash
cd frontend
npm ci
npm run dev
```

2. Run ESLint, Playwright component tests (`playwright-ct.config.ts`), or a scoped E2E test (`playwright.config.ts`):

```bash
npm run lint
npm run test:ct
npx playwright test tests/e2e/engine.spec.ts
```

3. Install pre-commit hooks from the repository root so `ruff`, `ruff-format`, `eslint`, `clang-format`, and `scripts/guard_demo_branch.sh` run before every commit:

```bash
pre-commit install
```
