# Install Paladio with Docker

Deploy the full 7-container Paladio stack (`api`, `frontend`, `db`, `redis`, `valhalla`, `worker`, `beat`) using Docker Compose, generate bootstrap secrets in `.env`, verify `GET /health`, and provision your first administrator account at `/setup`.

## Prerequisites and hardware sizing

Paladio runs locally on Linux, macOS, or Windows with Docker Engine and Docker Compose v2 installed, and needs enough RAM to keep PostgreSQL, Valhalla street graphs, and CPU ONNX embeddings responsive concurrently.

| Resource | Minimum | Recommended | Why it matters |
| :--- | :--- | :--- | :--- |
| **RAM** | 8 GB | 12 GB to 16 GB | `valhalla` reserves up to 3,072 MB (`mem_limit: 3072m`), `api` and `worker` allow up to 2,048 MB each, and `beat` allows 512 MB |
| **CPU** | 4 cores | 6+ cores | In-process CPU ONNX inference (`FASTEMBED_THREADS=2`), C++20 `paladio_core` compilation, and Valhalla routing tiles (`cpus: 2.0`) |
| **Disk** | 20 GB free | 50 GB+ free | Docker images, `/opt/models/fastembed` ONNX weights, `pgdata`, `valhalladata` OSM extracts, and `gtfsdata` transit feeds |
| **Software** | Docker + Compose v2 | Docker Engine 24+ | `install.sh` and `install.ps1` abort if `docker`, the Docker daemon, or `docker compose version` is unavailable |

## Services and persistent volumes

`docker-compose.yml` defines seven coordinated services and four named volumes so your trips, wallet attachments, OSM tiles, and GTFS feeds survive container upgrades.

| Service | Role | Host port binding | Named volumes |
| :--- | :--- | :--- | :--- |
| `api` | FastAPI gateway, WebSockets, MCP `/mcp` server | `${API_PORT:-8000}:8000` | `valhalladata`, `gtfsdata`, `./backend:/app`, `/var/run/docker.sock` |
| `frontend` | Next.js 16 standalone web UI | `${FRONTEND_PORT:-3000}:3000` | None |
| `db` | PostgreSQL 16 (`timescale/timescaledb:latest-pg16`) + `pgvector` | `127.0.0.1:5432:5432` | `pgdata` |
| `redis` | Celery broker, pub/sub events, turn locks, caches | `127.0.0.1:6379:6379` | `redisdata` |
| `valhalla` | Self-hosted OSM road, foot, bike, and transit graph router | `127.0.0.1:8002:8002` | `valhalladata`, `gtfsdata` |
| `worker` | Celery worker (`celery`, `transit_build`, `poi_hydration` queues) | None | `valhalladata`, `gtfsdata`, `./backend:/app`, `/var/run/docker.sock` |
| `beat` | Celery Beat scheduler (market sweeps, taste retraining, update checks) | None | `./backend:/app` |

!!! warning "Docker socket mount on api and worker"
    Both `api` and `worker` mount `/var/run/docker.sock` so the transit pipeline can signal or restart the `valhalla` container after compiling new city map extracts or GTFS feeds. Only run Paladio on trusted host infrastructure.

## Install from a cloned repository

Cloning the repository is the supported installation path because `docker-compose.yml` currently builds `backend/Dockerfile` (`target: dev`) and `frontend/Dockerfile` from your local workspace.

1. Clone the repository and enter the project directory:

```bash
git clone https://github.com/Leandro-Juan/paladio.git
cd paladio
```

2. Run the bootstrap installer or create `.env` from `.env.example` to generate a random `POSTGRES_PASSWORD` and `JWT_SECRET_KEY`:

=== "Linux / macOS (automated)"

    ```bash
    ./install.sh
    ```

=== "Windows PowerShell (automated)"

    ```powershell
    .\install.ps1
    ```

=== "Manual .env setup"

    ```bash
    cp .env.example .env
    # Replace POSTGRES_PASSWORD and JWT_SECRET_KEY with random secrets:
    openssl rand -hex 32
    docker compose up -d --build
    ```

3. Confirm the backend gateway is serving health checks and verify database migrations are applied:

```bash
curl -fs http://127.0.0.1:8000/health
docker compose exec api alembic upgrade head
```

4. Seed the verified global transit fare quotes if your database starts empty:

```bash
docker compose exec api python scripts/migrate_verified_fares_to_quotes.py
```

!!! info "About the one-line remote installer scripts"
    `install.sh` and `install.ps1` support piping directly from GitHub (`curl -fsSL https://raw.githubusercontent.com/Leandro-Juan/paladio/main/install.sh | bash`), which downloads `docker-compose.yml` into `$HOME/paladio`. Because the current `docker-compose.yml` references local `build:` contexts (`backend/Dockerfile` and `frontend/Dockerfile`) instead of prebuilt GitHub Container Registry images (`ghcr.io/leandro-juan/paladio-api` and `ghcr.io/leandro-juan/paladio-frontend`), always clone the repository first before running `./install.sh` or `.\install.ps1`.

## First-run administrator provisioning

When you open `http://localhost:3000` on a fresh database with zero user accounts, `AuthGuard` queries `GET /api/auth/setup-status` and routes you automatically to `/setup`.

1. Open `http://localhost:3000` in your browser and wait for the backend auto-reconnect check to finish if `api` is still starting.
2. Enter your administrator **Username**, **Email**, and **Password** (minimum 6 characters) on `/setup` and submit the form (`POST /api/auth/setup`).
3. Paladio signs you in with an HS256 JWT token valid for `ACCESS_TOKEN_EXPIRE_MINUTES` (default `1440`, or 24 hours) and redirects you to Control Center (`/dashboard`).

!!! tip "Public registration is disabled by default"
    After the first admin account exists, `/register` and `POST /api/auth/register` stay locked unless you set `ALLOW_PUBLIC_REGISTRATION=true` in the environment. Administrators can provision additional user accounts inside **Settings** (`/config` under **Authorized Users**).

## Troubleshooting installation startup

If containers fail to start or `/health` times out after 60s, inspect service logs to isolate build, memory, or port conflicts:

```bash
docker compose ps
docker compose logs -f --tail=100 api worker db valhalla
```

- **Port 3000 or 8000 already in use**: Set `API_PORT` or `FRONTEND_PORT` in `.env` and restart with `docker compose up -d`.
- **Missing pgvector or timescaledb extension**: Verify the `db` service uses `timescale/timescaledb:latest-pg16` and run `docker compose exec db psql -U postgres -d paladio -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS timescaledb;"`.
- **Out-of-memory kills during first build**: Ensure Docker Desktop or your Linux VM has at least 8 GB of RAM assigned before building `cpp_core` and downloading `nomic-ai/nomic-embed-text-v1.5-Q` into `/opt/models/fastembed`.

Next, complete your initial taste profile and generate your first deterministic itinerary in [Quickstart: plan your first trip](quickstart.md).
