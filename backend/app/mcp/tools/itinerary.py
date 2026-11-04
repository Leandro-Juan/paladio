"""Itinerary editing MCP tools."""

from typing import Any
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.itinerary_editor import ItineraryEditor
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.mcp.proposals import create_proposal
from app.api.pois import get_poi_details as api_get_poi_details


async def add_stop(
    trip_id: str,
    day: int,
    poi_id: str | None = None,
    name: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    after_stop_id: str | None = None,
    duration_mins: int = 60,
    category: str | None = None,
    notes: str | None = None,
    scheduled_start: int | str | None = None,
    auto_place: bool = True,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Adds a stop to a specific day in the itinerary.
    Can add an existing catalog POI via poi_id, or a custom stop via name and lat/lon.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    poi_dict: dict[str, Any] = {}
    if poi_id:
        try:
            details = await api_get_poi_details(poi_id=poi_id, session=u_ctx.session)
            poi_dict = (
                details.model_dump()
                if hasattr(details, "model_dump")
                else dict(details)
            )
        except Exception:
            poi_dict = {
                "id": poi_id,
                "name": name or poi_id,
                "category": category or "attraction",
            }
    else:
        if not name or lat is None or lon is None:
            return ToolResult(
                ok=False,
                summary="Either poi_id or (name, lat, lon) must be provided to add a stop.",
                error="Missing stop coordinates or name.",
            )
        import uuid

        poi_dict = {
            "id": f"custom_{uuid.uuid4().hex[:8]}",
            "name": name,
            "lat": lat,
            "lon": lon,
            "coordinates": {"lat": lat, "lng": lon},
            "category": category or "custom",
            "custom_stop": True,
        }

    def _mutation(doc):
        # Auto-place: if after_stop_id is omitted and auto_place is True, place at end of daytime stops
        resolved_after = after_stop_id
        if not resolved_after and auto_place:
            for d in doc.days:
                if d.day == day and d.itinerary.path:
                    resolved_after = d.itinerary.path[-1].stop_id
                    break

        return ItineraryEditor.add_stop(
            doc=doc,
            day=day,
            poi=poi_dict,
            after_stop_id=resolved_after,
            duration_mins=duration_mins,
            custom_stop=bool(not poi_id),
            notes=notes,
            scheduled_start=scheduled_start,
        )

    poi_name = poi_dict.get("name") or "New Stop"
    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Added '{poi_name}' to Day {day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day, "poi_id": poi_id, "name": poi_name},
    )

    return ToolResult(
        ok=True,
        summary=f"Added '{poi_name}' to Day {day} successfully.",
        change_set=change_set.model_dump(),
    )


