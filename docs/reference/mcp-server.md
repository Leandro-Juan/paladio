# MCP server reference

Paladio's FastMCP server (`backend/app/mcp/server.py`, name `"paladio"`) registers **82 tools** across 11 categories, **6 resources**, and **6 prompts**, serving both Streamable HTTP at `/mcp` and `stdio` via `python -m app.mcp`.

## Transport endpoints and authentication

Every external MCP tool call resolves an authenticated `UserModel` and checks trip access via `assert_trip_access` before querying or modifying PostgreSQL.

| Transport | Entrypoint | Authentication & origin rules |
| :--- | :--- | :--- |
| **Streamable HTTP** | `POST/GET /mcp` (`mount_mcp_app` in FastAPI) | Requires `Authorization: Bearer your_jwt_here` plus `verify_origin_and_host` (`Host`/`Origin` restricted to `localhost`, `127.0.0.1`, `0.0.0.0`) |
| **`stdio`** | `python -m app.mcp` (`backend/app/mcp/__main__.py`) | Authenticates against `PALADIO_API_TOKEN` (resolving the earliest active account) or decodes a JWT fallback |
| **In-process** | `TripAgentRunner` (`with_user_context`) | Shares the active WebSocket user and SQLAlchemy session directly without HTTP overhead |

## Complete catalog of 82 MCP tools

Tools marked `(Read)` never mutate data, `(Tier W)` write immediately with a revision snapshot, and `(Tier C)` return a confirmation proposal (`600s` TTL) unless `confirmed=true`.

| Category | Count | Registered tools |
| :--- | :---: | :--- |
| **1. Trip & Context** | 12 | `get_trip_overview` (Read), `get_itinerary` (Read), `get_stop` (Read), `resolve_stop` (Read), `get_trip_issues` (Read), `update_trip_details` (Tier W; Tier C for dates/destination), `export_trip_package` (Read / Tier C for `community_shareable`), `shift_trip_dates` (Tier W), `duplicate_trip` (Tier W), `record_taste_preference` (Tier W), `forget_taste_preference` (Tier W), `describe_taste_profile` (Read) |
| **2. POIs & Discovery** | 6 | `search_pois` (Read, capped at 50), `get_poi_details` (Read), `search_places` (Read), `find_nearby` (Read), `suggest_additions` (Read), `create_custom_stop` (Tier W, trip-scoped) |
| **3. Itinerary Editing** | 18 | `add_stop` (Tier W), `remove_stop` (Tier W; Tier C on locked/flight/hotel stops), `move_stop` (Tier W), `reorder_day` (Tier W), `swap_days` (Tier C), `set_stop_time` (Tier W), `set_stop_duration` (Tier W), `lock_stop` (Tier W), `unlock_stop` (Tier W), `add_meal` (Tier W), `add_free_time` (Tier W), `set_stop_notes` (Tier W), `add_day` (Tier W), `remove_day` (Tier C), `set_day_bounds` (Tier W), `set_pace` (Tier W), `undo_last_change` (Tier W), `undo_to` (Tier W) |
| **4. Engine & Optimization** | 8 | `optimize_day` (Tier W), `optimize_trip` (Tier C), `what_if` (Read simulation), `rebalance_days` (Tier C), `fit_to_budget` (Tier C), `fill_gaps` (Tier W), `explain_schedule` (Read), `compare_metrics` (Read) |
| **5. Transit & Mobility** | 8 | `get_transit_status` (Read), `request_transit_build` (Tier J async job), `upgrade_trip_transit` (Tier W), `get_directions` (Read), `get_leg_options` (Read), `set_leg_mode` (Tier W), `nearby_stations` (Read), `get_transit_pass_advice` (Read) |
| **6. Tickets & Wallet** | 8 | `list_tickets` (Read, secrets masked), `get_ticket` (Read, secrets masked), `create_ticket` (Tier W), `update_ticket` (Tier W), `delete_ticket` (Tier C), `parse_booking_text` (Read), `confirm_ticket_drafts` (Tier W), `sync_anchors_from_tickets` (Tier W) |
| **7. Expenses & Budget** | 7 | `list_expenses` (Read), `add_expense` (Tier W), `update_expense` (Tier W), `delete_expense` (Tier C), `get_budget_breakdown` (Read), `get_settlement` (Read), `convert_currency` (Read) |
| **8. Collaboration** | 3 | `list_participants` (Read), `add_participant` (Tier W), `remove_participant` (Tier C, blocks removing last participant) |
| **9. Collections & Photos** | 5 | `list_collections` (Read), `create_collection` (Tier W), `add_to_collection` (Tier W), `remove_from_collection` (Tier W), `list_photos` (Read metadata only) |
| **10. Market & Weather** | 4 | `get_weather_forecast` (Read), `suggest_weather_swaps` (Read), `get_route_price_history` (Read), `change_hotel_anchor` (Tier C) |
| **11. Toolset & Jobs** | 3 | `load_toolset` (Read), `get_job_status` (Read), `cancel_job` (Tier W) |

## Registered MCP resources (6) and prompts (6)

MCP clients can read structured JSON documents directly via resource URIs or launch pre-built multi-step agent workflows via prompts.

| Type | Identifier | Description |
| :--- | :--- | :--- |
| **Resource** | `trip://{trip_id}/overview` | High-level trip JSON (destination, title, dates, day count, revision) |
| **Resource** | `trip://{trip_id}/day/{day_number}` | Single day schedule JSON for `day_number` |
| **Resource** | `trip://{trip_id}/expenses` | Recorded trip expenses and computed debt settlement |
| **Resource** | `trip://{trip_id}/wallet` | Trip tickets JSON with all sensitive secrets redacted |
| **Resource** | `paladio://taxonomy` | Static JSON listing valid POI categories, meal types, and transport modes |
| **Resource** | `paladio://itinerary-schema` | Full Pydantic JSON Schema for `ItineraryDocument` |
| **Prompt** | `review_my_trip(trip_id)` | Inspects day pacing, meal slots, opening hours, and transfer issues |
| **Prompt** | `fix_all_issues(trip_id)` | Resolves schedule collisions and tight legs with `set_stop_time` and `optimize_day` |
| **Prompt** | `rainy_day_plan(trip_id, day)` | Simulates indoor museum/gallery swaps for bad weather using `what_if` |
| **Prompt** | `split_the_bill(trip_id)` | Computes expenses and minimum debt-settlement transfers |
| **Prompt** | `make_day_relaxed(trip_id, day)` | Caps stops, adds a 90-minute meal and 60-minute free-time break, and re-optimizes |
| **Prompt** | `add_dinner_near(trip_id, day)` | Finds nearby restaurants within `1,000 m` of the last stop and schedules dinner |
