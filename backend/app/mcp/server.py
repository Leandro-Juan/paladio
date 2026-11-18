"""FastMCP server initialization and mounting helper for Paladio."""

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP

from app.mcp.schemas import make_annotations
from app.mcp import tools
from app.mcp import resources
from app.mcp import prompts

mcp = FastMCP(
    name="paladio",
    instructions="Paladio Sovereign Trip Agent & Itinerary Optimization Engine",
)

# ---------------------------------------------------------------------------
# Tool Registration with Honest MCP Annotations
# ---------------------------------------------------------------------------

# 1. Trip and Context Tools
mcp.tool(
    name="get_trip_overview",
    description="Retrieves high-level summary of a trip: dates, destination, timezone, day count, participants, tickets, and quality gates.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_trip_overview)

mcp.tool(
    name="get_itinerary",
    description="Returns the trip itinerary with detail='summary', 'day', or 'full'.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_itinerary)

mcp.tool(
    name="get_stop",
    description="Retrieves full details of a single stop by stop_id: times, cost, hours, and transit leg from previous stop.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_stop)

mcp.tool(
    name="resolve_stop",
    description="Fuzzy matches search query to candidate stop_ids in the trip to prevent models guessing wrong identifiers.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.resolve_stop)

mcp.tool(
    name="get_trip_issues",
    description="Checks the itinerary for issues: opening hours conflicts, over-budget warnings, and tight transfers.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_trip_issues)

mcp.tool(
    name="update_trip_details",
    description="Updates trip properties. Title/notes/status are Tier W; destination/dates changes are Tier C.",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.update_trip_details)

mcp.tool(
    name="export_trip_package",
    description="Exports the trip as a self-contained .trip archive container (profile: full_vault or community_shareable).",
    annotations=make_annotations(read_only=True),
)(tools.export_trip_package)

mcp.tool(
    name="shift_trip_dates",
    description="Shifts all trip dates to a new start date and optionally re-anchors tickets and expenses.",
    annotations=make_annotations(read_only=False),
)(tools.shift_trip_dates)

mcp.tool(
    name="duplicate_trip",
    description="Creates a full copy of an existing trip (optionally shifted to a new start date).",
    annotations=make_annotations(read_only=False),
)(tools.duplicate_trip)

mcp.tool(
    name="record_taste_preference",
    description="Records an explicit preference or hard dislike from chat into the user's persistent taste profile.",
    annotations=make_annotations(read_only=False),
)(tools.record_taste_preference)

mcp.tool(
    name="forget_taste_preference",
    description="Removes a learned preference or hard veto from the user's taste profile.",
    annotations=make_annotations(read_only=False),
)(tools.forget_taste_preference)

mcp.tool(
    name="describe_taste_profile",
    description="Summarizes the user's learned taste profile and optional group trip consensus.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.describe_taste_profile)

# 2. POIs and Discovery Tools
mcp.tool(
    name="search_pois",
    description="Searches the destination POI database/catalog for attractions, sights, restaurants, ramen shops, cafes, and activities using hybrid semantic and category retrieval (capped at 50).",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.search_pois)

mcp.tool(
    name="get_poi_details",
    description="Retrieves complete details for a catalog POI: verified opening hours, price provenance, and descriptions.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_poi_details)

mcp.tool(
    name="search_places",
    description="Geocoding search for non-catalog places, transit stations, and street addresses.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.search_places)

mcp.tool(
    name="find_nearby",
    description="Finds attractions, food, or stations within a radius of a stop or coordinate.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.find_nearby)

mcp.tool(
    name="suggest_additions",
    description="Suggests high-value POI additions for a specific day based on schedule gaps.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.suggest_additions)

mcp.tool(
    name="create_custom_stop",
    description="Creates a trip-scoped custom stop. Strictly isolated to this trip - never mutates global catalog.",
    annotations=make_annotations(read_only=False),
)(tools.create_custom_stop)

# 3. Itinerary Editing Tools
mcp.tool(
    name="add_stop",
    description="Adds a stop to a specific day in the itinerary (from poi_id or custom place).",
    annotations=make_annotations(read_only=False),
)(tools.add_stop)

mcp.tool(
    name="remove_stop",
    description="Removes a stop from the itinerary. Tier C if stop is locked or is a flight/hotel anchor.",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.remove_stop)

mcp.tool(
    name="move_stop",
    description="Moves a stop to another day and position, cascading travel times on both affected days.",
    annotations=make_annotations(read_only=False),
)(tools.move_stop)

mcp.tool(
    name="reorder_day",
    description="Explicitly re-sequences the stops of a given day according to ordered_stop_ids.",
    annotations=make_annotations(read_only=False),
)(tools.reorder_day)

mcp.tool(
    name="swap_days",
    description="Swaps the entire schedules between Day A and Day B (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.swap_days)

mcp.tool(
    name="set_stop_time",
    description="Pins a specific start time for a stop and locks it as a fixed point.",
    annotations=make_annotations(read_only=False),
)(tools.set_stop_time)

mcp.tool(
    name="set_stop_duration",
    description="Updates the planned duration of a stop in minutes.",
    annotations=make_annotations(read_only=False),
)(tools.set_stop_duration)

mcp.tool(
    name="lock_stop",
    description="Locks a stop in place as a fixed point for optimizer calculations.",
    annotations=make_annotations(read_only=False),
)(tools.lock_stop)

mcp.tool(
    name="unlock_stop",
    description="Unlocks a stop, allowing the optimizer to reposition or reschedule it.",
    annotations=make_annotations(read_only=False),
)(tools.unlock_stop)

mcp.tool(
    name="add_meal",
    description="Adds a scheduled meal window (breakfast, lunch, or dinner) to a day.",
    annotations=make_annotations(read_only=False),
)(tools.add_meal)

mcp.tool(
    name="add_free_time",
    description="Adds an unscheduled free time and exploration block to a day.",
    annotations=make_annotations(read_only=False),
)(tools.add_free_time)

mcp.tool(
    name="set_stop_notes",
    description="Sets notes or traveler tips on a specific stop.",
    annotations=make_annotations(read_only=False),
)(tools.set_stop_notes)

mcp.tool(
    name="add_day",
    description="Adds a new empty day to the itinerary.",
    annotations=make_annotations(read_only=False),
)(tools.add_day)

mcp.tool(
    name="remove_day",
    description="Removes a day and all its stops from the itinerary (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.remove_day)

mcp.tool(
    name="set_day_bounds",
    description="Configures the operating day start and end time window.",
    annotations=make_annotations(read_only=False),
)(tools.set_day_bounds)

mcp.tool(
    name="set_pace",
    description="Sets travel pace constraint (leisurely, balanced, intense).",
    annotations=make_annotations(read_only=False),
)(tools.set_pace)

mcp.tool(
    name="undo_last_change",
    description="Restores the previous revision snapshot of the trip itinerary.",
    annotations=make_annotations(read_only=False),
)(tools.undo_last_change)

mcp.tool(
    name="undo_to",
    description="Restores the trip itinerary to an explicit target revision.",
    annotations=make_annotations(read_only=False),
)(tools.undo_to)

# 4. Engine and Optimization Tools
mcp.tool(
    name="optimize_day",
    description="Re-sequences a single day's stops using the C++20 TSPTW solver, honoring locked stops.",
    annotations=make_annotations(read_only=False),
)(tools.optimize_day)

mcp.tool(
    name="optimize_trip",
    description="Optimizes routing across all days of the trip with the C++20 solver (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.optimize_trip)

mcp.tool(
    name="what_if",
    description="Dry-run simulation of an itinerary edit without writing to the database.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.what_if)

mcp.tool(
    name="rebalance_days",
    description="Rebalances stops across days based on geographical clustering and daily load (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.rebalance_days)

mcp.tool(
    name="fit_to_budget",
    description="Trims or replaces expensive paid attractions to respect a target budget (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.fit_to_budget)

mcp.tool(
    name="fill_gaps",
    description="Finds idle time gaps in a day and automatically fills them with nearby attractions.",
    annotations=make_annotations(read_only=False),
)(tools.fill_gaps)

mcp.tool(
    name="explain_schedule",
    description="Explains why a stop is scheduled at its current position and time.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.explain_schedule)

mcp.tool(
    name="compare_metrics",
    description="Evaluates current quality metrics: travel time, walking distance, cost, and gate score.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.compare_metrics)

# 5. Transit and Mobility Tools
mcp.tool(
    name="get_transit_status",
    description="Checks GTFS transit network availability and compilation status for destination.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_transit_status)

mcp.tool(
    name="request_transit_build",
    description="Queues a background task to compile GTFS transit feeds for the city (Tier J: returns job_id).",
    annotations=make_annotations(read_only=False),
)(tools.request_transit_build)

mcp.tool(
    name="upgrade_trip_transit",
    description="Reruns travel legs using real compiled transit schedules and Valhalla roads.",
    annotations=make_annotations(read_only=False),
)(tools.upgrade_trip_transit)

mcp.tool(
    name="get_directions",
    description="Point-to-point routing directions between coordinates.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_directions)

mcp.tool(
    name="get_leg_options",
    description="Returns transit and walking alternatives for the leg arriving at stop_id.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_leg_options)

mcp.tool(
    name="set_leg_mode",
    description="Forces transport mode (walking, transit, taxi) for a leg.",
    annotations=make_annotations(read_only=False),
)(tools.set_leg_mode)

mcp.tool(
    name="nearby_stations",
    description="Finds GTFS metro and rail stations near trip anchors and stops on a given day.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.nearby_stations)

mcp.tool(
    name="get_transit_pass_advice",
    description="Evaluates whether daily transit passes or single tickets are more economical for this trip.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_transit_pass_advice)

# 6. Tickets and Wallet Tools
mcp.tool(
    name="list_tickets",
    description="Lists all travel tickets and reservations associated with this trip (secrets masked).",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.list_tickets)

mcp.tool(
    name="get_ticket",
    description="Retrieves a single ticket's details with secrets masked.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_ticket)

mcp.tool(
    name="create_ticket",
    description="Creates a new ticket/reservation entry for the trip.",
    annotations=make_annotations(read_only=False),
)(tools.create_ticket)

mcp.tool(
    name="update_ticket",
    description="Updates an existing ticket entry.",
    annotations=make_annotations(read_only=False),
)(tools.update_ticket)

mcp.tool(
    name="delete_ticket",
    description="Deletes a ticket or booking from the trip wallet (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.delete_ticket)

mcp.tool(
    name="parse_booking_text",
    description="Parses booking confirmation emails or text into candidate ticket drafts without saving.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.parse_booking_text)

mcp.tool(
    name="confirm_ticket_drafts",
    description="Persists scanned or drafted tickets into wallet and syncs anchors into itinerary.",
    annotations=make_annotations(read_only=False),
)(tools.confirm_ticket_drafts)

mcp.tool(
    name="sync_anchors_from_tickets",
    description="Synchronizes flight and hotel times from confirmed wallet tickets into the itinerary.",
    annotations=make_annotations(read_only=False),
)(tools.sync_anchors_from_tickets)

# 7. Expenses and Budget Tools
mcp.tool(
    name="list_expenses",
    description="Lists all recorded expenses and their participant split allocations for this trip.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.list_expenses)

mcp.tool(
    name="add_expense",
    description="Records a new trip expense and calculates individual participant cost shares.",
    annotations=make_annotations(read_only=False),
)(tools.add_expense)

mcp.tool(
    name="update_expense",
    description="Updates properties of an existing trip expense.",
    annotations=make_annotations(read_only=False),
)(tools.update_expense)

mcp.tool(
    name="delete_expense",
    description="Deletes an expense from the trip ledger (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.delete_expense)

mcp.tool(
    name="get_budget_breakdown",
    description="Computes overall budget breakdown combining itinerary stop costs and recorded expenses.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_budget_breakdown)

mcp.tool(
    name="get_settlement",
    description="Computes net traveler balances and simplified debt settlement transfers.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_settlement)

mcp.tool(
    name="convert_currency",
    description="Converts money amount between fiat currencies using live exchange rates.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.convert_currency)

# 8. Collaboration Tools
mcp.tool(
    name="list_participants",
    description="Lists all participants and travelers in this trip.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.list_participants)

mcp.tool(
    name="add_participant",
    description="Adds a new traveler or guest participant to the trip.",
    annotations=make_annotations(read_only=False),
)(tools.add_participant)

mcp.tool(
    name="remove_participant",
    description="Removes a participant from the trip (Tier C: requires confirmation).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.remove_participant)

# 9. Collections Tools
mcp.tool(
    name="list_collections",
    description="Lists all user collections (bookmarks, packing lists) for this trip.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.list_collections)

mcp.tool(
    name="create_collection",
    description="Creates a new collection within the trip.",
    annotations=make_annotations(read_only=False),
)(tools.create_collection)

mcp.tool(
    name="add_to_collection",
    description="Adds a POI item to an existing collection.",
    annotations=make_annotations(read_only=False),
)(tools.add_to_collection)

mcp.tool(
    name="remove_from_collection",
    description="Removes an item from a collection.",
    annotations=make_annotations(read_only=False),
)(tools.remove_from_collection)

mcp.tool(
    name="list_photos",
    description="Lists photo metadata attached to the trip without downloading raw bytes.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.list_photos)

# 10. Market and External Tools
mcp.tool(
    name="get_weather_forecast",
    description="Retrieves live weather forecast and environmental telemetry for trip destination.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_weather_forecast)

mcp.tool(
    name="suggest_weather_swaps",
    description="Suggests indoor alternatives (museums, galleries) for a rainy or stormy day.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.suggest_weather_swaps)

mcp.tool(
    name="get_route_price_history",
    description="Retrieves monitored flight or transit corridor price statistics.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_route_price_history)

mcp.tool(
    name="change_hotel_anchor",
    description="Updates the lodging hotel depot across all trip days and re-optimizes (Tier C).",
    annotations=make_annotations(read_only=False, destructive=True),
)(tools.change_hotel_anchor)

# 11. Toolset & Jobs
mcp.tool(
    name="load_toolset",
    description="Dynamically activates a specialized domain toolset (expenses, tickets, transit, etc.).",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.load_toolset)

mcp.tool(
    name="get_job_status",
    description="Checks the status and progress of an asynchronous background job.",
    annotations=make_annotations(read_only=True, idempotent=True),
)(tools.get_job_status)

mcp.tool(
    name="cancel_job",
    description="Cancels a pending or running background job.",
    annotations=make_annotations(read_only=False),
)(tools.cancel_job)


# ---------------------------------------------------------------------------
# Resources Registration
# ---------------------------------------------------------------------------

mcp.resource("trip://{trip_id}/overview")(resources.read_trip_overview_resource)
mcp.resource("trip://{trip_id}/day/{day_number}")(resources.read_trip_day_resource)
mcp.resource("trip://{trip_id}/expenses")(resources.read_trip_expenses_resource)
mcp.resource("trip://{trip_id}/wallet")(resources.read_trip_wallet_resource)
mcp.resource("paladio://taxonomy")(resources.read_paladio_taxonomy_resource)
mcp.resource("paladio://itinerary-schema")(resources.read_itinerary_schema_resource)


# ---------------------------------------------------------------------------
# Prompts Registration
# ---------------------------------------------------------------------------

mcp.prompt("review_my_trip")(prompts.prompt_review_my_trip)
mcp.prompt("fix_all_issues")(prompts.prompt_fix_all_issues)
mcp.prompt("rainy_day_plan")(prompts.prompt_rainy_day_plan)
mcp.prompt("split_the_bill")(prompts.prompt_split_the_bill)
mcp.prompt("make_day_relaxed")(prompts.prompt_make_day_relaxed)
mcp.prompt("add_dinner_near")(prompts.prompt_add_dinner_near)


# ---------------------------------------------------------------------------
# Mounting Helper for FastAPI
# ---------------------------------------------------------------------------


def mount_mcp_app(fastapi_app: FastAPI, path: str = "/mcp") -> None:
    """Mounts the FastMCP streamable-HTTP and SSE app on the main FastAPI application."""
    streamable_app = mcp.streamable_http_app()
    fastapi_app.mount(path, streamable_app)
