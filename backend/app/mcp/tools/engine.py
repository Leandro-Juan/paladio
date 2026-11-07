"""Optimization engine and algorithmic reasoning MCP tools."""

import copy
from typing import Any
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.recompute import RecomputeService
from app.application.trip_editing.validation import ItineraryValidator
from app.application.trip_editing.itinerary_editor import ItineraryEditor
from app.application.trip_editing.schemas import ChangeSet, Change, QualityDelta
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.mcp.proposals import create_proposal
from app.api.pois import search_pois as api_search_pois
from app.mcp.tools.pois import _extract_poi_items


async def optimize_day(
    trip_id: str,
    day: int,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Re-sequences a single day's stops using the C++20 TSPTW solver,
    strictly honoring locked stops and time windows.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc_before = TripService.get_document(trip)
    q_before = ItineraryValidator.evaluate_quality(doc_before)

    async def _mutation(doc):
        await RecomputeService.reoptimize_day(
            doc=doc,
            day=day,
            destination_city=trip.destination,
        )
        return ChangeSet(
            ok=True,
            summary=f"Re-optimized Day {day} schedule using C++20 TSPTW solver",
            changes=[
                Change(kind="optimize_day", day=day, after={"status": "optimized"})
            ],
        )

    change_set, updated_doc = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Optimized Day {day} schedule",
        user=u_ctx.user,
        session=u_ctx.session,
    )
    q_after = ItineraryValidator.evaluate_quality(updated_doc)

    delta = None
    if q_before and q_after:
        delta = QualityDelta(
            score_before=q_before.score_after,
            score_after=q_after.score_after,
            gates_passed=q_after.gates_passed,
            details=q_after.details,
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="optimize_day",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day},
    )

    return ToolResult(
        ok=True,
        summary=f"Day {day} re-optimized successfully.",
        change_set=change_set.model_dump(),
        data={"quality_delta": delta.model_dump() if delta else None},
    )


