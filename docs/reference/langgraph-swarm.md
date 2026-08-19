# Reference: LangGraph Swarm

This document provides a technical reference for the LangGraph agents, nodes, and state structures located in `backend/app/swarm/`.

## `SwarmState` (State Schema)

The core communication bus for the LangGraph workflow, defined in `state.py`.

```python
class SwarmState(TypedDict):
    messages: list[BaseMessage]
    intent: str
    retrieved_context: str
    validated_itinerary: ItineraryConstraints
    final_itinerary: dict
    error_count: int
```

## Graph Workflow (`graph.py`)

The workflow is compiled using `StateGraph(SwarmState)` and follows this execution logic:

1. **START** -> `router`
2. **Conditional Edge:** `route_after_router`
   - If `REACTIVE_PLANNING` -> `rag` -> `validator` -> `planner` -> **END**
   - If `PROACTIVE_MONITORING` -> `alert` -> **END**

## Agents & Nodes

### `router_node` (`agents/router.py`)
- **Purpose:** Classifies the user's intent to determine which pipeline to run.
- **Output:** Mutates `state["intent"]` to either `"REACTIVE_PLANNING"` or `"PROACTIVE_MONITORING"`.

### `rag_node` (`nodes/retriever.py`)
- **Purpose:** Queries a `pgvector` knowledge base (mocked in the current iteration) for localized constraints.
- **Output:** Mutates `state["retrieved_context"]`.

### `validator_node` (`agents/validator.py`)
- **Purpose:** Uses a Pydantic-constrained LLM to parse the raw text and RAG context into strict structured constraints.
- **Output:** Mutates `state["validated_itinerary"]` (a Pydantic `ItineraryConstraints` model).
- **Error Handling:** Keeps track of `error_count` and throws an error if extraction fails multiple times.

### `planner_node` (`graph.py`)
- **Purpose:** Bridges the validated Python constraints to the C++ optimization engine. Generates mocked POI data for the C++ engine to process.
- **Output:** Mutates `state["final_itinerary"]` containing the optimized multi-day route.

### `alert_node` (`nodes/alert.py`)
- **Purpose:** Handles proactive monitoring requests. Structures an alert payload rather than executing a synchronous optimization.
- **Output:** Mutates `state["final_itinerary"]` with an alert confirmation.
