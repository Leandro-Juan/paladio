# Interactive AI agent and MCP safety model

Paladio exposes 82 trip-manipulation tools over FastMCP (`/mcp` HTTP and `stdio`) and drives the interactive `Plan -> Agent` chat assistant (`TripAgentRunner`) with tiered write confirmations, turn locking, DNS-rebinding checks, and full audit logging.

## Tool execution pipeline and `InstrumentedMCPToolset`

Inside `backend/app/agent/runner.py`, `pydantic_ai.Agent` connects directly to the in-process FastMCP server through `InstrumentedMCPToolset` under a scoped user context (`with_user_context`). Every tool call emits structured WebSocket events (`tool_call`, `tool_result`, `proposal`, `trip_updated`) over `/api/ws/trip-agent/{trip_id}` so the UI shows live progress without polling.

- **Dynamic toolset gating (`backend/app/agent/toolsets.py`)**: Turns start with 21 core tools (`CORE_TOOLS`) to keep context windows small and fast across local and cloud LLMs, dynamically activating up to 9 specialized domain toolsets (`expenses`, `tickets`, `transit`, `collab`, `collections`, `market`, `jobs`, `engine`, `itinerary_advanced`) from message keywords or `load_toolset`.
- **90s exclusive turn lock & live cancellation**: Redis key `paladio:agent:lock:{trip_id}` prevents concurrent chat turns on the same trip, while `register_cancel_token` wires an `asyncio.Event` so users can abort mid-stream.

## Three-tier safety classification (Read / Tier W / Tier C)

Tools are annotated with explicit MCP metadata (`readOnlyHint`, `idempotentHint`, `destructiveHint`) and enforced server-side before modifying PostgreSQL.

| Safety tier | Behavior | Representative tools |
| :--- | :--- | :--- |
| **Read & Simulate (`Read`)** | Executes immediately; never mutates DB; wallet secrets masked | `get_trip_overview`, `get_itinerary`, `search_pois`, `what_if`, `compare_metrics`, `list_tickets` |
| **Routine Write (`Tier W`)** | Executes immediately under `EDITOR`/`OWNER` RBAC; snapshots `trip_revisions` + broadcasts `paladio:trip:{trip_id}` + returns undo token | `add_stop`, `move_stop`, `lock_stop`, `set_stop_time`, `optimize_day`, `add_expense`, `create_ticket` |
| **Confirmation Gate (`Tier C`)** | Unless invoked with `confirmed=true` after approval, stores a Redis proposal (`paladio:proposal:{id}`, `600s` TTL) with diff summary and pauses for user `approve` / `reject` | `remove_stop` (locked or flight/hotel anchors), `swap_days`, `remove_day`, `optimize_trip`, `rebalance_days`, `fit_to_budget`, `delete_ticket`, `delete_expense`, `remove_participant`, `change_hotel_anchor`, `update_trip_details` (destination/dates), `export_trip_package` (`community_shareable`) |

## Revision snapshots, audit trail, and HTTP hardening

Every mutation executed through the agent or MCP server stays reversible and cryptographically auditable:

- **Immutable `trip_revisions` & Undo**: Mutating tools record full before/after itinerary snapshots in `trip_revisions`, enabling instant 1-step (`undo_last_change`) or target-revision (`undo_to`) rollbacks.
- **Audit trail (`agent_actions`)**: `backend/app/mcp/audit.py` logs tool invocations with user ID, trip ID, outcome, and SHA-256-hashed arguments without leaking sensitive raw payloads.
- **Network & auth isolation**: `verify_origin_and_host` (`backend/app/mcp/auth.py`) enforces `Host` and `Origin` allowlists (`localhost`, `127.0.0.1`, `0.0.0.0`) on Streamable HTTP `/mcp` requests alongside Bearer JWT verification (`PALADIO_API_TOKEN` for `stdio`).
