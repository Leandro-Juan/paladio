"""Trip and context MCP tools."""

import difflib
from typing import Any
from mcp.server.fastmcp import Context
from sqlalchemy import select, func

from app.core.access import TripAccessLevel
from app.db.models import (
    TripParticipantModel,
    TripTicketModel,
    TripExpenseModel,
    TripCollectionModel,
    TripRevisionModel,
)
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.validation import ItineraryValidator
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult, TripOverviewData, TripIssuesData
from app.mcp.proposals import create_proposal
from app.trip_package.packager import TripPackager


async def get_trip_overview(trip_id: str, ctx: Context | None = None) -> ToolResult:
    """
    Retrieves high-level summary of a trip: dates, destination, timezone, status,
    day count, participant count, ticket count, budget summary, and quality gates.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    # Participant count
    res_p = await u_ctx.session.execute(
        select(func.count(TripParticipantModel.id)).where(
            TripParticipantModel.trip_id == trip_id
        )
    )
    p_count = res_p.scalar() or 0

    # Ticket count
    res_t = await u_ctx.session.execute(
        select(func.count(TripTicketModel.id)).where(TripTicketModel.trip_id == trip_id)
    )
    t_count = res_t.scalar() or 0

    # Budget summary
    res_e = await u_ctx.session.execute(
        select(func.coalesce(func.sum(TripExpenseModel.amount), 0.0)).where(
            TripExpenseModel.trip_id == trip_id
        )
    )
    total_spent = float(res_e.scalar() or 0.0)

    # Quality evaluation
    quality = ItineraryValidator.evaluate_quality(doc)

    trip_title = getattr(trip, "title", None) or (
        trip.itinerary_data.get("title")
        if isinstance(trip.itinerary_data, dict)
        else None
    )
    city_ctx = getattr(doc, "city_context", None)
    tz = "UTC"
    if city_ctx:
        tz = (
            getattr(city_ctx, "timezone", None)
            or (city_ctx.get("timezone") if isinstance(city_ctx, dict) else None)
            or "UTC"
        )
    elif doc.metadata and isinstance(doc.metadata, dict):
        tz = doc.metadata.get("timezone") or "UTC"

    curr = (
        getattr(doc, "currency", None)
        or (
            (doc.metadata or {}).get("currency")
            if isinstance(doc.metadata, dict)
            else None
        )
        or "EUR"
    )

    overview = TripOverviewData(
        trip_id=trip.id,
        title=trip_title,
        destination=trip.destination,
        start_date=str(trip.start_date) if trip.start_date else None,
        end_date=str(trip.end_date) if trip.end_date else None,
        timezone=tz,
        status=getattr(trip, "status", "active") or "active",
        day_count=len(doc.days),
        participant_count=p_count,
        ticket_count=t_count,
        revision=trip.revision,
        budget_summary={
            "total_expenses": total_spent,
            "currency": curr,
        },
        quality_gates=quality.model_dump() if quality else {},
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_trip_overview",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=trip.revision,
    )

    summary_text = (
        f"Trip {trip.id} to {trip.destination} ({len(doc.days)} days, revision {trip.revision}, "
        f"{p_count} travelers, {t_count} tickets)."
    )
    return ToolResult(ok=True, summary=summary_text, data=overview.model_dump())


async def get_itinerary(
    trip_id: str,
    detail: str = "summary",  # 'summary', 'day', 'full'
    day: int | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Returns the trip itinerary.
    detail='summary' returns compacted stop titles and times.
    detail='day' returns full details for a single day.
    detail='full' returns the complete itinerary document.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    data = await TripService.get_itinerary(
        trip_id=trip_id,
        detail=detail,
        day=day,
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_itinerary",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "detail": detail, "day": day},
        revision=trip.revision,
    )

    summary_text = f"Retrieved itinerary for trip {trip_id} (detail='{detail}')"
    if day is not None:
        summary_text += f" for day {day}"
    return ToolResult(ok=True, summary=summary_text, data=data)


async def get_stop(
    trip_id: str, stop_id: str, ctx: Context | None = None
) -> ToolResult:
    """
    Retrieves full details of a single stop by stop_id: times, cost, hours,
    and transit leg from the previous stop.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    target_stop = None
    target_day = None
    prev_leg = None

    for d in doc.days:
        for idx, s in enumerate(d.itinerary.path):
            if s.stop_id == stop_id:
                target_stop = s
                target_day = d.day
                prev_leg = s.transit_from_previous
                break
        if target_stop:
            break

    if not target_stop:
        return ToolResult(
            ok=False,
            summary=f"Stop with ID '{stop_id}' not found in trip {trip_id}",
            error=f"Stop '{stop_id}' does not exist in trip {trip_id}",
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id},
        revision=trip.revision,
    )

    stop_data = target_stop.model_dump()
    stop_name = (
        getattr(target_stop, "name", None)
        or (target_stop.poi.get("name") if isinstance(target_stop.poi, dict) else None)
        or "Stop"
    )
    stop_data["name"] = stop_name

    res = {
        "stop": stop_data,
        "day": target_day,
        "transit_from_previous": prev_leg.model_dump()
        if hasattr(prev_leg, "model_dump")
        else prev_leg,
    }
    return ToolResult(
        ok=True,
        summary=f"Stop '{stop_name}' (Day {target_day}, {target_stop.scheduled_start or 'TBD'})",
        data=res,
    )


