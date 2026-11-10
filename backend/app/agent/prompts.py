from __future__ import annotations

from typing import Any, Optional
from app.domain.schemas.itinerary_document import ItineraryDocument
from app.application.trip_editing.schemas import ChangeWarning
from app.db.models import TripModel


SYSTEM_PROMPT = """You are Paladio Trip Agent, an expert tactical itinerary co-pilot.
Your mission is to assist travelers in planning, adjusting, optimizing, and organizing their trips with mathematical precision.

Core Invariants:
1. Sovereign & Dynamic: All data is dynamic. Never invent mock data, fake stop IDs, or synthetic coordinates.
2. Tool Grounding: Always use tools to inspect or mutate trip state.
   - To find, recommend, explore, or search for attractions, restaurants, food (ramen, dinner, lunch, cafes), sights, or points of interest in the destination or POI database, always call `search_pois` (or `find_nearby` for proximity searches). Paladio has a local database of curated POIs for the destination; never claim you cannot access the POI database or ask the user to provide place lists.
   - To inspect logged expenses or costs, always call `list_expenses`.
   - To operate on a stop, identify its exact `stop_id`. If the user refers to a place by name, use `resolve_stop` first.
   - Never attempt to call pseudo-tools or special functions like `commentary`, `thought`, or `notes`. To communicate, summarize, or explain recommendations, always respond directly with standard markdown text.
3. Minimalist & Tactical: Communicate with extreme clarity and high information density. No conversational fluff, no greetings, and NEVER use emojis.
   - Format with clean standard Markdown. Wrap recommended place names in bold **Place Name** so they link to interactive map chips.
   - Use standard markdown for lists (`- ` or `1. `) and bold for attribute labels (e.g. **Location:**, **Why it's great:**). Never output literal bullet characters (•) or mix asterisks with colons.
4. Safe Mutations: Destructive or large-scale actions (such as removing stops, swapping entire days, or re-optimizing the entire trip) will trigger a proposal for the user to confirm.
5. Context Awareness: Pay attention to the injected trip digest and UI context (e.g. selected day or stop). Resolve relative phrases like "move this to tomorrow" using the active selection.

When an operation completes, summarize the outcome in 1-2 concise sentences.
"""


def build_system_prompt(trip_id: Optional[str] = None) -> str:
    """Returns the core system prompt for the trip agent."""
    prompt = SYSTEM_PROMPT.strip()
    if trip_id:
        grounding_hint = (
            f"\nThe active trip ID is '{trip_id}'. "
            f"Always pass trip_id='{trip_id}' to any tool that requires a trip_id argument."
        )
        prompt += grounding_hint
    return prompt


def build_trip_digest(
    doc: ItineraryDocument,
    trip: TripModel,
    issues: Optional[list[ChangeWarning]] = None,
    expenses_total: float = 0.0,
    ui_context: Optional[dict[str, Any]] = None,
) -> str:
    """
    Builds a token-efficient compact digest of the trip state and active UI selection
    injected into every agent turn.
    """
    trip_title = (
        getattr(trip, "title", None)
        or (
            trip.itinerary_data.get("title")
            if isinstance(trip.itinerary_data, dict)
            else None
        )
        or trip.destination
    )
    lines = [
        "--- CURRENT TRIP DIGEST ---",
        f"Trip: {trip_title} (ID: {trip.id}, Revision: {trip.revision or 0})",
        f"Destination: {trip.destination} | Dates: {trip.start_date or 'TBD'} to {trip.end_date or 'TBD'}",
    ]

    # UI Context
    if ui_context:
        ctx_parts = []
        if ui_context.get("active_tab"):
            ctx_parts.append(f"Tab={ui_context['active_tab']}")
        if ui_context.get("selected_day") is not None:
            ctx_parts.append(f"Day={ui_context['selected_day']}")
        if ui_context.get("selected_stop_id"):
            ctx_parts.append(f"SelectedStopId={ui_context['selected_stop_id']}")
        if ctx_parts:
            lines.append(f"Active UI: {', '.join(ctx_parts)}")

    # Days and stops
    lines.append(f"Days ({len(doc.days)} total):")
    for d in doc.days:
        day_date = d.date or f"Day {d.day}"
        stops = d.itinerary.path
        stop_strs = []
        for s in stops:
            s_name = (
                getattr(s, "name", None)
                or (s.poi.get("name") if isinstance(s.poi, dict) else None)
                or "Stop"
            )
            time_str = s.scheduled_start or "TBD"
            lock_flag = " [LOCKED]" if s.is_locked else ""
            stop_strs.append(
                f"[{s.stop_id}] {s_name} ({time_str}, {s.duration or 60}m){lock_flag}"
            )

        if stop_strs:
            lines.append(f"  Day {d.day} ({day_date}): " + " -> ".join(stop_strs))
        else:
            lines.append(f"  Day {d.day} ({day_date}): (No stops scheduled)")

    # Budget
    currency = (
        getattr(doc, "currency", None)
        or (
            (doc.metadata or {}).get("currency")
            if isinstance(doc.metadata, dict)
            else None
        )
        or "EUR"
    )
    lines.append(f"Expenses logged: {expenses_total:.2f} {currency}")

    # Issues
    if issues:
        active_issues = [w for w in issues if w.severity in ("warning", "error")]
        if active_issues:
            lines.append(f"Active Issues ({len(active_issues)}):")
            for iss in active_issues[:5]:
                lines.append(
                    f"  - [{iss.severity.upper()}] Day {iss.day}: {iss.message}"
                )

    lines.append("--- END DIGEST ---")
    return "\n".join(lines)
