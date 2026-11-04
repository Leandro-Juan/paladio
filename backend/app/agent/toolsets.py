from __future__ import annotations

import re
from typing import Set

CORE_TOOLS = {
    "get_trip_overview",
    "get_itinerary",
    "get_stop",
    "resolve_stop",
    "get_trip_issues",
    "search_pois",
    "get_poi_details",
    "add_stop",
    "remove_stop",
    "move_stop",
    "optimize_day",
    "what_if",
    "undo_last_change",
    "load_toolset",
}

DOMAIN_TOOLSETS: dict[str, list[str]] = {
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
    "engine": [
        "optimize_trip",
        "rebalance_days",
        "fit_to_budget",
        "fill_gaps",
        "explain_schedule",
        "compare_metrics",
    ],
    "itinerary_advanced": [
        "reorder_day",
        "swap_days",
        "set_stop_time",
        "set_stop_duration",
        "lock_stop",
        "unlock_stop",
        "add_meal",
        "add_free_time",
        "set_stop_notes",
        "add_day",
        "remove_day",
        "set_day_bounds",
        "set_pace",
        "undo_to",
    ],
}

INTENT_KEYWORDS: dict[str, list[str]] = {
    "expenses": [
        "expense",
        "budget",
        "cost",
        "spent",
        "paid",
        "split",
        "currency",
        "bill",
        "settle",
        "money",
    ],
    "tickets": [
        "ticket",
        "flight",
        "boarding",
        "hotel reservation",
        "booking",
        "pnr",
        "barcode",
        "airline",
    ],
    "transit": [
        "transit",
        "metro",
        "bus",
        "train",
        "subway",
        "directions",
        "transfer",
        "station",
        "pass",
    ],
    "collab": ["participant", "friend", "invite", "collab", "companion", "traveler"],
    "collections": ["collection", "saved place", "photo", "album"],
    "market": [
        "weather",
        "rain",
        "forecast",
        "hotel price",
        "flight price",
        "swap for rain",
    ],
    "engine": [
        "optimize trip",
        "optimize all",
        "rebalance",
        "fit budget",
        "fill gap",
        "metrics",
    ],
    "itinerary_advanced": [
        "swap day",
        "reorder",
        "lock",
        "unlock",
        "pace",
        "add day",
        "remove day",
        "breakfast",
        "lunch",
        "dinner",
    ],
}


def detect_domain_toolsets(prompt: str) -> Set[str]:
    """
    Performs fast token-free keyword pre-routing to automatically load relevant
    toolsets for small local LLMs without wasting reasoning steps.
    """
    p_lower = prompt.lower()
    active_sets: Set[str] = set()

    for domain, kws in INTENT_KEYWORDS.items():
        for kw in kws:
            if re.search(r"\b" + re.escape(kw) + r"\b", p_lower):
                active_sets.add(domain)
                break

    return active_sets


def get_allowed_tool_names(additional_toolsets: Set[str] | None = None) -> Set[str]:
    """Combines core tools with any activated domain toolsets."""
    allowed = set(CORE_TOOLS)
    if additional_toolsets:
        for domain in additional_toolsets:
            tools = DOMAIN_TOOLSETS.get(domain, [])
            allowed.update(tools)
    return allowed
