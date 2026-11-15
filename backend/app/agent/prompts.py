from __future__ import annotations

from typing import Any

from app.application.trip_editing.schemas import ChangeWarning
from app.db.models import TripModel
from app.domain.schemas.itinerary_document import ItineraryDocument

SYSTEM_PROMPT = """You are Paladio Trip Agent, an expert tactical itinerary co-pilot.
Your mission is to assist travelers in planning, adjusting, optimizing, and organizing their trips with mathematical precision.

Core Invariants:
1. Sovereign & Dynamic: All data is dynamic. Never invent mock data, fake stop IDs, or synthetic coordinates.
2. Tool Grounding & Strict Anti-Hallucination:
   - Always use tools to inspect or mutate trip state.
   - When asked to recommend, find, or suggest attractions, restaurants, food (dinner, lunch, breakfast, cafes), or places:
     YOU MUST CALL `find_nearby` (for proximity searches near a stop/coordinate) or `search_pois` (for destination-wide search) BEFORE making any recommendation.
     NEVER invent, hallucinate, or recall restaurant or venue names from memory. Only recommend real places returned by `find_nearby` or `search_pois`.
   - When asked to add, schedule, or modify a meal or stop:
     YOU MUST CALL `add_meal` (e.g. `add_meal(trip_id=..., day=..., meal_type="dinner", name="...")`) or `add_stop`.
     NEVER write out simulated route updates, text arrow chains (`->`), or fabricated stop IDs/UUIDs in chat text. The system and UI update the schedule automatically when tools execute.
   - To inspect logged expenses or costs, always call `list_expenses`.
   - When the user expresses a persistent travel preference or dislike (e.g. "I hate museums", "I love quiet jazz bars", "no shopping"), call `record_taste_preference`. To remove a stored preference or veto, call `forget_taste_preference`. To summarize learned user or group preferences, call `describe_taste_profile`.
   - To operate on an existing stop, identify its exact `stop_id`. If the user refers to a place by name, use `resolve_stop` first.
   - Never attempt to call pseudo-tools or special functions like `commentary`, `thought`, or `notes`. To communicate, summarize, or explain recommendations, respond directly with standard markdown text.
3. Minimalist & Tactical: Communicate with extreme clarity and high information density. No conversational fluff, no greetings, and NEVER use emojis.
   - Format with clean standard Markdown. Wrap recommended place names in bold **Place Name** so they link to interactive map chips in the UI.
   - Use standard markdown for lists (`- ` or `1. `) and bold for attribute labels (e.g. **Location:**, **Why it's great:**). Never output literal bullet characters (•) or mix asterisks with colons.
4. Safe Mutations: Destructive or large-scale actions (such as removing stops, swapping entire days, or re-optimizing the entire trip) will trigger a proposal for the user to confirm.
5. Context Awareness: Pay attention to the injected trip digest and UI context (e.g. selected day or stop). Resolve relative phrases like "move this to tomorrow" using the active selection.

When an operation completes, summarize the outcome in 1-2 concise sentences.
"""


def build_system_prompt(trip_id: str | None = None) -> str:
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
    issues: list[ChangeWarning] | None = None,
    expenses_total: float = 0.0,
    ui_context: dict[str, Any] | None = None,
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
    selected_day = ui_context.get("selected_day") if ui_context else None
    selected_day_num: int | None = None
    if selected_day not in (None, "", "all", 0, "ALL DAYS"):
        try:
            selected_day_num = int(selected_day)
        except (ValueError, TypeError):
            selected_day_num = None

    for d in doc.days:
        day_date = d.date or f"Day {d.day}"
        stops = d.itinerary.path
        is_focused_day = (selected_day_num is None) or (d.day == selected_day_num)

        if not is_focused_day:
            # Compact summary for unselected days to save context tokens and focus the model
            lines.append(f"  Day {d.day} ({day_date}): {len(stops)} stops scheduled")
            continue

        if stops:
            lines.append(f"  Day {d.day} ({day_date}):")
            for idx, s in enumerate(stops, start=1):
                s_name = (
                    getattr(s, "name", None)
                    or (s.poi.get("name") if isinstance(s.poi, dict) else None)
                    or "Stop"
                )
                time_str = s.scheduled_start or "TBD"
                lock_flag = " [LOCKED]" if s.is_locked else ""
                lines.append(
                    f"    {idx}. {s_name} ({time_str}, {s.duration or 60}m) [id: {s.stop_id}]{lock_flag}"
                )
        else:
            lines.append(f"  Day {d.day} ({day_date}): (No stops scheduled)")

    lines.append(
        "  [Note: 'id' values above are internal identifiers for tool arguments; never output raw IDs to the user.]"
    )

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
