# Technical Reference: WebSocket Gateway Telemetry

This document outlines the message protocols and event lifecycle for the **FastAPI WebSocket Gateway** located at `/ws/stream`.

---

## 1. Connection Lifecycle

Clients establish a persistent bi-directional connection:
```text
ws://localhost:8000/ws/stream?token=<optional_jwt>
```

Authentication is optional for anonymous exploration, but required for saving permanent taste embeddings to a user profile.

---

## 2. Event Types & Payloads

The gateway emits JSON messages with the following standard envelope:

```json
{
  "type": "STAGE_UPDATE | PARTIAL_DATA | HUMAN_INTERRUPTION | COMPLETED | ERROR",
  "stage": "PARSING_TICKETS | EXTRACTING_CONSTRAINTS | SCORING_POIS | SOLVING_TSPTW | DONE",
  "message": "Human-readable status text",
  "payload": {}
}
```

### 2.1. `STAGE_UPDATE`
Emitted as the LangGraph state machine transitions between nodes:

| Stage | Triggering Node | Description |
| :--- | :--- | :--- |
| `PARSING_TICKETS` | `ticket_parser_node` | Pydantic AI is extracting flight and hotel anchors from raw text. |
| `EXTRACTING_CONSTRAINTS` | `assemble_constraints_node` | Compiling temporal boundaries and budgets deterministically. |
| `ANALYZING_PROMPT` | `prompt_analyzer_node` | Extracting taste affinities and preferred cuisines via Ollama. |
| `SCORING_POIS` | `planner_scrape_node` | Batch encoding POIs into 16-D tensors and computing ML scores. |
| `SOLVING_TSPTW` | `planner_optimize_node` | Executing the C++ branch-and-bound optimization solver. |

---

### 2.2. `HUMAN_INTERRUPTION`
Emitted when the state machine pauses due to missing mandatory data:

```json
{
  "type": "HUMAN_INTERRUPTION",
  "stage": "CHECK_MISSING_FIELDS",
  "message": "Missing information for: budget_usd, meals",
  "payload": {
    "fields": ["budget_usd", "meals"]
  }
}
```

#### Resume Request (Client to Server):
```json
{
  "action": "RESUME_GRAPH",
  "answers": {
    "budget_usd": 400.0,
    "meals": [
      {"meal_type": "LUNCH", "window_start_mins": 810, "window_end_mins": 930},
      {"meal_type": "DINNER", "window_start_mins": 1230, "window_end_mins": 1380}
    ]
  }
}
```

---

### 2.3. `COMPLETED`
Emitted when the C++ solver converges and the final itinerary is ready:

```json
{
  "type": "COMPLETED",
  "stage": "DONE",
  "message": "Itinerary optimized successfully!",
  "payload": {
    "itinerary": {
      "days": [
        {
          "day_index": 1,
          "date": "2026-10-12",
          "stops": [...],
          "total_cost_eur": 45.0,
          "total_score": 382.4
        }
      ]
    }
  }
}
```
