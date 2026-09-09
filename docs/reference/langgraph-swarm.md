# Reference: LangGraph Swarm

This document provides a technical reference for the LangGraph agents, nodes, and state structures located in `backend/app/swarm/`.

## `SwarmState` (State Schema)

The core communication bus for the LangGraph workflow, defined in `state.py`.

```python
class SwarmState(TypedDict):
    messages: Annotated[list, add_messages]
    retrieved_context: str | None
    validated_itinerary: dict | None
    error_count: int
    final_itinerary: dict | None
    test_data: dict | None
    daily_pois_data: list | None
    outbound_flight: dict | None
    return_flight: dict | None
    booking_text: str | None
    booking_anchors: dict | None
    manual_constraints: dict | None
    prompt_analysis: dict | None
```

## Graph Workflow (`graph.py`)

The workflow is compiled using `StateGraph(SwarmState)` and follows this execution logic:

1. **START** -> `ticket_parser`
2. `ticket_parser` -> `assemble_constraints`
3. `assemble_constraints` -> `check_missing`
4. `check_missing` -> `prompt_analyzer`
5. `prompt_analyzer` -> `rag`
6. `rag` -> `planner_scrape`
7. `planner_scrape` -> `planner_optimize`
8. `planner_optimize` -> **END**

## Agents & Nodes

### `ticket_parser_node` (`agents/ticket_parser.py`)
- **Purpose:** Extracts flights, hotels, and booking anchors from raw unstructured booking confirmation text using Pydantic AI.
- **Output:** Mutates `state["booking_anchors"]`.

### `assemble_constraints_node` (`nodes/constraint_builder.py`)
- **Purpose:** Deterministically combines ticket booking anchors and manual user constraints (budget, meal windows) into a structured `TravelConstraints` model.
- **Output:** Mutates `state["validated_itinerary"]`.

### `check_missing_fields_node` (`graph.py`)
- **Purpose:** Identifies if critical travel parameters (e.g. origin, destination, budget, dates) are missing and pauses execution via `interrupt()` to request user clarification if needed.
- **Output:** Updates `state["validated_itinerary"]` with user input upon resume.

### `prompt_analyzer_node` (`agents/prompt_analyzer.py` / `nodes/prompt_analyzer.py`)
- **Purpose:** Analyzes the user's conversational prompt and chat history using an LLM agent to extract mandatory POIs, preferred cuisines, travel tastes, and tag affinities.
- **Output:** Enriches `state["validated_itinerary"]` and outputs `state["prompt_analysis"]`.

### `rag_node` (`nodes/retriever.py`)
- **Purpose:** Pure retrieval node querying the `pgvector` knowledge base for localized city POIs matching the destination and extracted taste/POI terms.
- **Output:** Mutates `state["retrieved_context"]`.

### `planner_scrape_node` (`graph.py`)
- **Purpose:** Fetches dynamic context (POIs, hotels, flight verification) from external data providers and applies machine learning scoring.
- **Output:** Mutates `state["daily_pois_data"]`.

### `planner_optimize_node` (`graph.py`)
- **Purpose:** Invokes the high-performance C++ solver to optimize daily schedules and routes subject to spatial-temporal constraints.
- **Output:** Mutates `state["final_itinerary"]`.
