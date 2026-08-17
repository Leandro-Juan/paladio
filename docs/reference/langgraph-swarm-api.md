# LangGraph Swarm & API Reference

This document provides technical reference for the internal structures and integration points of the Phase 2 Semantic Gateway Swarm.

---

## The Swarm State Schema (`SwarmState`)

The orchestration layer uses LangGraph to manage the flow of the application. The state is maintained via the `SwarmState` `TypedDict` in `backend/app/swarm/state.py`.

```python
from typing import Annotated, TypedDict, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from app.schemas.itinerary import TravelConstraints

class SwarmState(TypedDict):
    # Appends new messages to the existing list (using the add_messages reducer)
    messages: Annotated[list[BaseMessage], add_messages]
    
    # Text retrieved from the pgvector database
    retrieved_context: str
    
    # Structured output extracted by Pydantic AI
    constraints: Optional[TravelConstraints]
    
    # Internal counter for tracking validation retry loops
    error_count: int
    
    # The final computed itinerary returned from the C++ engine
    final_itinerary: Optional[dict]
```

---

## Python to C++ Integration (`bridge.py`)

The `bridge.py` module is responsible for marshaling Python objects into the C++ `paladio_core` structs.

### `OptimizationConfig` Mapping
The Python `TravelConstraints` (populated by the LLM) map to the C++ `OptimizationConfig` as follows:

| Python (`TravelConstraints`) | C++ (`OptimizationConfig`) | Notes |
| :--- | :--- | :--- |
| `budget_usd` | `max_budget` | Float value mapping directly to the financial cap. |
| `meals` (List) | `breakfast_deadline` | Converts the HH:MM time object to total minutes from midnight. |
| `meals` (List) | `lunch_deadline` | Converts the HH:MM time object to total minutes from midnight. |
| `meals` (List) | `dinner_deadline` | Converts the HH:MM time object to total minutes from midnight. |

### `POI` Mapping
The PostgreSQL database POIs are mapped to the C++ `POI` struct using the `map_category_to_node_type` function:

| Database Category | C++ `NodeType` Enum |
| :--- | :--- |
| `HOTEL` | `NodeType.HOTEL` |
| `ATTRACTION`, `MUSEUM`, `LANDMARK` | `NodeType.ATTRACTION` |
| `BAR` | `NodeType.BAR` |
| `RESTAURANT` | `NodeType.RESTAURANT_LUNCH` |

*Note: For the Phase 2 MVP, temporal constraints (`earliest_time` and `latest_time`) are hardcoded to 08:00 (480 mins) and 22:00 (1320 mins).*

---

## WebSocket Streaming Events

The FastAPI backend exposes a WebSocket endpoint at `ws://<host>:<port>/api/v1/ws/stream`. Clients connect to this endpoint to submit requests and receive granular, real-time updates as the LangGraph executes.

The payloads sent by the server are JSON strings containing `event` and `status` keys.

| Event Type | Status | Description |
| :--- | :--- | :--- |
| `STARTING_INFERENCE` | `running` | Emitted immediately after receiving a valid JSON message from the client. |
| `RETRIEVING_CONTEXT` | `completed` | Emitted when the `rag_node` finishes querying the pgvector database. |
| `EXTRACTING_CONSTRAINTS` | `completed` | Emitted when the Pydantic AI `validator_node` successfully forces the LLM output into the `TravelConstraints` schema. |
| `EVALUATING_ROUTES` | `completed` | Emitted when the `planner_node` finishes matrix generation and the C++ engine successfully computes the optimal path. This payload includes an additional `"data"` key containing the `final_itinerary` JSON. |
| `DONE` | `completed` | Emitted when the entire LangGraph workflow completes successfully. |
| `ERROR` | `<error_message>` | Emitted if the C++ engine throws an exception or fails to find a valid route. |
