# The Semantic Gateway Swarm Architecture

The Paladio orchestration layer (Phase 2) is designed as a **Semantic Gateway Swarm**. It serves as the conversational entry point for the travel optimization engine, translating natural language constraints into mathematically rigorous routing problems.

## The 100% Sovereign Offline Architecture

A core mandate of the Paladio project is that it must be entirely self-hosted, portable, and capable of running in a completely air-gapped (offline) environment. This architectural decision prevents reliance on rate-limited, expensive, or privacy-invasive cloud APIs.

To achieve this, the entire stack runs locally via Docker Compose:
- **LLM Inference**: Powered by Ollama (`llama3.1`) for language processing and intent extraction.
- **Embeddings**: Handled locally via `nomic-embed-text`.
- **Database**: TimescaleDB with `pgvector` for offline Point of Interest (POI) storage and vector similarity search.
- **Routing Engine**: Valhalla is used for generating door-to-door transit matrices completely offline using OpenStreetMap data.

## Lifecycle of a User Request

When a user submits a travel request, the system processes it through a strict pipeline:

1. **WebSocket Connection**: The user connects to the FastAPI backend via WebSockets. This allows for long-running graph executions while streaming granular progress back to the UI.
2. **Context Retrieval**: The LangGraph workflow queries the local `pgvector` database to fetch relevant POIs and constraints based on the user's prompt.
3. **Guardrail Validation**: An AI agent extracts the constraints (budget, dates, nodes, meal requirements) and forces them into a strict JSON schema (`TravelConstraints`).
4. **Transit Matrix Generation**: The planner queries Valhalla to calculate travel times and costs between all requested points.
5. **Deterministic Optimization**: The Python backend bridges the data into the C++ `paladio_core` engine, which solves the TSPTW (Traveling Salesperson Problem with Time Windows) constraint mathematically.
6. **Result Streaming**: The optimal itinerary is streamed back to the user via the WebSocket.

## The LangGraph Swarm Roles

The orchestration is managed by a directed graph framework (LangGraph) comprising three primary nodes:

### 1. The RAG Retriever Node (`rag_node`)
This node is responsible for fetching semantic context. It uses LangChain's `PGVector` store. By running similarity searches against the user's prompt using the `nomic-embed-text` embeddings, it retrieves the `cost`, `duration_mins`, and `category` of potential POIs without relying on external search APIs.

### 2. The Validator Agent Node (`validator_node`)
Large Language Models are prone to hallucinating numbers and breaking JSON schemas. Paladio mitigates this by utilizing **Pydantic AI**. The Validator is not a conversational agent; it is a strict data-extraction guardrail. It takes the retrieved context and the user prompt, and guarantees that the output perfectly matches the `TravelConstraints` Pydantic model. If the LLM hallucinates, Pydantic AI automatically catches the validation error and re-prompts the model up to 3 times to correct itself.

### 3. The Planner Node (`planner_node`)
This is the bridge node. It is entirely deterministic (no LLM logic is run here). Its responsibilities include:
- Fetching the exact GPS coordinates for the validated POIs.
- Building the $N \times N$ `transit_matrix` via Valhalla.
- Injecting a "slack time" buffer to all transit durations (e.g., +15%) to account for human pacing and unforeseen delays.
- Marshaling the Python objects into the C++ `OptimizationConfig` and calling the engine.

## Why Valhalla for Transit Routing?

While OSRM (Open Source Routing Machine) is an excellent offline routing engine, Valhalla was explicitly chosen for Paladio due to its **multimodal capabilities**. 

City tourism often requires dynamic switching between transportation modes. Valhalla supports:
- Pedestrian routing for short distances.
- Public transit (subways, buses, transfers) for longer distances within a city.
- Time-dependent routing (understanding that transit might not run at 3:00 AM).

In the `transit_matrix.py` module, Paladio uses a heuristic to dynamically switch between `pedestrian` costing and `multimodal` (transit) costing if the Euclidean distance between two POIs exceeds 1.5 kilometers. This ensures the C++ engine optimizes based on realistic human travel behavior.
