# Reference: Paladio Trip MCP Server

## Overview

Paladio exposes an in-process and network-accessible FastMCP server providing **77 deterministic tools**, resources, and prompt templates for conversational trip planning and itinerary manipulation.

The server adheres to Paladio's strict sovereign architecture:
- **100% Air-Gapped & Self-Hosted**: Operates entirely with local Ollama (`qwen2.5:latest` 7.6B) or in-memory FastMCP runners.
- **Zero Legacy Compatibility**: Modern unified API, clean models, strictly dynamic data.
- **Auditable Reversibility**: All mutations yield undo tokens and CAS optimistic concurrency checks.

---

## Architecture & Transports

The MCP server is defined in `backend/app/mcp/` and supports two transports:
1. **HTTP/SSE Transport**: Mounted directly onto the FastAPI application at `/mcp` via `FastMCP.mount()`.
2. **Standard I/O (stdio) Transport**: Executable entrypoint for desktop clients (Claude Desktop, cursor, CLI):
   ```bash
   python -m app.mcp.server
   ```

---

## Security & Permission Tiers

Every tool is assigned to an authorization tier:

| Tier | Name | Mutation Behavior | Confirmation Requirement | Examples |
|---|---|---|---|---|
| **Tier A** | Read / Query | Pure read, zero side effects | Executed immediately | `get_trip_overview`, `get_itinerary`, `search_pois`, `list_expenses` |
| **Tier B** | Direct Reversible | Modifies route with instant rollback token | Executed immediately, emits `trip_updated` with `undo_token` | `add_stop`, `remove_stop`, `move_stop`, `optimize_day`, `swap_days` |
| **Tier C** | Destructive / Cost | Irreversible, high-cost, or multi-day deletions | Intercepted into a `ProposalData` with TTL; awaits user confirmation | `rebalance_days`, `clear_day`, `delete_expense`, `confirm_ticket_drafts` |

---

## Tool Catalog by Domain

### 1. Trip & Context (`app.mcp.tools.trip`)
- `get_trip_overview(trip_id)`: High-level overview, date ranges, participant count, and budget.
- `get_itinerary(trip_id, detail='compact')`: Complete multi-day route and stop sequence.
- `get_stop(trip_id, stop_id)`: Precise stop details and scheduling metadata.
- `resolve_stop(trip_id, query, day)`: Fuzzy search resolving text into existing stops.
- `get_trip_issues(trip_id)`: Validates hours, lunch windows, and ping-pong routing.
- `export_trip(trip_id, format='json')`: Generates self-contained sovereign trip bundle.

### 2. Itinerary Mutation (`app.mcp.tools.itinerary`)
- `add_stop(trip_id, day, poi_id, after_stop_id, duration_mins)`: Adds a waypoint.
- `remove_stop(trip_id, stop_id)`: Deletes a waypoint and reflows times.
- `move_stop(trip_id, stop_id, to_day, after_stop_id)`: Transfers stop across days.
- `reorder_stops(trip_id, day, stop_ids)`: Re-sequences stops in a specific day.
- `lock_stop(trip_id, stop_id)`: Locks stop time window against optimizer changes.
- `unlock_stop(trip_id, stop_id)`: Unlocks stop for flexible TSPTW sequencing.
- `swap_days(trip_id, day_a, day_b)`: Swaps activities between two days.
- `clear_day(trip_id, day, confirmed)`: Clears all stops on a day (Tier C).
- `undo_last_change(trip_id)`: Restores the preceding revision.
- `undo_to(trip_id, revision)`: Reverts itinerary to a historical revision.

### 3. Optimization & Engine (`app.mcp.tools.engine`)
- `optimize_day(trip_id, day)`: Solves TSPTW combinatorial order using C++20 `paladio_core`.
- `optimize_trip(trip_id)`: Re-optimizes all itinerary days in sequence.
- `rebalance_days(trip_id, confirmed)`: Re-clusters stops across days based on geographic density.
- `what_if(trip_id, action, params)`: Simulates edits and returns quality score deltas without saving.

