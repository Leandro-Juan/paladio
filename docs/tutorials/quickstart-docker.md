# Quickstart with Docker

In this 5-minute tutorial, you will launch the complete Paladio ecosystem locally using Docker Compose. Zero cloud subscriptions or external API keys are required.

---

## 1. System Requirements

Before starting, ensure your system has:
- **Operating System:** Linux (Ubuntu 22.04+, Debian 12+, Fedora), macOS (Apple Silicon or Intel), or Windows (via WSL2).
- **Docker & Compose:** Docker Engine 24.0+ and Docker Compose v2+.
- **RAM:** Minimum 8 GB (16 GB recommended for concurrent local LLM inference).
- **Disk Space:** ~10 GB free space for database storage and quantized model weights.

---

## 2. Clone the Repository

Clone the Paladio monorepo and navigate to its root:

```bash
git clone https://github.com/Leandro-Juan/Paladio.git
cd Paladio
```

---

## 3. Environment Configuration

Paladio uses standard 12-factor configuration via `.env`. A complete local development template is provided:

```bash
cp .env.example .env
```

The default `.env` is pre-configured to communicate seamlessly across the Docker network:
- `POSTGRES_HOST=postgres`
- `REDIS_URL=redis://redis:6379/0`
- `OLLAMA_BASE_URL=http://ollama:11434/v1`

---

## 4. Spin Up the Stack

Launch the container cluster in detached mode:

```bash
docker compose up -d
```

Docker will start the following coordinated services:
1. **`postgres`:** PostgreSQL 16 with `pgvector` and `TimescaleDB` extensions.
2. **`redis`:** Redis 7 for task queuing, caching, and LangGraph checkpointer persistence.
3. **`ollama`:** Local LLM runtime hosting quantized models (`qwen2.5` / `llama3.1`).
4. **`backend`:** FastAPI Semantic Gateway and Celery worker threads.
5. **`frontend`:** Next.js 15 web client with interactive maps and telemetry.

Verify that all containers are healthy:

```bash
docker compose ps
```

---

## 5. Verify the Installation

Once the containers are running, access the user-facing endpoints:

| Service | Local URL | Description |
| :--- | :--- | :--- |
| **Next.js Web UI** | [http://localhost:3000](http://localhost:3000) | Interactive dashboard, trip timeline, and affinity radar |
| **FastAPI Swagger Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | REST API exploration and schema definitions |
| **WebSocket Gateway** | `ws://localhost:8000/ws/stream` | Real-time bi-directional agent streaming endpoint |

---

## 6. Next Steps

Now that your sovereign stack is operational, proceed to the [First Autonomous Swarm Trip](first-autonomous-swarm-trip.md) tutorial to generate your first optimized itinerary.
