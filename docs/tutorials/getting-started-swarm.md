# Tutorial: Getting Started with the LangGraph Swarm

This tutorial will guide you through starting the Paladio backend and interacting with the Multi-Agent Swarm via WebSockets.

## Prerequisites

- Python 3.10+
- Paladio `cpp_core` must be compiled and accessible.
- An LLM provider configured (e.g., Ollama running locally on port 11434).

## Step 1: Start the Backend Gateway

Navigate to the `backend/` directory and activate your virtual environment. Start the FastAPI server using Uvicorn:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

You should see logs indicating the Semantic Gateway has initialized:
```text
Initializing Semantic Gateway Lifespan...
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

## Step 2: Connect via a WebSocket Client

Because the swarm streams its state, we must use a WebSocket connection instead of a standard HTTP POST. You can use a tool like [wscat](https://github.com/websockets/wscat) or Postman.

Using `wscat`:
```bash
wscat -c ws://localhost:8000/api/v1/ws/stream
```

## Step 3: Send a Reactive Planning Request

Once connected, send a JSON payload containing your natural language request:

```json
{"message": "Plan a 3 day trip to Madrid next week with a budget of 300 euros."}
```

## Step 4: Observe the Stream

The Swarm will begin processing your request. You will see events stream back in real-time as the LangGraph nodes execute:

```json
{"event": "STARTING_INFERENCE", "status": "running"}
{"event": "ROUTING_INTENT", "status": "completed", "data": "REACTIVE_PLANNING"}
{"event": "RETRIEVING_CONTEXT", "status": "completed", "data": "..."}
{"event": "EXTRACTING_CONSTRAINTS", "status": "completed", "data": {"budget_eur": 300.0, ...}}
{"event": "EVALUATING_ROUTES", "status": "completed", "data": {"days": [...]}}
{"event": "DONE", "status": "completed"}
```

## What Just Happened?

1. The `Router` analyzed your text and determined you wanted an immediate itinerary (`REACTIVE_PLANNING`).
2. The `RAG` node retrieved context about Madrid.
3. The `Validator` used an LLM to parse your text into strict Pydantic constraints.
4. The `Planner` invoked the C++ engine (`run_optimization`) and returned the mathematically optimal route.
