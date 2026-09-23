# How-To: Handle Human-In-The-Loop with LangGraph & WebSockets

When essential trip information (such as budget, origin city, or mandatory meal intervals) is missing, Paladio halts execution using LangGraph's native `interrupt()` function and requests user input over WebSockets without losing conversational state.

This guide details how the client application interacts with the **Human-in-the-Loop** mechanism.

---

## 1. The Interruption Contract

In `backend/app/swarm/graph.py`, the `check_missing_fields_node` scans the validated constraints:

```python
if missing_fields:
    answers = interrupt({
        "message": f"Missing information for: {', '.join(missing_fields)}",
        "fields": missing_fields,
    })
```

When `interrupt()` is called:
1. The LangGraph state machine halts immediately.
2. The entire thread history is serialized into the checkpointer (`MemorySaver` or Redis).
3. The WebSocket server emits a `HUMAN_INTERRUPTION` event to the client.

---

## 2. WebSocket Protocol Handling (Client-Side)

### Step 1: Listen for the Interruption Event
In your frontend WebSocket listener (e.g. `frontend/src/components/TripPreparationForm.tsx`):

```typescript
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === "HUMAN_INTERRUPTION") {
    // data.payload contains: { message: "...", fields: ["budget_usd", "meals"] }
    displayClarificationModal(data.payload.fields);
  }
};
```

### Step 2: Render Interactive Clarification Form
Display input fields specifically tailored to the missing items:
- `budget_usd` $\rightarrow$ Currency input field ($ USD)
- `destination_city` $\rightarrow$ City autocomplete input
- `meals` $\rightarrow$ Checkboxes for Lunch ($[13:00, 15:30]$) and Dinner ($[20:30, 23:00]$)

---

## 3. Resuming Execution (`Command(resume=...)`)

Once the user fills in the missing details, send a structured resume payload over the WebSocket connection:

```typescript
const answers = {
  budget_usd: 500.0,
  meals: [
    { meal_type: "LUNCH", window_start_mins: 810, window_end_mins: 930 },
    { meal_type: "DINNER", window_start_mins: 1230, window_end_mins: 1380 }
  ]
};

socket.send(JSON.stringify({
  action: "RESUME_GRAPH",
  thread_id: currentThreadId,
  answers: answers
}));
```

On the backend, `SwarmSessionManager` passes the answers directly to the resumed thread:

```python
from langgraph.types import Command

# Resumes graph execution at the exact interrupt node
await graph.ainvoke(Command(resume={"answers": user_answers}), config=config)
```

The graph unblocks, merges the answers into `validated_itinerary`, and proceeds to the prompt analyzer and optimization phases seamlessly.

---

## 4. Verification

Test the interruption and resume cycle using the automated test suite:

```bash
pytest backend/tests/test_swarm_interrupt.py
```