async def resolve_stop(
    trip_id: str, query: str, ctx: Context | None = None
) -> ToolResult:
    """
    Fuzzy matches a search query (e.g. 'the Prado' or 'lunch') against stops in the trip.
    Returns candidate stop_ids to prevent models guessing incorrect identifiers.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    candidates = []
    q_clean = query.strip().lower()

    for d in doc.days:
        for s in d.itinerary.path:
            s_name = (
                getattr(s, "name", None)
                or (s.poi.get("name") if isinstance(s.poi, dict) else None)
                or ""
            )
            s_cat = (
                getattr(s, "category", None)
                or (s.poi.get("category") if isinstance(s.poi, dict) else None)
                or ""
            )
            name_score = difflib.SequenceMatcher(None, q_clean, s_name.lower()).ratio()
            # Check substring matches
            if q_clean in s_name.lower() or (s_cat and q_clean in s_cat.lower()):
                name_score = max(name_score, 0.85)

            if name_score > 0.4:
                candidates.append(
                    {
                        "stop_id": s.stop_id,
                        "name": s_name,
                        "day": d.day,
                        "category": s_cat,
                        "time": s.scheduled_start,
                        "score": round(name_score, 3),
                    }
                )

    candidates.sort(key=lambda x: x["score"], reverse=True)
    top_candidates = candidates[:5]

    summary = f"Found {len(top_candidates)} candidate stop(s) for '{query}'"
    return ToolResult(ok=True, summary=summary, data=top_candidates)


async def get_trip_issues(trip_id: str, ctx: Context | None = None) -> ToolResult:
    """
    Checks the itinerary for issues: opening hours conflicts, over-budget warnings,
    tight transfers, flight anchor collisions, or day span issues.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    issues = ItineraryValidator.validate_itinerary(
        doc, destination_city=trip.destination
    )

    warnings = [w.model_dump() for w in issues if w.severity == "warning"]
    errors = [e.model_dump() for e in issues if e.severity == "error"]

    data = TripIssuesData(
        trip_id=trip_id,
        total_issues=len(issues),
        warnings=warnings,
        errors=errors,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_trip_issues",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Trip has {len(warnings)} warning(s) and {len(errors)} error(s)",
        data=data.model_dump(),
    )


