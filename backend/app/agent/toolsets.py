from __future__ import annotations

import re

CORE_TOOLS = {
    "get_trip_overview",
    "get_itinerary",
    "get_stop",
    "resolve_stop",
    "get_trip_issues",
    "search_pois",
    "get_poi_details",
    "find_nearby",
    "search_places",
    "suggest_additions",
    "add_stop",
    "add_meal",
    "remove_stop",
    "move_stop",
    "optimize_day",
    "what_if",
    "undo_last_change",
    "record_taste_preference",
    "forget_taste_preference",
    "describe_taste_profile",
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
        "update_participant_role",
        "remove_participant",
        "get_access_level",
    ],
    "collections": [
        "list_collections",
        "create_collection",
        "add_to_collection",
        "remove_from_collection",
        "list_saved_pois",
        "list_photos",
    ],
    "market": [
        "scan_flight_deals",
        "scan_hotel_deals",
        "get_price_trends",
        "get_weather_forecast",
        "suggest_weather_swaps",
        "get_route_price_history",
        "change_hotel_anchor",
    ],
    "jobs": [
        "get_job_status",
        "cancel_job",
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
        "reorder_stops",
        "swap_days",
        "clear_day",
        "set_stop_time",
        "set_stop_duration",
        "lock_stop",
        "unlock_stop",
        "add_free_time",
        "set_stop_notes",
        "add_day",
        "remove_day",
        "set_day_bounds",
        "set_pace",
        "shift_trip_dates",
        "duplicate_trip",
        "undo_to",
    ],
}

INTENT_KEYWORDS: dict[str, list[str]] = {
    "expenses": [
        "expense",
        "budget",
        "cost",
        "expensive",
        "price",
        "pricing",
        "cheap",
        "cheapest",
        "fee",
        "spend",
        "spending",
        "spent",
        "paid",
        "pay",
        "split",
        "currency",
        "bill",
        "settle",
        "settlement",
        "money",
        "convert",
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
    "collab": [
        "participant",
        "friend",
        "invite",
        "collab",
        "collaborating",
        "companion",
        "traveler",
        "role",
        "permissions",
        "access",
    ],
    "collections": [
        "collection",
        "saved place",
        "saved",
        "save",
        "favorite",
        "favorites",
        "bookmark",
        "bookmarks",
        "photo",
        "album",
    ],
    "market": [
        "weather",
        "rain",
        "forecast",
        "hotel price",
        "flight price",
        "swap for rain",
        "deal",
        "deals",
        "discount",
        "trend",
        "trends",
    ],
    "jobs": [
        "job",
        "task",
        "status",
        "background",
    ],
    "engine": [
        "optimize trip",
        "optimize all",
        "entire trip",
        "rebalance",
        "fit budget",
        "fill gap",
        "metrics",
        "conflict",
        "issues",
        "what if",
        "simulate",
        "preview",
    ],
    "itinerary_advanced": [
        "swap day",
        "swap",
        "reorder",
        "lock",
        "unlock",
        "pace",
        "duration",
        "note",
        "notes",
        "clear",
        "rest day",
        "undo",
        "rollback",
        "roll back",
        "revision",
        "re-route",
        "add day",
        "remove day",
        "free time",
        "shift dates",
        "move trip",
        "duplicate",
        "clone trip",
    ],
}


def detect_domain_toolsets(prompt: str) -> set[str]:
    """
    Performs fast token-free keyword pre-routing to automatically load relevant
    toolsets for small local LLMs without wasting reasoning steps.
    """
    p_lower = prompt.lower()
    active_sets: set[str] = set()

    for domain, kws in INTENT_KEYWORDS.items():
        for kw in kws:
            if re.search(r"\b" + re.escape(kw) + r"(?:s|es|ing|ed)?\b", p_lower):
                active_sets.add(domain)
                break

    return active_sets


def get_allowed_tool_names(additional_toolsets: set[str] | None = None) -> set[str]:
    """Combines core tools with any activated domain toolsets."""
    allowed = set(CORE_TOOLS)
    if additional_toolsets:
        for domain in additional_toolsets:
            tools = DOMAIN_TOOLSETS.get(domain, [])
            allowed.update(tools)
    return allowed