### 4. POI Discovery (`app.mcp.tools.pois`)
- `search_pois(trip_id, query, category, limit)`: Semantic RAG search via pgvector.
- `get_poi_details(trip_id, poi_id)`: Opening hours, tickets, coordinates, and notes.
- `recommend_pois(trip_id, day, category, limit)`: Context-aware recommendations for itinerary gaps.
- `add_custom_poi(trip_id, name, lat, lon, category)`: Creates user-defined waypoint.

### 5. Transit & Mobility (`app.mcp.tools.transit`)
- `get_transit_route(trip_id, from_stop_id, to_stop_id)`: Live GTFS multimodal routing.
- `get_transit_matrix(trip_id, day)`: Full travel duration and distance matrix.
- `compute_transfer(trip_id, origin, destination)`: Airport / station transfer recommendations.
- `list_transit_lines(trip_id, latitude, longitude)`: Nearby transit lines and frequencies.

### 6. Expenses & Budget (`app.mcp.tools.expenses`)
- `list_expenses(trip_id)`: Recorded costs and participant shares.
- `add_expense(trip_id, payer_id, amount, description, split_type, excluded_participant_ids)`: Splits costs.
- `update_expense(trip_id, expense_id, amount, description)`: Modifies recorded expense.
- `delete_expense(trip_id, expense_id, confirmed)`: Removes expense (Tier C).
- `get_budget_summary(trip_id)`: Total budget, expenditure, and category breakdowns.
- `convert_currency(amount, from_curr, to_curr)`: Currency conversion using live rates.
- `get_settlement(trip_id)`: Minimized pairwise payment plan among participants.

### 7. Wallet & Bookings (`app.mcp.tools.tickets`)
- `list_tickets(trip_id)`: Boarding passes, hotel vouchers, and attraction bookings with redacted secrets.
- `get_ticket(trip_id, ticket_id)`: Full ticket metadata with redacted access PIN.
- `create_ticket(trip_id, ticket_data)`: Manually adds confirmation record.
- `parse_booking_text(text_content)`: AI extraction of booking confirmations into drafts.
- `sync_anchors_from_tickets(trip_id)`: Automatically updates flight/hotel anchors in itinerary.

### 8. Collaboration & Roles (`app.mcp.tools.collab`)
- `list_participants(trip_id)`: Viewers, editors, and trip owner.
- `add_participant(trip_id, email, role)`: Invites traveler to trip.
- `update_participant_role(trip_id, participant_id, role)`: Modifies editor/viewer permission.
- `remove_participant(trip_id, participant_id)`: Revokes trip access.
- `get_access_level(trip_id)`: Inspects active user's permissions.

### 9. Saved Collections (`app.mcp.tools.collections`)
- `list_collections(trip_id)`: Trip collections and saved POI categories.
- `create_collection(trip_id, name, description)`: Creates custom POI wishlist.
- `add_to_collection(trip_id, collection_id, poi_id)`: Bookmarks POI.
- `remove_from_collection(trip_id, collection_id, poi_id)`: Removes bookmark.
- `list_saved_pois(trip_id, collection_id)`: Lists bookmarks in collection.

### 10. Market & Scraper (`app.mcp.tools.market`)
- `scan_flight_deals(origin, destination, date)`: Airfare deals via sovereign scraping engine.
- `scan_hotel_deals(destination, check_in, check_out)`: Hotel offers.
- `get_price_trends(origin, destination)`: Historical price distributions and volatility.

### 11. Async Jobs (`app.mcp.tools.jobs`)
- `get_job_status(job_id)`: Queries progress of background Celery tasks.
- `cancel_job(job_id)`: Terminates background job.

---

## Tool Return Contract

All tools return a `ToolResult` model:
```json
{
  "ok": true,
  "summary": "Added Colosseum to Day 1 (14:30 - 15:30).",
  "change_set": {
    "revision": 3,
    "undo_token": "rev_3_uuid",
    "changes": [{"day": 1, "stop_id": "poi_123", "kind": "added"}]
  },
  "data": { ... }
}
```
