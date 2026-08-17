# How to Run and Test the Offline Swarm

This guide provides step-by-step instructions on how to spin up the Paladio Semantic Gateway Swarm, populate the local database, and test the WebSocket endpoint. 

By the end of this guide, you will have a fully functional, 100% offline travel optimization engine running on your machine.

## Prerequisites

Before starting, ensure you have the following installed:
- **Docker & Docker Compose**: Required for running the Valhalla, PostgreSQL, Ollama, and Redis containers.
- **Python 3.10+**: Required for running the FastAPI backend.
- **CMake & a C++20 Compiler** (Optional, but recommended): Required if you need to recompile the `paladio_core` Python bindings.

---

## 1. Start the Docker Cluster

The entire infrastructure is defined in the root `docker-compose.yml`.

1. Open your terminal and navigate to the project root:
   ```bash
   cd /path/to/Paladio
   ```
2. Spin up the containers in detached mode:
   ```bash
   docker-compose up -d
   ```
3. Verify that the services are running:
   ```bash
   docker-compose ps
   ```
   You should see `db`, `redis`, `valhalla`, and `llm` (Ollama) running. The `init-llm` service will run once and exit gracefully after pulling the `llama3.1` and `nomic-embed-text` models.

---

## 2. Seed the Local Database

Paladio uses `pgvector` to store Points of Interest (POIs) and perform semantic similarity searches offline. We must populate the database with mock data.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Ensure your Python virtual environment is activated and dependencies are installed (`pip install -r requirements.txt` or equivalent).
3. Run the seed script:
   ```bash
   python scripts/seed_pois.py
   ```
   You should see output indicating a successful connection to Postgres, Ollama, and the successful insertion of 17 Madrid POIs into the `madrid_pois` collection.

---

## 3. Run the FastAPI Backend

With the infrastructure running and the database seeded, you can start the Python orchestration layer.

1. From the `backend` directory, start the FastAPI server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

---

## 4. Test the WebSocket Endpoint

To test the full lifecycle of the Semantic Gateway Swarm (RAG Retrieval -> Constraint Extraction -> Transit Routing -> C++ Optimization), you need to connect to the WebSocket.

You can use a tool like [Postman](https://www.postman.com/), [wscat](https://github.com/websockets/wscat), or a simple Python script.

### Using `wscat`
If you have `wscat` installed via npm (`npm install -g wscat`), connect to the server:

```bash
wscat -c ws://localhost:8000/api/v1/ws/stream
```

Once connected, send a JSON payload representing a user request:

```json
{"message": "I want to take a 2-day trip to Madrid. My budget is 500 euros. I absolutely want to visit the Prado Museum, and I need to eat dinner by 20:00 every night."}
```

### Expected Output
You should see a stream of events returned from the server as the LangGraph executes:

```json
{"event": "STARTING_INFERENCE", "status": "running"}
{"event": "RETRIEVING_CONTEXT", "status": "completed"}
{"event": "EXTRACTING_CONSTRAINTS", "status": "completed"}
{"event": "EVALUATING_ROUTES", "status": "completed", "data": {"total_score": 140.5, "total_cost_eur": 85.0, "total_time_mins": 340, "path": [...]}}
{"event": "DONE", "status": "completed"}
```

If you receive an `{"event": "ERROR"}` payload, ensure that the C++ `paladio_core` module was compiled correctly and is accessible in your Python path.
