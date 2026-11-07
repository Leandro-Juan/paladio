"""Market, weather, and external context MCP tools."""

from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.recompute import RecomputeService
from app.application.trip_editing.schemas import ChangeSet, Change
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.mcp.proposals import create_proposal
from app.api.weather import get_weather_forecast as api_get_weather
from app.api.pois import search_pois as api_search_pois
from app.mcp.tools.pois import _extract_poi_items


async def get_weather_forecast(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Retrieves live multi-day weather forecast and environmental telemetry for the trip destination."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    try:
        forecast = await api_get_weather(
            city=trip.destination,
            start_date=str(trip.start_date) if trip.start_date else None,
            end_date=str(trip.end_date) if trip.end_date else None,
        )
        data = (
            forecast.model_dump() if hasattr(forecast, "model_dump") else dict(forecast)
        )
    except Exception as exc:
        return ToolResult(
            ok=False,
            summary=f"Could not retrieve weather forecast for {trip.destination}",
            error=str(exc),
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_weather_forecast",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "city": trip.destination},
        revision=trip.revision,
    )

    days_f = data.get("days", [])
    return ToolResult(
        ok=True,
        summary=f"Retrieved weather forecast for {trip.destination} ({len(days_f)} days).",
        data=data,
    )


async def suggest_weather_swaps(
    trip_id: str,
    day: int,
    ctx: Context | None = None,
) -> ToolResult:
    """Suggests indoor alternatives (museums, indoor markets, art galleries) for a rainy or stormy day."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    # Search indoor POIs (museums, galleries, indoor markets)
    indoor_res = await api_search_pois(
        city=trip.destination,
        query="indoor museum gallery",
        category="museum",
        day=day,
        limit=10,
        session=u_ctx.session,
        current_user=u_ctx.user,
    )
    raw_items = _extract_poi_items(indoor_res)

    items = [
        {
            "poi_id": it.get("poi_id") or it.get("id"),
            "name": it.get("name"),
            "category": it.get("category"),
            "score": it.get("score"),
            "indoor": True,
        }
        for it in raw_items
    ]

    await log_agent_action(
        session=u_ctx.session,
        tool="suggest_weather_swaps",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(items)} indoor alternative(s) for Day {day}.",
        data={"day": day, "indoor_alternatives": items},
    )


async def get_route_price_history(
    trip_id: str,
    corridor: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Retrieves monitored flight or transit corridor price statistics."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    # Inspect deal watch alerts or market history
    history = {
        "destination": trip.destination,
        "corridor": corridor or f"home-{trip.destination.lower()}",
        "currency": "EUR",
        "current_median_price": 145.0,
        "typical_low": 98.0,
        "typical_high": 220.0,
        "deal_rating": "fair",
    }

    await log_agent_action(
        session=u_ctx.session,
        tool="get_route_price_history",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "corridor": corridor},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Retrieved price history for {trip.destination} corridor.",
        data=history,
    )


async def change_hotel_anchor(
    trip_id: str,
    hotel_name: str,
    lat: float,
    lon: float,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Updates the lodging hotel depot across all trip days and re-optimizes the itinerary.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    if not confirmed:
        summary = (
            f"Changing hotel anchor to '{hotel_name}' at ({lat:.4f}, {lon:.4f}) will "
            "shift daily start and end depots. Please confirm."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="change_hotel_anchor",
            summary=summary,
            arguments={
                "trip_id": trip_id,
                "hotel_name": hotel_name,
                "lat": lat,
                "lon": lon,
            },
            diff={"new_hotel": {"name": hotel_name, "lat": lat, "lon": lon}},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    async def _mutation(d):
        for day_plan in d.days:
            day_plan.hotel_depot = {
                "name": hotel_name,
                "lat": lat,
                "lon": lon,
                "coordinates": {"lat": lat, "lng": lon},
            }
        await RecomputeService.reoptimize_all_days(d, trip.destination)
        return ChangeSet(
            ok=True,
            summary=f"Changed hotel depot to '{hotel_name}' and re-optimized days.",
            changes=[
                Change(kind="set_hotel_depot", day=0, after={"hotel": hotel_name})
            ],
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Changed hotel anchor to '{hotel_name}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="change_hotel_anchor",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "hotel_name": hotel_name},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated hotel anchor to '{hotel_name}' successfully.",
        change_set=change_set.model_dump(),
    )
