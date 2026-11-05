# Reference: Trip Agent WebSocket Protocol

## Overview

The Trip Agent WebSocket endpoint provides bidirectional streaming communication between the frontend Chat Dock (`useTripAgent`) and the backend `TripAgentRunner` executing local inference via Ollama and FastMCP.

- **Endpoint**: `/api/ws/trip-agent/{trip_id}`
- **Authentication**: JWT token passed via `?token=<jwt>` query parameter or standard auth headers.
- **Access Control**: Validates viewer/editor membership; halts connection with code 4403 if unauthorized.

---

## Client-to-Server Messages

Clients transmit JSON-encoded messages conforming to `AgentClientMessage`:

```typescript
export interface AgentClientMessage {
  type: 'user_message' | 'approve' | 'reject' | 'cancel' | 'undo';
  message?: string;
  proposal_id?: string;
  ui_context?: WorkspaceContextData;
  undo_token?: string;
  revision?: number;
}
```

### 1. `user_message`
Initiates a conversational turn.
```json
{
  "type": "user_message",
  "message": "Optimize day 2 for walking time",
  "ui_context": {
    "active_tab": "plan",
    "selected_day": 2,
    "destination": "Rome"
  }
}
```

### 2. `approve`
Confirms a pending Tier C proposal.
```json
{
  "type": "approve",
  "proposal_id": "prop_99f24ac0"
}
```

### 3. `reject`
Rejects and discards a pending proposal.
```json
{
  "type": "reject",
  "proposal_id": "prop_99f24ac0"
}
```

### 4. `cancel`
Interrupts an ongoing model generation or tool execution immediately.
```json
{
  "type": "cancel"
}
```

### 5. `undo`
Reverts the last applied change or rolls back to a specified revision.
```json
{
  "type": "undo",
  "revision": 3
}
```

---

## Server-to-Client Events

The backend emits structured streaming events adhering to `AgentServerEvent`:

```typescript
export type ServerEventType =
  | 'turn_started'
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'proposal'
  | 'trip_updated'
  | 'warning'
  | 'error'
  | 'turn_done';
```

### Event Specifications

| Event | Payload Key Fields | Description |
|---|---|---|
| `turn_started` | `turn_id` | Emitted when agent begins processing the turn. |
| `token` | `token` | Incremental streaming text chunk for real-time rendering. |
| `tool_call` | `call_id`, `tool`, `args` | Emitted when agent invokes an MCP tool. |
| `tool_result` | `call_id`, `tool`, `ok`, `summary`, `change_set` | Emitted upon tool completion with outcome summary. |
| `proposal` | `proposal_id`, `tool`, `summary`, `diff`, `expires_in_seconds` | Emitted when a Tier C tool requires explicit user confirmation. |
| `trip_updated` | `revision`, `undo_token`, `affected_days` | Broadcasted via Redis Pub/Sub when trip document changes. |
| `warning` | `message` | Non-fatal diagnostic warning or fallback advisory. |
| `error` | `message`, `code` | Execution failure or access error. |
| `turn_done` | `turn_id`, `final_text`, `tools_called` | Turn concluded; agent is idle. |

---

## Concurrency & Session State

1. **Turn Concurrency Lock**: Distributed Redis lock `paladio:lock:agent:{trip_id}` prevents simultaneous conflicting turns on the same trip.
2. **Session Persistence**: Chat history is persisted in Redis (`paladio:agent:session:{trip_id}:{user_id}`) trimmed to the most recent 20 turns.
3. **Multi-Tab Fan-Out**: When any client or tool applies a change, `publish_trip_event()` broadcasts to `paladio:trip:{trip_id}`, updating all open browser tabs and collaborating users instantly.
