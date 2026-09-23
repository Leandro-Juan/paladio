# System Architecture

Paladio is a 100% sovereign, air-gapped travel optimization platform. It is engineered to solve a fundamental tension in modern AI applications: blending the conversational fluidity and semantic understanding of Large Language Models (LLMs) with the mathematical rigor and speed of deterministic solvers.

This document explains the "why" behind Paladio's architectural decisions.

## 1. The Sovereign Mandate

A core architectural principle of Paladio is that it must be capable of running entirely offline, isolated from the public internet. This "sovereign" mandate was chosen to guarantee privacy, eliminate cloud API subscription costs, and ensure absolute resilience regardless of network availability.

To achieve this without compromising capability, the entire intelligence stack is localized:
- **Language Comprehension:** Powered by local quantization via Ollama (e.g., `llama3.1`), avoiding external API round-trips.
- **Semantic Search:** Achieved using `pgvector` alongside local embeddings (`nomic-embed-text`).
- **Geospatial Routing:** Handled by an offline Valhalla instance packed with OpenStreetMap data, calculating transit matrices without pinging Google Maps or Mapbox.

## 2. The Semantic Gateway (WebSockets)

Traditional web applications rely on stateless HTTP requests (REST/GraphQL). However, the Paladio inference pipeline requires chaining LLM generation, database retrieval, constraint validation, and complex C++ mathematical optimization. This process is highly variable in time and computationally expensive.

If Paladio relied on standard HTTP requests, the connection would frequently timeout before the itinerary could be calculated. 

To solve this, the API layer is designed as a **Semantic Gateway** using WebSockets. When a user submits a natural language request, the gateway holds a persistent, bi-directional connection open. As the internal system works, it streams granular state events (`ROUTING_INTENT`, `EXTRACTING_CONSTRAINTS`, `EVALUATING_ROUTES`) back to the client. This architectural choice dramatically improves the perceived performance of the system by providing immediate and continuous feedback, even when the underlying math takes several seconds to converge.

## 3. The Multi-Agent Swarm (LangGraph)

Instead of relying on a single, monolithic LLM prompt to solve the entire problem—a strategy prone to hallucinations and failure—Paladio orchestrates multiple specialized AI agents using a directed state graph (**LangGraph**).

Why a cyclic state graph instead of a linear chain?
- **Cyclic Retries:** LLMs frequently fail to adhere to strict JSON schemas. Because LangGraph supports cycles, if an agent hallucinates invalid JSON, the system can automatically route backward, feeding the error back to the LLM to correct itself.
- **Human-in-the-loop:** The state graph can be paused mid-execution. If a user asks for a route that exceeds their budget, the graph can pause, emit an event over the WebSocket, and wait for the user to confirm a budget increase before resuming.
- **Isolated Responsibilities:** The **Router** determines intent, the **RAG Node** fetches context, and the **Validator** parses data. Fencing these responsibilities significantly increases the reliability of smaller, locally hosted models.

## 4. The Pydantic Guardrail

The most critical boundary in the Paladio architecture is the bridge between the AI and the C++ engine. The C++ solver expects rigid, typed integers and floats (e.g., `budget = 500.0`, `duration_mins = 120`). If the LLM produces unstructured or conflicting data, the C++ engine will crash or produce invalid routes.

Paladio uses **Pydantic AI** as a non-negotiable guardrail. The Validator agent is forced to map the LLM's natural language understanding into a strict `TravelConstraints` Pydantic model. The stochastic, creative nature of the AI is securely fenced off from the deterministic math engine. If the data doesn't pass Pydantic validation, it never reaches C++.

## 5. Reactive vs. Proactive Orchestration

The system does not just plan trips; it monitors the travel market. The architecture supports two distinct execution paths, dynamically chosen by the Router agent based on user intent:

- **Reactive Planning:** The user needs an immediate answer. The system runs the full validation and C++ optimization pipeline synchronously and returns an itinerary.
- **Proactive Monitoring:** The user wants to wait for a deal (e.g., "Alert me if flights drop below $200"). Instead of running the solver, the system structures the constraints into an **Alert Payload**. This payload is dispatched to the background ingestion workers. As live price data flows into TimescaleDB, the system evaluates empirical CDF arrays using the **1-Wasserstein distance** (Earth Mover's Distance) for rigorous regime shift detection. This approach runs in $O(N \log N + M \log M)$ discrete computation time. Only when a significant distribution shift occurs is the C++ solver spun up to generate the route and push a notification.

## 6. The Deterministic Core Bridge (`paladio-core`)

While Python is exceptional at orchestrating networks, async websockets, and LLMs, it is notoriously slow for NP-Hard combinatorics. 

Paladio offloads the computationally intensive Time-Constrained Orienteering Problem with Time Windows (TCOPTW) to an optimized, compiled C++20 core ([`paladio-core`](https://github.com/Leandro-Juan/paladio-core)). By exposing this C++ logic via `pybind11` and explicitly releasing the Python Global Interpreter Lock (`pybind11::gil_scoped_release`), the Python Gateway concurrently handles thousands of WebSocket connections while C++ threads execute Branch and Bound DFS and Fractional Knapsack heuristics.

## 7. Continuous Differentiable Taste Learning

Recommendation in Paladio avoids heavy fine-tuning of neural networks. Instead, the system maintains a 768-dimensional continuous vector space mapped by local Ollama embeddings (`nomic-embed-text`) and stored in PostgreSQL with `pgvector`.

On every conversational turn, the user's permanent latent taste vector is updated via an Exponential Moving Average (EMA):

$$\mathbf{v}_{\text{new}} = \text{Normalize}\Big((1 - \gamma)\,\mathbf{v}_{\text{hist}} + \gamma\,\mathbf{v}_{\text{prompt}}\Big)$$

This continuous hypersphere is then harmonically projected onto 8 canonical categories, driving real-time SVG Radar telemetry on the Next.js frontend and feeding calibrated scores into the C++ combinatorial solver.

