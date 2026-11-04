"""MCP Resources providing static and dynamic contextual data."""

import json
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.expense_service import ExpenseService
from app.application.trip_editing.ticket_service import TicketService
from app.domain.schemas.itinerary_document import ItineraryDocument
from app.mcp.context import get_user_context


async def read_trip_overview_resource(trip_id: str, ctx: Context | None = None) -> str:
    """Resource returning JSON overview of a trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)
    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)
    overview = {
        "id": trip.id,
        "destination": trip.destination,
        "title": getattr(trip, "title", None)
        or (
            trip.itinerary_data.get("title")
            if isinstance(trip.itinerary_data, dict)
            else None
        )
        or trip.destination,
        "start_date": str(trip.start_date) if trip.start_date else None,
        "end_date": str(trip.end_date) if trip.end_date else None,
        "days": len(doc.days),
        "revision": trip.revision,
    }
    return json.dumps(overview, indent=2, ensure_ascii=False)


async def read_trip_day_resource(
    trip_id: str, day_number: int, ctx: Context | None = None
) -> str:
    """Resource returning JSON day schedule for a specific day."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)
    day_data = await TripService.get_itinerary(
        trip_id, detail="day", day=day_number, user=u_ctx.user, session=u_ctx.session
    )
    return json.dumps(day_data, indent=2, ensure_ascii=False)


async def read_trip_expenses_resource(trip_id: str, ctx: Context | None = None) -> str:
    """Resource returning JSON expense ledger and settlements for a trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)
    expenses = await ExpenseService.list_expenses(trip_id, u_ctx.user, u_ctx.session)
    settlement = await ExpenseService.get_settlement(trip_id, u_ctx.user, u_ctx.session)
    data = {
        "expenses": [e.model_dump() for e in expenses],
        "settlement": settlement,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


async def read_trip_wallet_resource(trip_id: str, ctx: Context | None = None) -> str:
    """Resource returning redacted wallet tickets for a trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)
    tickets = await TicketService.list_tickets(
        trip_id, u_ctx.user, u_ctx.session, redact_secrets=True
    )
    return json.dumps({"tickets": tickets}, indent=2, ensure_ascii=False)


def read_paladio_taxonomy_resource() -> str:
    """Resource returning activity and place taxonomy."""
    taxonomy = {
        "categories": [
            "attraction",
            "museum",
            "historic",
            "park",
            "viewpoint",
            "restaurant",
            "cafe",
            "bar",
            "lodging",
            "transit",
            "airport",
        ],
        "meal_types": ["breakfast", "lunch", "dinner"],
        "transport_modes": ["walking", "transit", "taxi", "bicycle"],
    }
    return json.dumps(taxonomy, indent=2)


def read_itinerary_schema_resource() -> str:
    """Resource returning the JSON schema of Paladio's ItineraryDocument."""
    schema = ItineraryDocument.model_json_schema()
    return json.dumps(schema, indent=2)
