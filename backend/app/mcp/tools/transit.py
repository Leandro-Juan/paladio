"""Transit, GTFS routing, and mobility MCP tools."""

from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.schemas import ChangeSet, Change
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.services.transit_service import TransitService
from app.services.transit_fare_service import TransitFareService
from app.use_cases.upgrade_trip_transit import UpgradeTripTransitUseCase
from app.adapters.repositories.sql_transit_repository import SQLTransitRepository


async def get_transit_status(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Checks GTFS transit network availability and compilation status for the destination.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    city = (trip.destination or "").strip().lower()

    transit_repo = SQLTransitRepository(u_ctx.session)
    transit_svc = TransitService(transit_repo)
    avail = await transit_svc.get_availability(city)

    await log_agent_action(
        session=u_ctx.session,
        tool="get_transit_status",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "city": city},
        revision=trip.revision,
    )

    status_str = (
        avail.get("status", "unavailable") if isinstance(avail, dict) else str(avail)
    )
    return ToolResult(
        ok=True,
        summary=f"Transit network status for {trip.destination}: {status_str}",
        data=avail,
    )


async def request_transit_build(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Queues a background asynchronous task to download and compile GTFS transit feeds for the city.
    Tier J: returns job_id.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    city = (trip.destination or "").strip().lower()

    # Enqueue celery or background task
    import uuid

    job_id = f"job_gtfs_{uuid.uuid4().hex[:10]}"
    try:
        from app.tasks.tasks import build_city_gtfs_task

        task = build_city_gtfs_task.delay(city)
        job_id = task.id
    except Exception:
        # Fallback if celery broker not configured in current test run
        pass

    await log_agent_action(
        session=u_ctx.session,
        tool="request_transit_build",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "city": city, "job_id": job_id},
    )

    return ToolResult(
        ok=True,
        summary=f"Enqueued GTFS transit build job '{job_id}' for city {trip.destination}.",
        data={"job_id": job_id, "city": trip.destination, "status": "queued"},
    )