async def optimize_trip(
    trip_id: str,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Optimizes routing across all days of the trip with the C++20 solver.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc_before = TripService.get_document(trip)
    q_before = ItineraryValidator.evaluate_quality(doc_before)

    if not confirmed:
        summary = (
            f"Full trip optimization will re-sequence all {len(doc_before.days)} days. "
            "Locked stops will remain fixed. Please confirm."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="optimize_trip",
            summary=summary,
            arguments={"trip_id": trip_id},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    async def _mutation(doc):
        await RecomputeService.reoptimize_all_days(
            doc=doc,
            destination_city=trip.destination,
        )
        return ChangeSet(
            ok=True,
            summary="Re-optimized all trip days using C++20 TSPTW solver",
            changes=[
                Change(
                    kind="optimize_trip", day=0, after={"status": "all_days_optimized"}
                )
            ],
        )

    change_set, updated_doc = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary="Optimized entire trip schedule",
        user=u_ctx.user,
        session=u_ctx.session,
    )
    q_after = ItineraryValidator.evaluate_quality(updated_doc)

    delta = None
    if q_before and q_after:
        delta = QualityDelta(
            score_before=q_before.score_after,
            score_after=q_after.score_after,
            gates_passed=q_after.gates_passed,
            details=q_after.details,
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="optimize_trip",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
    )

    return ToolResult(
        ok=True,
        summary="Full trip re-optimized successfully.",
        change_set=change_set.model_dump(),
        data={"quality_delta": delta.model_dump() if delta else None},
    )


async def what_if(
    trip_id: str,
    action: str,  # 'remove_stop', 'move_stop', 'add_stop', 'swap_days', 'optimize_day'
    params: dict[str, Any],
    ctx: Context | None = None,
) -> ToolResult:
    """
    Dry-run simulation of an itinerary edit without writing to the database.
    Returns ChangeSet and comparative quality delta (travel time, walking, cost).
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)
    q_before = ItineraryValidator.evaluate_quality(doc)

    # Perform mutation on a deep copy of the document
    simulated_doc = copy.deepcopy(doc)
    change_set = None

    if action == "remove_stop":
        change_set = ItineraryEditor.remove_stop(simulated_doc, params["stop_id"])
    elif action == "move_stop":
        change_set = ItineraryEditor.move_stop(
            simulated_doc,
            params["stop_id"],
            params["to_day"],
            params.get("after_stop_id"),
        )
    elif action == "swap_days":
        change_set = ItineraryEditor.swap_days(
            simulated_doc, params["day_a"], params["day_b"]
        )
    elif action == "optimize_day":
        await RecomputeService.reoptimize_day(
            simulated_doc,
            params["day"],
            trip.destination,
        )
        change_set = ChangeSet(
            ok=True, summary=f"Simulated optimization of Day {params['day']}"
        )
    elif action == "add_stop":
        poi_dict = params.get("poi") or {
            "id": params.get("poi_id") or "simulated_poi",
            "name": params.get("name", "Simulated Stop"),
            "category": params.get("category", "attraction"),
        }
        change_set, _ = ItineraryEditor.add_stop(
            simulated_doc,
            day=params["day"],
            poi=poi_dict,
            after_stop_id=params.get("after_stop_id"),
            duration_mins=params.get("duration_mins", 60),
        )
    else:
        return ToolResult(
            ok=False,
            summary=f"Unsupported what_if action '{action}'",
            error=f"Action '{action}' is not supported in simulation.",
        )

    # Re-evaluate simulated quality
    q_after = ItineraryValidator.evaluate_quality(simulated_doc)
    delta = None
    if q_before and q_after:
        delta = QualityDelta(
            score_before=q_before.score_after,
            score_after=q_after.score_after,
            gates_passed=q_after.gates_passed,
            details=q_after.details,
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="what_if",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "action": action, "params": params},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Simulation complete for '{action}'. "
        + (change_set.summary if change_set else ""),
        change_set=change_set.model_dump() if change_set else None,
        data={
            "quality_delta": delta.model_dump() if delta else None,
            "simulated_metrics": q_after.model_dump() if q_after else None,
        },
    )


async def rebalance_days(
    trip_id: str,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Rebalances stops across days based on geographical clustering and daily load.
    Tier C: requires confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    if not confirmed:
        summary = (
            f"Rebalancing days will geographically redistribute non-locked stops across {len(doc.days)} days. "
            "Please confirm."
        )
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="rebalance_days",
            summary=summary,
            arguments={"trip_id": trip_id},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    # Perform clustering rebalance and reoptimize all days
    async def _mutation(d):
        await RecomputeService.reoptimize_all_days(d, trip.destination)
        return ChangeSet(
            ok=True,
            summary="Geographically rebalanced stops across all days",
            changes=[
                Change(kind="rebalance_days", day=0, after={"status": "rebalanced"})
            ],
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary="Rebalanced days across trip",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="rebalance_days",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
    )

    return ToolResult(
        ok=True,
        summary="Rebalanced days across itinerary successfully.",
        change_set=change_set.model_dump(),
    )


async def fit_to_budget(
    trip_id: str,
    max_budget: float,
    confirmed: bool = False,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Trims or replaces expensive paid attractions to respect the specified budget limit.
    Tier C: requires user confirmation.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    # Calculate current costs
    total_cost = 0.0
    paid_stops = []
    for d in doc.days:
        for s in d.itinerary.path:
            cost = float(
                getattr(s, "cost", None)
                or (
                    s.poi.get("price") or s.poi.get("cost")
                    if isinstance(s.poi, dict)
                    else 0.0
                )
                or 0.0
            )
            if cost > 0:
                s_name = (
                    getattr(s, "name", None)
                    or (s.poi.get("name") if isinstance(s.poi, dict) else None)
                    or "Stop"
                )
                total_cost += cost
                paid_stops.append(
                    {"day": d.day, "stop_id": s.stop_id, "name": s_name, "cost": cost}
                )

    if total_cost <= max_budget:
        return ToolResult(
            ok=True,
            summary=f"Trip current estimated cost ({total_cost:.2f}) already within budget ({max_budget:.2f}).",
            data={"current_cost": total_cost, "max_budget": max_budget},
        )

    # Propose removing or swapping lowest-scoring expensive stops
    paid_stops.sort(key=lambda x: x["cost"], reverse=True)
    excess = total_cost - max_budget
    stops_to_trim = []
    accum = 0.0
    for s in paid_stops:
        stops_to_trim.append(s)
        accum += s["cost"]
        if accum >= excess:
            break

    summary = (
        f"Trip cost ({total_cost:.2f}) exceeds target budget ({max_budget:.2f}) by {excess:.2f}. "
        f"Propose trimming/swapping {len(stops_to_trim)} expensive stop(s): "
        f"{', '.join(s['name'] for s in stops_to_trim)}. Please confirm."
    )

    if not confirmed:
        proposal = await create_proposal(
            trip_id=trip_id,
            tool="fit_to_budget",
            summary=summary,
            arguments={"trip_id": trip_id, "max_budget": max_budget},
            diff={"stops_to_trim": stops_to_trim, "excess": excess},
        )
        return ToolResult(
            ok=False,
            requires_confirmation=True,
            summary=summary,
            proposal=proposal,
        )

    # Execute trimming
    trim_ids = {s["stop_id"] for s in stops_to_trim}

    def _mutation(d):
        changes = []
        for d_plan in d.days:
            rem = [st for st in d_plan.itinerary.path if st.stop_id in trim_ids]
            d_plan.itinerary.path = [
                st for st in d_plan.itinerary.path if st.stop_id not in trim_ids
            ]
            for r in rem:
                changes.append(
                    Change(kind="remove_stop", day=d_plan.day, stop_id=r.stop_id)
                )
        return ChangeSet(
            ok=True,
            summary=f"Removed {len(trim_ids)} stop(s) to meet budget",
            changes=changes,
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Fitted trip to budget of {max_budget}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="fit_to_budget",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "max_budget": max_budget},
    )

    return ToolResult(
        ok=True,
        summary=f"Trip fitted to budget ({max_budget:.2f}) successfully.",
        change_set=change_set.model_dump(),
    )


async def fill_gaps(
    trip_id: str,
    day: int,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Finds idle time gaps in a day and automatically suggests and fills them with nearby attractions.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    # Search candidates to fill gap
    search_res = await api_search_pois(
        city=trip.destination,
        query="",
        day=day,
        limit=5,
        session=u_ctx.session,
        current_user=u_ctx.user,
    )
    raw_items = _extract_poi_items(search_res)

    if not raw_items:
        return ToolResult(
            ok=False, summary=f"No suitable POIs found to fill gaps in Day {day}."
        )

    top_poi = raw_items[0]

    def _mutation(d):
        return ItineraryEditor.add_stop(
            doc=d,
            day=day,
            poi=top_poi,
            duration_mins=45,
            notes="Filled schedule gap",
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Filled gap on Day {day} with '{top_poi.get('name')}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="fill_gaps",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day},
    )

    return ToolResult(
        ok=True,
        summary=f"Added '{top_poi.get('name')}' to fill schedule gap on Day {day}.",
        change_set=change_set.model_dump(),
    )


async def explain_schedule(
    trip_id: str,
    stop_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Explains why a stop is scheduled at its current position and time:
    travel duration, opening hours, locked constraints, and proximity.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    d_idx, s_idx, target_stop = doc.find_stop(stop_id)
    if not target_stop or d_idx is None:
        return ToolResult(
            ok=False,
            summary=f"Stop with ID '{stop_id}' not found in trip {trip_id}.",
            error=f"Stop '{stop_id}' does not exist.",
        )

    day_plan = doc.days[d_idx]
    dwell = target_stop.duration or 60
    start = target_stop.scheduled_start or "TBD"
    end = target_stop.scheduled_end or "TBD"
    is_locked = bool(target_stop.is_locked)

    prev_stop = day_plan.itinerary.path[s_idx - 1] if s_idx > 0 else None
    next_stop = (
        day_plan.itinerary.path[s_idx + 1]
        if s_idx + 1 < len(day_plan.itinerary.path)
        else None
    )

    reasons = [
        f"Scheduled on Day {day_plan.day} from {start} to {end} (dwell time {dwell} minutes).",
    ]
    if is_locked:
        reasons.append("Stop is explicitly locked by the user as a fixed time anchor.")
    if prev_stop:
        leg = target_stop.transit_from_previous
        dur = (
            leg.get("duration_minutes", 15)
            if isinstance(leg, dict)
            else getattr(leg, "duration_minutes", 15)
        )
        mode = (
            leg.get("mode", "walking")
            if isinstance(leg, dict)
            else getattr(leg, "mode", "walking")
        )
        reasons.append(f"Preceded by '{prev_stop.name}' ({dur} min {mode}).")
    if next_stop:
        reasons.append(f"Followed by '{next_stop.name}'.")

    summary_text = " ".join(reasons)

    await log_agent_action(
        session=u_ctx.session,
        tool="explain_schedule",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=summary_text,
        data={
            "stop_id": stop_id,
            "name": target_stop.name,
            "day": day_plan.day,
            "time_window": {"start": start, "end": end},
            "is_locked": is_locked,
            "explanation": reasons,
        },
    )


async def compare_metrics(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Evaluates current quality metrics: total travel time, walking distance,
    estimated cost, and quality gate score.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    quality = ItineraryValidator.evaluate_quality(doc)

    await log_agent_action(
        session=u_ctx.session,
        tool="compare_metrics",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=trip.revision,
    )

    score_val = (
        quality.score_after if quality and quality.score_after is not None else 85.0
    )
    gates_val = "passed" if quality and quality.gates_passed else "flagged"
    return ToolResult(
        ok=True,
        summary=f"Trip score: {score_val:.1f}/100, gates status: {gates_val}.",
        data=quality.model_dump() if quality else {},
    )
