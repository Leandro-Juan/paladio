# Technical Reference: LangGraph Swarm Architecture

This document provides a comprehensive technical reference for the **LangGraph multi-agent swarm** located in `backend/app/swarm/`.

---

## 1. State Schema (`SwarmState`)

The shared data bus passed between all nodes in the state graph is defined in `backend/app/swarm/state.py`:

```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

class SwarmState(TypedDict):
    messages: Annotated[list, add_messages]    # Chat messages and human interaction logs
    validated_itinerary: dict | None          # Serialized TravelConstraints Pydantic model
    error_count: int                          # Retries counter for cyclic error correction
    final_itinerary: dict | None              # Converged daily schedules from C++ solver
    test_data: dict | None                    # Optional synthetic POIs for mocking/testing
    daily_pois_data: list | None              # Scored and hydrated POI candidates per day
    outbound_flight: dict | None              # Extracted outbound flight anchors
    return_flight: dict | None                # Extracted return flight anchors
    booking_text: str | None                  # Raw unstructured booking confirmation text
    booking_anchors: dict | None              # Extracted BookingAnchors (hotels, flights)
    manual_constraints: dict | None           # Direct user parameters (budget, meal windows)
    prompt_analysis: dict | None              # Extracted tastes, affinities, and mandatory POIs
```

---

## 2. Graph Workflow Logic (`backend/app/swarm/graph.py`)

The graph is compiled using `StateGraph(SwarmState)` with checkpointer persistence:

```mermaid
graph TD
    START --> TP[ticket_parser_node]
    TP --> AC[assemble_constraints_node]
    AC --> CM{check_missing_fields_node}
    CM -->|Missing Data| IN[interrupt() / Pause]
    IN -->|User Resume| PA[prompt_analyzer_node]
    CM -->|Valid| PA
    PA --> PS[planner_scrape_node]
    PS --> PO[planner_optimize_node]
    PO --> END
```

---

## 3. Node Specifications

### 3.1. `ticket_parser_node` (`backend/app/swarm/agents/ticket_parser.py`)
- **Agent Type:** Pydantic AI `Agent` backed by local quantized Ollama model (`qwen2.5`).
- **Input:** `state["booking_text"]`.
- **Output:** Mutates `state["booking_anchors"]` with a typed `BookingAnchors` instance.
- **Error Boundary:** Retries up to 3 times on schema failure. Strips dummy placeholder codes (e.g. `'XXX'`).

### 3.2. `assemble_constraints_node` (`backend/app/swarm/nodes/constraint_builder.py`)
- **Node Type:** Pure deterministic Python function (zero LLM calls).
- **Functionality:** 
  - Extracts destination city strictly from `booking_anchors.hotel.city`.
  - Derives origin city from outbound flight IATA codes via `get_city_from_iata`.
  - Parses ISO-8601 timestamps into calendar date spans.
  - Combines manual financial budget and meal windows.
- **Output:** Mutates `state["validated_itinerary"]`.

### 3.3. `check_missing_fields_node` (`backend/app/swarm/graph.py`)
- **Node Type:** Conditional verification and human-in-the-loop pause.
- **Logic:** Checks whether `origin_city`, `destination_city`, `budget_usd`, `start_date`, `end_date`, or `meals` are null.
- **Execution:** Invokes `interrupt({"message": ..., "fields": [...]})` if mandatory constraints are absent, preserving thread state in checkpointer.

### 3.4. `prompt_analyzer_node` (`backend/app/swarm/agents/prompt_analyzer.py`)
- **Agent Type:** Pydantic AI `Agent` running `RAGPromptAnalysis`.
- **Functionality:** Extracts mandatory POIs (e.g., *"El Prado"*), preferred cuisines, trip pacing, and 8 standard tag affinities:
  `['art_culture', 'history_heritage', 'nature_outdoors', 'architecture', 'food_culinary', 'nightlife', 'shopping', 'scenic_views']`.
- **Output:** Enriches `state["validated_itinerary"]` and outputs `state["prompt_analysis"]`.

### 3.5. `planner_scrape_node` (`backend/app/swarm/graph.py`)
- **Execution:** Executes `FetchTravelContextUseCase`. Queries `pgvector` for destination POIs and executes batch scoring via `MLScorer`.
- **Output:** Mutates `state["daily_pois_data"]`.

### 3.6. `planner_optimize_node` (`backend/app/swarm/graph.py`)
- **Execution:** Executes `OptimizeDailyItineraryUseCase`. Passes validated constraints and candidate POIs to the compiled C++20 engine (`paladio-core`).
- **Output:** Mutates `state["final_itinerary"]`.

---

## 4. Checkpointing & State Persistence

The swarm utilizes LangGraph's checkpointer mechanism (`MemorySaver` for in-memory sessions, Redis for production distributed deployments). This enables:
- **Thread Scoping:** Multiple users maintain independent execution contexts keyed by `thread_id`.
- **Time-Travel Debugging:** Prior states can be inspected step-by-step for auditability and compliance.
