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
| `VERIFYING_CONSTRAINTS` | `verify_constraints_node` | Reviewing extracted anchors and collecting missing fields. |
| `EVALUATING_GUARDRAILS` | `guardrails_node` | Validating logical boundaries and querying DB schedule overlaps. |
| `ANALYZING_PROMPT` | `prompt_analyzer_node` | Extracting taste affinities and preferred cuisines via Ollama. |
| `SCORING_POIS` | `planner_scrape_node` | Batch encoding POIs into 16-D tensors and computing ML scores. |
| `SOLVING_TSPTW` | `planner_optimize_node` | Executing the C++ branch-and-bound optimization solver. |

---

### 2.2. Human Interruption Events (`HUMAN_INTERRUPTION` / `CLARIFICATION_NEEDED`)

#### A. Constraints Verification (`type: "VERIFICATION_REQUIRED"`)
Emitted when user review or missing parameter collection is required:

```json
{
  "event": "VERIFICATION_REQUIRED",
  "status": "awaiting_input",
  "data": {
    "type": "VERIFICATION_REQUIRED",
    "message": "Review and verify extracted trip constraints.",
    "fields": ["budget_usd"],
    "constraints": { ... },
    "booking_anchors": { ... }
  }
}
```

Resume Request:
```json
{
  "action": "resume",
  "answers": {
    "budget_usd": 2000.0,
    "origin_city": "Madrid",
    "destination_city": "Paris"
  }
}
```

#### B. Schedule Overlap Warning (`type: "TRIP_OVERLAP_WARNING"`)
Emitted when trip dates collide with an existing trip in PostgreSQL:

```json
{
  "event": "TRIP_OVERLAP_WARNING",
  "status": "warning",
  "data": {
    "type": "TRIP_OVERLAP_WARNING",
    "message": "Trip schedule overlap detected with existing trip to Paris.",
    "warning_title": "[WARNING] TRIP SCHEDULE OVERLAP",
    "overlapping_trip": {
      "destination": "Paris",
      "start_date": "2026-10-10",
      "end_date": "2026-10-15"
    },
    "variant": "warning"
  }
}
```

Resume Request:
- **Proceed**: `{"action": "resume", "approved": true, "proceed": true}`
- **Abort**: `{"action": "resume", "approved": false, "abort": true}`

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