async def update_trip_details(
    trip_id: str,
    title: str | None = None,
    notes: str | None = None,
    status: str | None = None,
    destination: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Updates trip properties.
    Updating title, notes, or status is reversible write (Tier W).
    Changing destination, start_date, or end_date invalidates the schedule and requires
    user confirmation (Tier C).
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    # Check Tier C trigger
    destination_changed = (
        destination is not None and destination.strip() != trip.destination
    )
    dates_changed = (start_date is not None and start_date != str(trip.start_date)) or (
        end_date is not None and end_date != str(trip.end_date)
    )

    if (destination_changed or dates_changed) and not confirmed:
        diff: dict[str, Any] = {}
        if destination_changed:
            diff["destination"] = {"before": trip.destination, "after": destination}
        if dates_changed:
            diff["start_date"] = {"before": str(trip.start_date), "after": start_date}
            diff["end_date"] = {"before": str(trip.end_date), "after": end_date}

        summary = (
            f"Changing trip destination or dates ({diff}) will invalidate the current schedule. "
            "Please confirm this major update."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="update_trip_details",
            summary=summary,
            arguments={
                "trip_id": trip_id,
                "title": title,
                "notes": notes,
                "status": status,
                "destination": destination,
                "start_date": start_date,
                "end_date": end_date,
            },
            diff=diff,
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    current_title = getattr(trip, "title", None) or (
        trip.itinerary_data.get("title")
        if isinstance(trip.itinerary_data, dict)
        else None
    )
    before_state = {
        "title": current_title,
        "notes": getattr(trip, "notes", None),
        "destination": trip.destination,
        "start_date": str(trip.start_date) if trip.start_date else None,
        "end_date": str(trip.end_date) if trip.end_date else None,
        "status": getattr(trip, "status", "active"),
    }

    if title is not None:
        if hasattr(trip, "title"):
            trip.title = title
        elif isinstance(trip.itinerary_data, dict):
            trip.itinerary_data["title"] = title
    if notes is not None and hasattr(trip, "notes"):
        trip.notes = notes
    if status is not None and hasattr(trip, "status"):
        trip.status = status
    if destination is not None:
        trip.destination = destination
    if start_date is not None:
        trip.start_date = start_date
    if end_date is not None:
        trip.end_date = end_date

    trip.revision += 1

    after_title = getattr(trip, "title", None) or (
        trip.itinerary_data.get("title")
        if isinstance(trip.itinerary_data, dict)
        else None
    )
    after_state = {
        "title": after_title,
        "notes": getattr(trip, "notes", None),
        "destination": trip.destination,
        "start_date": str(trip.start_date) if trip.start_date else None,
        "end_date": str(trip.end_date) if trip.end_date else None,
        "status": getattr(trip, "status", "active"),
    }

    import uuid

    rev_row = TripRevisionModel(
        id=str(uuid.uuid4()),
        trip_id=trip_id,
        revision=trip.revision,
        actor="agent",
        actor_detail={"user_id": u_ctx.user.id if u_ctx.user else None},
        before=before_state,
        after=after_state,
        summary=f"Updated trip details (rev {trip.revision})",
    )
    u_ctx.session.add(rev_row)
    await u_ctx.session.commit()

    await log_agent_action(
        session=u_ctx.session,
        tool="update_trip_details",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        revision=trip.revision,
        args={"trip_id": trip_id, "title": title, "destination": destination},
    )

    return ToolResult(
        ok=True,
        summary=f"Updated trip details successfully (revision {trip.revision})",
        data=after_state,
    )


async def export_trip_package(
    trip_id: str,
    profile: str = "full_vault",
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Exports the trip as a self-contained .trip package.
    profile='full_vault' (Tier R) includes all attachments and secrets.
    profile='community_shareable' (Tier C) scrubs sensitive data and requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    if profile == "community_shareable" and not confirmed:
        summary = (
            f"Exporting with profile '{profile}' creates a sanitized shareable package. "
            "Please confirm export."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="export_trip_package",
            summary=summary,
            arguments={"trip_id": trip_id, "profile": profile},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    res_p = await u_ctx.session.execute(
        select(TripParticipantModel).where(TripParticipantModel.trip_id == trip_id)
    )
    participants = list(res_p.scalars().all())

    res_e = await u_ctx.session.execute(
        select(TripExpenseModel).where(TripExpenseModel.trip_id == trip_id)
    )
    expenses = list(res_e.scalars().all())

    res_t = await u_ctx.session.execute(
        select(TripTicketModel).where(TripTicketModel.trip_id == trip_id)
    )
    tickets = list(res_t.scalars().all())

    res_c = await u_ctx.session.execute(
        select(TripCollectionModel).where(TripCollectionModel.trip_id == trip_id)
    )
    collections = list(res_c.scalars().all())

    packager = TripPackager(
        trip=trip,
        participants=participants,
        expenses=expenses,
        tickets=tickets,
        collections=collections,
        export_profile=profile,
    )
    pkg_path = packager.create_package()
    size_bytes = pkg_path.stat().st_size

    await log_agent_action(
        session=u_ctx.session,
        tool="export_trip_package",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "profile": profile},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Trip package exported successfully ({profile}, {size_bytes} bytes)",
        data={
            "package_path": str(pkg_path),
            "filename": pkg_path.name,
            "size_bytes": size_bytes,
            "profile": profile,
        },
    )