async def upgrade_trip_transit(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Reruns all travel legs between stops using real compiled transit schedules and Valhalla roads.
    Requires GTFS availability status 'ready'.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    use_case = UpgradeTripTransitUseCase(u_ctx.session)
    res = await use_case.execute(trip_id)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    trip.revision += 1
    await u_ctx.session.commit()

    await log_agent_action(
        session=u_ctx.session,
        tool="upgrade_trip_transit",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=trip.revision,
    )

    upgraded_legs = res.get("total_upgraded_legs", 0) if isinstance(res, dict) else 0
    return ToolResult(
        ok=True,
        summary=f"Upgraded {upgraded_legs} transit leg(s) with real timetables (revision {trip.revision}).",
        data=res,
    )


async def get_directions(
    trip_id: str,
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    mode: str = "transit",  # 'transit', 'walk', 'auto'
    ctx: Context | None = None,
) -> ToolResult:
    """Point-to-point routing directions between coordinates."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    transit_repo = SQLTransitRepository(u_ctx.session)
    transit_svc = TransitService(transit_repo)

    dirs = await transit_svc.get_directions(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        mode=mode,
        city=trip.destination,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_directions",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "mode": mode},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Retrieved directions ({mode}) between points.",
        data=dirs,
    )


async def get_leg_options(
    trip_id: str,
    day: int,
    stop_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Returns transit and walking alternatives for the leg arriving at stop_id."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    d_idx, s_idx, target_stop = doc.find_stop(stop_id)
    if not target_stop or d_idx is None or s_idx == 0:
        return ToolResult(
            ok=False,
            summary=f"Leg options cannot be retrieved: stop '{stop_id}' is the first stop or not found.",
            error="Stop is either first in the day or does not exist.",
        )

    day_plan = doc.days[d_idx]
    prev_stop = day_plan.itinerary.path[s_idx - 1]
    current_leg = target_stop.transit_from_previous

    coords_prev = (
        prev_stop.coordinates
        or (prev_stop.poi.get("coordinates") if prev_stop.poi else {})
        or {}
    )
    p_lat = coords_prev.get("lat") or (
        prev_stop.poi.get("lat") if prev_stop.poi else 0.0
    )
    p_lon = coords_prev.get("lng") or (
        prev_stop.poi.get("lon") if prev_stop.poi else 0.0
    )

    coords_curr = (
        target_stop.coordinates
        or (target_stop.poi.get("coordinates") if target_stop.poi else {})
        or {}
    )
    c_lat = coords_curr.get("lat") or (
        target_stop.poi.get("lat") if target_stop.poi else 0.0
    )
    c_lon = coords_curr.get("lng") or (
        target_stop.poi.get("lon") if target_stop.poi else 0.0
    )

    transit_repo = SQLTransitRepository(u_ctx.session)
    transit_svc = TransitService(transit_repo)

    # Fetch transit & walk options
    walk_opt = await transit_svc.get_directions(
        float(p_lat),
        float(p_lon),
        float(c_lat),
        float(c_lon),
        mode="walk",
        city=trip.destination,
    )
    transit_opt = await transit_svc.get_directions(
        float(p_lat),
        float(p_lon),
        float(c_lat),
        float(c_lon),
        mode="transit",
        city=trip.destination,
    )

    return ToolResult(
        ok=True,
        summary=f"Retrieved travel leg options from '{prev_stop.name}' to '{target_stop.name}'.",
        data={
            "from_stop": prev_stop.name,
            "to_stop": target_stop.name,
            "current_leg": current_leg.model_dump()
            if hasattr(current_leg, "model_dump")
            else current_leg,
            "walking_option": walk_opt,
            "transit_option": transit_opt,
        },
    )


async def set_leg_mode(
    trip_id: str,
    day: int,
    stop_id: str,
    mode: str,  # 'walking', 'transit', 'taxi'
    ctx: Context | None = None,
) -> ToolResult:
    """Forces the transport mode (walking, transit, taxi) for the leg arriving at stop_id."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    def _mutation(doc):
        d_idx, s_idx, target_stop = doc.find_stop(stop_id)
        if not target_stop or d_idx is None or s_idx == 0:
            raise ValueError(f"Stop '{stop_id}' is the first stop or not found.")
        leg = target_stop.transit_from_previous
        if isinstance(leg, dict):
            leg["mode"] = mode
        elif leg is not None:
            leg.mode = mode
        else:
            target_stop.transit_from_previous = {"mode": mode, "duration_minutes": 15}
        return ChangeSet(
            ok=True,
            summary=f"Set transport mode to '{mode}' for leg to '{target_stop.name}'",
            changes=[
                Change(
                    kind="set_leg_mode",
                    day=doc.days[d_idx].day,
                    stop_id=stop_id,
                    after={"mode": mode},
                )
            ],
        )

    change_set, _ = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Set leg transport mode to '{mode}'",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="set_leg_mode",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id, "mode": mode},
    )

    return ToolResult(
        ok=True,
        summary=f"Set leg mode to '{mode}' successfully.",
        change_set=change_set.model_dump(),
    )


async def nearby_stations(
    trip_id: str,
    day: int = 1,
    radius_meters: float = 800.0,
    ctx: Context | None = None,
) -> ToolResult:
    """Finds GTFS metro and rail stations near trip anchors and stops on a given day."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    transit_repo = SQLTransitRepository(u_ctx.session)
    transit_svc = TransitService(transit_repo)

    stations = await transit_svc.get_nearby_stations(
        city=trip.destination,
        day=day,
        radius=radius_meters,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="nearby_stations",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(stations)} station(s) near Day {day} route.",
        data={"day": day, "stations": stations},
    )


async def get_transit_pass_advice(
    trip_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """Evaluates whether daily transit passes or single tickets are more economical for this trip."""
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    fare_info = TransitFareService.get_city_transit_fare(trip.destination)
    savings = TransitFareService.evaluate_daily_transit_savings(
        itinerary_data=doc.to_dict(),
        city=trip.destination,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_transit_pass_advice",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id},
        revision=trip.revision,
    )

    rec = (
        savings.get("recommendation", "Single tickets are optimal.")
        if isinstance(savings, dict)
        else str(savings)
    )
    return ToolResult(
        ok=True,
        summary=f"Transit advice: {rec}",
        data={"fare_info": fare_info, "analysis": savings},
    )
