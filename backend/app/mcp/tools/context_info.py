"""Toolsets on-demand loading and context info MCP tools."""

from mcp.server.fastmcp import Context
from app.mcp.schemas import ToolResult

TOOLSETS: dict[str, list[str]] = {
    "expenses": [
        "list_expenses",
        "add_expense",
        "update_expense",
        "delete_expense",
        "get_budget_breakdown",
        "get_settlement",
        "convert_currency",
    ],
    "tickets": [
        "list_tickets",
        "get_ticket",
        "create_ticket",
        "update_ticket",
        "delete_ticket",
        "parse_booking_text",
        "confirm_ticket_drafts",
        "sync_anchors_from_tickets",
    ],
    "transit": [
        "get_transit_status",
        "request_transit_build",
        "upgrade_trip_transit",
        "get_directions",
        "get_leg_options",
        "set_leg_mode",
        "nearby_stations",
        "get_transit_pass_advice",
    ],
    "collab": [
        "list_participants",
        "add_participant",
        "remove_participant",
    ],
    "collections": [
        "list_collections",
        "create_collection",
        "add_to_collection",
        "remove_from_collection",
        "list_photos",
    ],
    "market": [
        "get_weather_forecast",
        "suggest_weather_swaps",
        "get_route_price_history",
        "change_hotel_anchor",
    ],
    "jobs": [
        "get_job_status",
        "cancel_job",
    ],
}


async def load_toolset(
    toolset_name: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Dynamically activates a specialized domain toolset (expenses, tickets, transit, collab, collections, market, jobs).
    Allows small models to manage focused tool sets without context bloat.
    """
    clean_name = toolset_name.lower().strip()
    if clean_name not in TOOLSETS:
        available = list(TOOLSETS.keys())
        return ToolResult(
            ok=False,
            summary=f"Unknown toolset '{toolset_name}'. Available: {available}",
            error=f"Invalid toolset name. Choose from {available}",
        )

    tools = TOOLSETS[clean_name]
    return ToolResult(
        ok=True,
        summary=f"Toolset '{clean_name}' loaded ({len(tools)} tools).",
        data={"toolset": clean_name, "tools": tools},
    )