async def remove_stop(
    trip_id: str,
    stop_id: str,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Removes a stop from the itinerary.
    Tier C if the stop is locked or is a flight/hotel anchor.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    d_idx, _, target_stop = doc.find_stop(stop_id)
    if not target_stop or d_idx is None:
        return ToolResult(
            ok=False,
            summary=f"Stop with ID '{stop_id}' not found in trip {trip_id}.",
            error=f"Stop '{stop_id}' does not exist.",
        )

    # Check Tier C condition
    is_anchor = getattr(
        target_stop, "is_flight_anchor", False
    ) or target_stop.category in ("hotel", "lodging", "flight", "airport")
    is_locked = getattr(target_stop, "is_locked", False)

    if (is_anchor or is_locked) and not confirmed:
        reason = "a locked stop" if is_locked else "a flight or lodging anchor"
        summary = (
            f"Stop '{target_stop.name}' on Day {doc.days[d_idx].day} is {reason}. "
            "Removing it may disrupt dependencies. Please confirm removal."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="remove_stop",
            summary=summary,
            arguments={"trip_id": trip_id, "stop_id": stop_id},
            diff={"removed_stop": target_stop.model_dump()},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    def _mutation(d):
        return ItineraryEditor.remove_stop(d, stop_id)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Removed stop '{target_stop.name}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="remove_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Removed stop '{target_stop.name}' from Day {doc.days[d_idx].day}.",
        change_set=change_set.model_dump(),
    )


async def move_stop(
    trip_id: str,
    stop_id: str,
    to_day: int,
    after_stop_id: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Moves a stop to another day and position, cascading travel times on both affected days.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.move_stop(
            doc=doc,
            stop_id=stop_id,
            to_day=to_day,
            after_stop_id=after_stop_id,
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Moved stop '{stop_id}' to Day {to_day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="move_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id, "to_day": to_day},
    )

    return ToolResult(
        ok=True,
        summary=f"Moved stop to Day {to_day} successfully.",
        change_set=change_set.model_dump(),
    )


async def reorder_day(
    trip_id: str,
    day: int,
    ordered_stop_ids: list[str],
    ctx: Context | None = None,
) -> ToolResult:
    """
    Explicitly re-sequences the stops of a given day according to ordered_stop_ids.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.reorder_day(doc, day, ordered_stop_ids)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Reordered stops for Day {day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="reorder_day",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day, "ordered_stop_ids": ordered_stop_ids},
    )

    return ToolResult(
        ok=True,
        summary=f"Reordered Day {day} stops successfully.",
        change_set=change_set.model_dump(),
    )


async def swap_days(
    trip_id: str,
    day_a: int,
    day_b: int,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Swaps the entire schedules between Day A and Day B.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    if not confirmed:
        summary = (
            f"Swap full schedule between Day {day_a} and Day {day_b}. Please confirm."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="swap_days",
            summary=summary,
            arguments={"trip_id": trip_id, "day_a": day_a, "day_b": day_b},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    def _mutation(doc):
        return ItineraryEditor.swap_days(doc, day_a, day_b)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Swapped Day {day_a} and Day {day_b}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="swap_days",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day_a": day_a, "day_b": day_b},
    )

    return ToolResult(
        ok=True,
        summary=f"Swapped Day {day_a} and Day {day_b} successfully.",
        change_set=change_set.model_dump(),
    )


async def set_stop_time(
    trip_id: str,
    stop_id: str,
    scheduled_start: int | str,
    scheduled_end: int | str | None = None,
    lock: bool = True,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Pins a specific start time for a stop and locks it as a fixed point.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.set_stop_time(
            doc=doc,
            stop_id=stop_id,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            lock=lock,
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Set time for stop '{stop_id}' to {scheduled_start}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="set_stop_time",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={
            "trip_id": trip_id,
            "stop_id": stop_id,
            "scheduled_start": scheduled_start,
        },
    )

    return ToolResult(
        ok=True,
        summary=f"Set stop time to {scheduled_start} (locked={lock}).",
        change_set=change_set.model_dump(),
    )


async def set_stop_duration(
    trip_id: str,
    stop_id: str,
    duration_mins: int,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Updates the planned duration of a stop in minutes.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.set_stop_duration(doc, stop_id, duration_mins)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Set stop '{stop_id}' duration to {duration_mins}m",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="set_stop_duration",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id, "duration_mins": duration_mins},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated stop duration to {duration_mins} minutes.",
        change_set=change_set.model_dump(),
    )


async def lock_stop(
    trip_id: str,
    stop_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Locks a stop in place as a fixed point for optimizer calculations."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.lock_stop(doc, stop_id, locked=True)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Locked stop '{stop_id}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="lock_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Locked stop '{stop_id}' successfully.",
        change_set=change_set.model_dump(),
    )


async def unlock_stop(
    trip_id: str,
    stop_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Unlocks a stop, allowing the optimizer to reposition or reschedule it."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.lock_stop(doc, stop_id, locked=False)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Unlocked stop '{stop_id}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="unlock_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Unlocked stop '{stop_id}' successfully.",
        change_set=change_set.model_dump(),
    )


async def add_meal(
    trip_id: str,
    day: int,
    meal_type: str = "lunch",  # 'breakfast', 'lunch', 'dinner'
    name: str | None = None,
    scheduled_start: int | str | None = None,
    duration_mins: int = 60,
    ctx: Context | None = None,
) -> ToolResult:
    """Adds a scheduled meal window (breakfast, lunch, or dinner) to a day."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.add_meal(
            doc=doc,
            day=day,
            meal_type=meal_type,
            name=name,
            scheduled_start=scheduled_start,
            duration_mins=duration_mins,
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Added {meal_type} to Day {day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_meal",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day, "meal_type": meal_type},
    )

    return ToolResult(
        ok=True,
        summary=f"Added {meal_type} to Day {day} successfully.",
        change_set=change_set.model_dump(),
    )


async def add_free_time(
    trip_id: str,
    day: int,
    duration_mins: int = 60,
    after_stop_id: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Adds an unscheduled free time and exploration block to a day."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.add_free_time(
            doc=doc,
            day=day,
            duration_mins=duration_mins,
            after_stop_id=after_stop_id,
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Added {duration_mins}m free time to Day {day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_free_time",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day, "duration_mins": duration_mins},
    )

    return ToolResult(
        ok=True,
        summary=f"Added {duration_mins}m free time to Day {day}.",
        change_set=change_set.model_dump(),
    )


async def set_stop_notes(
    trip_id: str,
    stop_id: str,
    notes: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Sets user notes or tips on a specific stop."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.set_stop_notes(doc, stop_id, notes)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Updated notes for stop '{stop_id}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="set_stop_notes",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated notes for stop '{stop_id}'.",
        change_set=change_set.model_dump(),
    )


async def add_day(
    trip_id: str,
    date: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Adds a new empty day to the itinerary."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.add_day(doc, date)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary="Added day to itinerary",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="add_day",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "date": date},
    )

    return ToolResult(
        ok=True,
        summary="Added new day to itinerary successfully.",
        change_set=change_set.model_dump(),
    )


async def remove_day(
    trip_id: str,
    day: int,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Removes a day and all its stops from the itinerary.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    if not confirmed:
        summary = f"Remove Day {day} and all its scheduled stops. Please confirm."
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="remove_day",
            summary=summary,
            arguments={"trip_id": trip_id, "day": day},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    def _mutation(doc):
        return ItineraryEditor.remove_day(doc, day)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Removed Day {day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="remove_day",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day},
    )

    return ToolResult(
        ok=True,
        summary=f"Removed Day {day} successfully.",
        change_set=change_set.model_dump(),
    )


async def set_day_bounds(
    trip_id: str,
    day: int,
    start_time: int | str | None = None,
    end_time: int | str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """Configures the operating day start and end time window."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.set_day_bounds(doc, day, start_time, end_time)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Set Day {day} bounds to {start_time}-{end_time}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="set_day_bounds",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={
            "trip_id": trip_id,
            "day": day,
            "start_time": start_time,
            "end_time": end_time,
        },
    )

    return ToolResult(
        ok=True,
        summary=f"Set Day {day} bounds to {start_time}-{end_time}.",
        change_set=change_set.model_dump(),
    )


async def set_pace(
    trip_id: str,
    pace: str,  # 'leisurely', 'relaxed', 'balanced', 'intense', 'fast'
    ctx: Context | None = None,
) -> ToolResult:
    """Sets travel pace constraint (leisurely, balanced, intense)."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        return ItineraryEditor.set_pace(doc, pace)

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Set travel pace to '{pace}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="set_pace",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "pace": pace},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated travel pace to '{pace}'.",
        change_set=change_set.model_dump(),
    )


async def undo_last_change(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Restores the previous revision snapshot of the trip itinerary."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    res = await TripService.undo_last_change(trip_id, u_ctx.user, u_ctx.session)

    await log_agent_action(
        session=u_ctx.session,
        tool="undo_last_change",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=res.revision,
    )

    restored_rev = 0
    if res.changes and res.changes[0].after:
        restored_rev = res.changes[0].after.get("restored_revision", 0)
    data = res.model_dump()
    data["restored_revision"] = restored_rev

    return ToolResult(
        ok=True,
        summary=f"Reverted to revision {res.revision} successfully.",
        data=data,
    )


async def undo_to(
    trip_id: str,
    target_revision: int,
    ctx: Context | None = None,
) -> ToolResult:
    """Restores the trip itinerary to an explicit target revision."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    res = await TripService.undo_to_revision(
        trip_id, target_revision, u_ctx.user, u_ctx.session
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="undo_to",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "target_revision": target_revision},
        revision=res.revision,
    )

    data = res.model_dump()
    data["restored_revision"] = target_revision

    return ToolResult(
        ok=True,
        summary=f"Restored trip to revision {target_revision} successfully.",
        data=data,
    )
