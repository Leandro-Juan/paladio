# Install Paladio with Docker

Deploy the full Paladio stack (`api`, `frontend`, `db`, `redis`, `valhalla`, `worker`, `beat`, plus one-shot `migrate`) using prebuilt multi-arch (`amd64`/`arm64`) Docker images, auto-generated bootstrap secrets in `.env`, automatic migrations and fare seeding, and first-run administrator provisioning at `/setup`.

## Prerequisites and hardware sizing

Paladio runs locally on Linux, macOS, or Windows with Docker Engine and Docker Compose v2 installed, and needs enough RAM to keep PostgreSQL, Valhalla street graphs, and CPU ONNX embeddings responsive concurrently.

| Resource | Minimum | Recommended | Why it matters |
| :--- | :--- | :--- | :--- |
| **RAM** | 8 GB | 12 GB to 16 GB | `valhalla` reserves up to 3,072 MB (`mem_limit: 3072m`), `api` and `worker` allow up to 2,048 MB each, and `beat` allows 512 MB |
| **CPU** | 4 cores | 6+ cores | In-process CPU ONNX inference (`FASTEMBED_THREADS=2`), C++20 `paladio_core` routing, and Valhalla routing tiles (`cpus: 2.0`) |
| **Disk** | 20 GB free | 50 GB+ free | Prebuilt images, `/opt/models/fastembed` ONNX weights, `pgdata`, `valhalladata` OSM extracts, and `gtfsdata` transit feeds |
| **Software** | Docker + Compose v2 | Docker Engine 24+ | `scripts/install/install.sh` and `scripts/install/install.ps1` verify `docker`, daemon connectivity, and `docker compose version`, and warn if RAM is below 7.5 GB |

## Services and persistent volumes

`docker-compose.yml` defines seven long-running services, a one-shot `migrate` service, and five named volumes so your secrets, trips, wallet attachments, OSM tiles, and GTFS feeds survive container upgrades.

| Service | Role | Host port binding | Named volumes |
| :--- | :--- | :--- | :--- |
| `api` | FastAPI gateway, WebSockets, MCP `/mcp` server | `${API_PORT:-8000}:8000` | `appdata`, `valhalladata`, `gtfsdata` |
| `frontend` | Next.js 16 standalone web UI (runtime API port config) | `${FRONTEND_PORT:-3000}:3000` | None |
| `db` | PostgreSQL 16 (`timescale/timescaledb:2.30.2-pg16`) + `pgvector` | Internal network only | `pgdata` |
| `redis` | Celery broker, pub/sub events, turn locks, caches (`redis:7.4-alpine`) | Internal network only | `redisdata` |
| `valhalla` | Rootless self-hosted OSM road, foot, bike, and transit graph router | Internal network only | `valhalladata`, `gtfsdata` |
| `worker` | Celery worker (`celery`, `transit_build`, `poi_hydration` queues) | None | `appdata`, `valhalladata`, `gtfsdata` |
| `beat` | Celery Beat scheduler (market sweeps, taste retraining, update checks) | None | `appdata` |
| `migrate` | One-shot init running `alembic upgrade head` + transit fare catalog seed | None | `appdata`, `valhalladata`, `gtfsdata` |

## Single-command install (recommended)

For consuming Paladio directly without cloning the source code, the installer downloads `docker-compose.yml` into `~/paladio` (`%USERPROFILE%\paladio` on Windows), generates cryptographic bootstrap keys in `.env`, pulls the multi-arch GHCR images, starts the stack, and polls both the API and Web UI until healthy:

=== "Linux / macOS"

    ```bash
    curl -fsSL https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.sh | bash
    ```

=== "Windows (PowerShell)"

    ```powershell
    irm https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.ps1 | iex
    ```

