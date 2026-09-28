# How-To: Handle Human-In-The-Loop with LangGraph & WebSockets

Paladio uses a robust **Two-Stage Human-in-the-Loop (HITL)** architecture to eliminate LLM hallucinations and protect schedule integrity:
1. **Stage 1 (`verify_constraints_node`)**: Surfaces parsed booking anchors (flights, hotel, cities, dates) and constraints for user inspection and missing field collection.
2. **Stage 2 (`guardrails_node`)**: Evaluates hard logic rules and queries PostgreSQL for conflicting trips. If schedule clashes occur, it pauses with an amber warning modal (`[WARNING] TRIP SCHEDULE OVERLAP`) allowing the user to **PROCEED ANYWAY** or **ABORT**.

---

## 1. Interruption Contracts

### Stage 1: Constraints Verification (`verify_constraints_node`)

In `backend/app/swarm/nodes/verify_constraints.py`:

```python
payload = {
    "type": "VERIFICATION_REQUIRED",
    "message": "Review and verify extracted trip constraints.",
    "fields": missing_fields,
    "constraints": constraints.model_dump(mode="json"),
    "booking_anchors": constraints.booking_anchors.model_dump(mode="json") if constraints.booking_anchors else None,
}
answers = interrupt(payload)
```

### Stage 2: Schedule Overlap Warning (`guardrails_node`)

In `backend/app/swarm/nodes/guardrails.py`:

```python
warning_payload = {
    "type": "TRIP_OVERLAP_WARNING",
    "message": f"Trip schedule overlap detected with existing trip to {overlapping['destination']}.",
    "warning_title": "[WARNING] TRIP SCHEDULE OVERLAP",
    "overlapping_trip": overlapping,
    "variant": "warning",
}
decision = interrupt(warning_payload)
```

---

## 2. WebSocket Protocol Handling (Client-Side)

### Step 1: Listen for Interruption Events

In your frontend WebSocket listener (`frontend/src/contexts/SocketContext.tsx`):

```typescript
switch (payload.event) {
  case 'VERIFICATION_REQUIRED':
    setStatus('awaiting_input');
    setVerificationPayload(payload.data);
    break;

  case 'TRIP_OVERLAP_WARNING':
    setStatus('awaiting_input');
    setOverlapWarning(payload.data);
    break;
}
```

### Step 2: Render Cockpit & Amber Warning Modal

- **Verification Cockpit (`/engine`)**: Renders editable parameters (Origin, Destination, Dates, Budget, Anchors) with real-time hard guardrail validation (`start < today`, `end < start`, `origin == dest`, `duration > 30`).
- **Amber Warning Modal (`Modal.tsx`)**: Mounted with `variant="warning"` (`#D97706`, zero emojis).

---

## 3. Resuming Execution (`Command(resume=...)`)

### Resuming Stage 1 (Verified Parameters)

Send the corrected constraints payload:

```typescript
sendResume({
  origin_city: "Madrid",
  destination_city: "Paris",
  start_date: "2026-10-10",
  end_date: "2026-10-15",
  budget_usd: 2500,
});
```

### Resuming Stage 2 (Overlap Confirmation)

- **Proceed Anyway**: `sendResume({ approved: true, proceed: true })`
- **Abort Mission**: `sendResume({ approved: false, abort: true })`

Backend execution resumes via LangGraph `Command(resume=...)`:

```python
from langgraph.types import Command

await graph.ainvoke(Command(resume=resume_data), config=config)
```

---

## 4. Verification

Run the automated test suite covering both stages:

```bash
pytest backend/tests/test_first_three_nodes.py backend/tests/test_swarm_session.py -q
```
