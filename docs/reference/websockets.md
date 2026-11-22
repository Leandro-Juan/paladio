# WebSocket protocols reference

Paladio uses two WebSocket channels for real-time telemetry: `/api/ws/stream` drives deterministic trip generation and Redis event fan-out, and `/api/ws/trip-agent/{trip_id}` streams interactive AI assistant turns, proposals, and live trip sync updates.

## Swarm stream (`WS /api/ws/stream`)

Handled by `backend/app/api/websockets.py` (`SwarmSessionAdapter` + `SwarmSessionManager`), `/api/ws/stream` accepts optional JWT authentication via `?token=your_jwt_here` or inside the JSON payload `"token"` field, sends a `15s` heartbeat (`{"event": "HEARTBEAT", "status": "ping"}`), and subscribes to the global Redis `paladio:events` pub/sub channel.

### Client-to-server actions on `/api/ws/stream`

Send JSON frames specifying `"action"` and `"thread_id"` (a UUID string identifying the LangGraph checkpointer thread). Starting a new action cancels any prior in-flight inference task on the same socket.

| Action | Key payload fields | Purpose |
| :--- | :--- | :--- |
| `"chat"` (default) | `message`, `prompt`, `origin_city`, `destination_city`, `origin_iata`, `destination_iata`, `start_date`, `end_date`, `departure_hour`, `arrival_hour`, `budget_usd`, `hotel`, `participants`, `scanned_documents`, `booking_text`, `booking_anchors`, `manual_constraints`, `auto_verify` | Starts deterministic 9-node trip generation |
| `"resume"` | `thread_id`, edited verification fields or overlap confirmation fields (`Command(resume=data)`) | Resumes a graph paused at `VERIFICATION_REQUIRED` or `TRIP_OVERLAP_WARNING` |
| `"feedback"` | `poi`, `target_score`, `trip_id` | Encodes a 16-D POI vector, updates `HybridSovereignScorer` + 768-D profile, and records a `TasteEvent` |

### Server-to-client events on `/api/ws/stream`

Every outbound JSON frame contains `"event"`, `"status"`, and optionally `"data"` and `"thread_id"`.

| Event | Trigger | UI meaning |
| :--- | :--- | :--- |
| `HEARTBEAT` | Every `15s` | Keepalive ping |
| `STARTING_INFERENCE` / `PARSING_TICKETS` | Swarm start / `ticket_parser` | Generation initialized and booking text parsed |
| `EXTRACTING_CONSTRAINTS` / `VERIFYING_CONSTRAINTS` / `VERIFICATION_COMPLETED` | Constraint builder and verification node | Constraints assembled or verified |
| `VERIFICATION_REQUIRED` | `verify_constraints` `interrupt()` | Pauses (`status: "awaiting_input"`) for user constraint confirmation |
| `TRIP_OVERLAP_WARNING` | `guardrails` date collision `interrupt()` | Pauses (`status: "warning"`) for overlap confirmation |
| `GUARDRAILS_ABORTED` / `GUARDRAILS_PASSED` | `guardrails` validation | Aborts invalid trip requests or advances to `prompt_analyzer` |
| `ANALYZING_PROMPT` | `prompt_analyzer` | Deterministic ONNX intent extraction and taste merging |
| `SCRAPING_DYNAMIC_DATA` | `planner_scrape` | Hydrating destination POIs, ratings, and embeddings |
| `EVALUATING_ROUTES` | `planner_optimize`, `planner_critic`, `planner_repair` | C++20 TCOPTW solving and critic-repair loop |
| `FEEDBACK_PROCESSED` | `"feedback"` action | Taste vector updated and persisted |
| `DONE` / `ERROR` / `CLARIFICATION_NEEDED` | Terminal states | Stream finished or failed (`status` holds error text on failure) |

## Interactive Trip Agent stream (`WS /api/ws/trip-agent/{trip_id}`)

Defined in `backend/app/agent/api.py`, this channel enforces strict JWT authentication (from `?token=`, `Authorization: Bearer`, `paladio_token` cookie, or `access_token` cookie) plus `assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, db)`. Connections failing auth close immediately with `WS_1008_POLICY_VIOLATION`, and connected sockets subscribe to `paladio:trip:{trip_id}` for external edit broadcasts.

### Client-to-server `AgentClientMessage` frames

Every inbound JSON message validates against `AgentClientMessage` (`backend/app/agent/events.py`).

| `type` | Additional fields | Behavior |
| :--- | :--- | :--- |
| `"user_message"` | `message`, optional `ui_context` (tab, day, stop ID, viewport bounds) | Starts an exclusive `TripAgentRunner` turn (90s Redis lock) |
| `"approve"` | `proposal_id` | Re-executes the stored Tier C MCP tool with `confirmed=True` and consumes the proposal |
| `"reject"` | `proposal_id` | Discards the pending Redis proposal and emits a warning confirmation |
| `"cancel"` | None | Triggers the active `asyncio.Event` cancellation token for `trip_id` |
| `"undo"` | Optional `revision` | Calls `TripService.undo_to_revision` or `TripService.undo_last_change` |

### Server-to-client `AgentServerEvent` frames

Every outbound JSON frame serializes `AgentServerEvent` (`event`, `turn_id`, `timestamp`, plus event-specific fields).

| `event` | Payload fields | Purpose |
| :--- | :--- | :--- |
| `"turn_started"` | `turn_id` | Signals agent turn start |
| `"token"` | `token` | Streams partial assistant response tokens |
| `"tool_call"` | `call_id`, `tool`, `args` | Reports tool invocation start |
| `"tool_result"` | `tool`, `ok`, `summary`, `change_set`, `data` | Delivers structured tool execution output |
| `"proposal"` | `proposal_id`, `tool`, `summary`, `diff`, `expires_in_seconds` (`600`) | Requests user confirmation for a Tier C operation |
| `"trip_updated"` | `revision`, `undo_token`, `affected_days`, `changed_stop_ids`, `summary` | Broadcasts persisted DB changes (including `paladio:trip:{trip_id}` updates) |
| `"warning"` / `"error"` | `message`, `code` | Emits turn conflicts, cancellations, expired proposals, or failures (`BAD_REQUEST`, `EXPIRED`, `TURN_FAILED`, `APPROVAL_FAILED`, `UNDO_FAILED`) |
| `"turn_done"` | `final_text`, `tools_called` | Marks turn completion |