=== "Manual docker-compose.yml setup"

    ```bash
    mkdir -p ~/paladio && cd ~/paladio
    curl -fsSLO https://raw.githubusercontent.com/Leandro-Juan/paladio/main/docker-compose.yml
    curl -fsSL https://raw.githubusercontent.com/Leandro-Juan/paladio/main/.env.example -o .env
    # Replace POSTGRES_PASSWORD and JWT_SECRET_KEY in .env (e.g. openssl rand -hex 32)
    # WALLET_ENCRYPTION_KEY auto-generates into /data/.wallet_key if left unset, or can be set explicitly
    docker compose pull && docker compose up -d
    ```

The `migrate` service automatically runs `alembic upgrade head` and seeds the verified transit fare catalog (`scripts/migrate_verified_fares_to_quotes.py`) before `api`, `worker`, `beat`, and `valhalla` start.

## Contributor development stack (local builds + backend hot reload)

If you are actively editing backend, C++20, or frontend code from a cloned repository, combine `docker-compose.yml` with the explicit contributor overlay `docker-compose.dev.yml`. This switches backend services (`migrate`, `api`, `worker`, `beat`) to `target: dev`, enables `uvicorn --reload`, bind-mounts `./backend:/app`, and exposes `db`, `redis`, and `valhalla` on `127.0.0.1`. Because `frontend` still builds the standalone production image (`frontend/Dockerfile`) without a bind mount, re-run with `--build` after frontend or `cpp_core` edits (or run `npm run dev` on the host per [Local development setup](local-development.md)):

```bash
git clone https://github.com/Leandro-Juan/paladio.git
cd paladio
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## First-run administrator provisioning

When you open `http://localhost:3000` on a fresh database with zero user accounts, `AuthGuard` queries `GET /api/auth/setup-status` and routes you automatically to `/setup`.

1. Open `http://localhost:3000` in your browser and wait for the backend auto-reconnect check to finish if `api` is still starting.
2. Enter your administrator **Username**, **Email**, and **Password** (minimum 6 characters) on `/setup` and submit the form (`POST /api/auth/setup`).
3. Paladio signs you in with an HS256 JWT token valid for `ACCESS_TOKEN_EXPIRE_MINUTES` (default `1440`, or 24 hours) and redirects you to Control Center (`/dashboard`).

!!! tip "Public registration is disabled by default"
    After the first admin account exists, `POST /api/auth/register` stays locked unless you set `ALLOW_PUBLIC_REGISTRATION=true` in the environment. Administrators can provision additional user accounts inside **Settings** (`/config` under **Authorized Users**).

## Troubleshooting installation startup

If containers fail to start or `/health` times out after 180s, inspect service logs to isolate memory, pull, or port conflicts:

```bash
docker compose ps -a
docker compose logs -f --tail=100 migrate api worker db valhalla
```

- **Port 3000 or 8000 already in use**: Both `scripts/install/install.sh` and `scripts/install/install.ps1` automatically detect occupied host ports during installation, select the next available `API_PORT` / `FRONTEND_PORT`, and save the resolved ports into `.env` (while leaving ports already bound by Paladio's own Compose containers untouched). If you run `docker compose up -d` manually or want a specific port on an existing install, set `API_PORT` or `FRONTEND_PORT` in `.env` and restart with `docker compose up -d` (the frontend reads `API_PORT` at runtime—no image rebuild needed). You can also pre-select preferred ports on a one-liner install—for example `curl -fsSL https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.sh | API_PORT=8080 FRONTEND_PORT=3001 bash` on Linux/macOS, or `$env:API_PORT="8080"; $env:FRONTEND_PORT="3001"; irm https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.ps1 | iex` on PowerShell.
- **Missing pgvector or timescaledb extension**: Verify the `db` service uses `timescale/timescaledb:2.30.2-pg16` and run `docker compose exec db psql -U postgres -d paladio -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS timescaledb;"`.
- **Out-of-memory kills**: Ensure Docker Desktop or your Linux VM has at least 8 GB of RAM assigned, and keep `API_WORKERS=1` for personal/homelab installs so ONNX embedding weights are only loaded once in the API container.

Next, complete your initial taste profile and generate your first deterministic itinerary in [Quickstart: plan your first trip](quickstart.md).
