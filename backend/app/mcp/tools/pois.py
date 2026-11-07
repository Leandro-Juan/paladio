"""POIs, places, and discovery MCP tools."""

import math
import uuid
from typing import Any
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.itinerary_editor import ItineraryEditor
from app.mcp.context import get_user_context
from app.mcp.audit import log_agent_action
from app.mcp.schemas import ToolResult
from app.api.pois import (
    search_pois as api_search_pois,
    get_poi_details as api_get_poi_details,
    PoiSearchResponse,
)
from app.api.locations import search_places as api_search_places


def _extract_poi_items(results: Any) -> list[dict[str, Any]]:
    """Safely unpacks PoiSearchResponse or dict into a list of normalized POI dicts."""
    raw_list: list[Any] = []
    if isinstance(results, PoiSearchResponse):
        if results.exact_match:
            raw_list.append(results.exact_match)
        raw_list.extend(results.results or [])
    elif isinstance(results, dict):
        raw = results.get("results") or results.get("items") or []
        raw_list = list(raw)
    elif isinstance(results, list):
        raw_list = results
    elif hasattr(results, "results"):
        exact = getattr(results, "exact_match", None)
        if exact:
            raw_list.append(exact)
        raw_list.extend(getattr(results, "results", []) or [])

    items: list[dict[str, Any]] = []
    for it in raw_list:
        if isinstance(it, dict):
            poi_id = it.get("poi_id") or it.get("id")
            name = it.get("name")
            category = it.get("category")
            lat = it.get("lat") or (it.get("coordinates", {}).get("lat"))
            lng = (
                it.get("lng") or it.get("lon") or (it.get("coordinates", {}).get("lng"))
            )
            price = it.get("cost_eur") or it.get("price") or 0.0
            score = it.get("score") or it.get("similarity") or 0.0
            photo_url = it.get("photo_url") or it.get("thumbnail_url")
            desc = it.get("description")
            neigh = it.get("neighborhood")
            dur = it.get("duration_mins", 60)
            hours = it.get("opening_hours")
            rating = it.get("rating")
        else:
            poi_id = getattr(it, "id", None) or getattr(it, "poi_id", None)
            name = getattr(it, "name", None)
            category = getattr(it, "category", None)
            lat = getattr(it, "lat", None)
            lng = getattr(it, "lng", None)
            price = getattr(it, "cost_eur", 0.0)
            score = getattr(it, "similarity", 0.0) or getattr(it, "score", 0.0)
            photo_url = getattr(it, "photo_url", None) or getattr(
                it, "thumbnail_url", None
            )
            desc = getattr(it, "description", None)
            neigh = getattr(it, "neighborhood", None)
            dur = getattr(it, "duration_mins", 60)
            hours = getattr(it, "opening_hours", None)
            rating = getattr(it, "rating", None)

        if not poi_id or not name:
            continue

        items.append(
            {
                "poi_id": str(poi_id),
                "id": str(poi_id),
                "name": str(name),
                "category": str(category or "attraction"),
                "coordinates": {
                    "lat": float(lat) if lat is not None else 0.0,
                    "lng": float(lng) if lng is not None else 0.0,
                },
                "lat": float(lat) if lat is not None else 0.0,
                "lng": float(lng) if lng is not None else 0.0,
                "price": float(price or 0.0),
                "duration_mins": int(dur or 60),
                "score": float(score or 0.0),
                "rating": float(rating) if rating is not None else None,
                "photo_url": photo_url,
                "description": desc,
                "neighborhood": neigh,
                "opening_hours": hours,
            }
        )
    return items


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance in meters between two lat/lon coordinates."""
    r = 6371000.0  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


async def search_pois(
    trip_id: str,
    query: str = "",
    category: str | None = None,
    day: int | None = None,
    limit: int = 15,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Searches POIs in the trip destination using hybrid semantic and category retrieval.
    Caps results to 50 max.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    clean_limit = min(max(1, limit), 50)

    results = await api_search_pois(
        city=trip.destination,
        query=query,
        category=category,
        trip_id=trip_id,
        day=day,
        limit=clean_limit,
        offset=0,
        session=u_ctx.session,
        current_user=u_ctx.user,
    )

    # Format items
    items = _extract_poi_items(results)

    await log_agent_action(
        session=u_ctx.session,
        tool="search_pois",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={
            "trip_id": trip_id,
            "query": query,
            "category": category,
            "limit": clean_limit,
        },
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(items)} POI(s) in {trip.destination} matching query='{query}'",
        data={"total": len(items), "city": trip.destination, "pois": items},
    )


async def get_poi_details(
    trip_id: str,
    poi_id: str,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Retrieves complete details for a POI: verified opening hours, price provenance,
    photos, and descriptions.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)

    try:
        details = await api_get_poi_details(
            poi_id=poi_id,
            city=trip.destination,
            session=u_ctx.session,
        )
        data = details.model_dump() if hasattr(details, "model_dump") else details
    except Exception as exc:
        return ToolResult(
            ok=False,
            summary=f"Failed to fetch details for POI '{poi_id}'",
            error=str(exc),
        )

    await log_agent_action(
        session=u_ctx.session,
        tool="get_poi_details",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "poi_id": poi_id},
        revision=trip.revision,
    )

    poi_name = data.get("name") or poi_id
    return ToolResult(
        ok=True,
        summary=f"Retrieved POI details for '{poi_name}'",
        data=data,
    )


async def search_places(
    trip_id: str,
    query: str,
    limit: int = 10,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Geocoding and place search for non-catalog places, transit stations, and addresses.
    Biased towards trip destination.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    clean_limit = min(max(1, limit), 25)

    places = await api_search_places(
        q=query,
        city=trip.destination,
        limit=clean_limit,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="search_places",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "query": query, "limit": clean_limit},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(places)} place(s) matching '{query}'",
        data={"query": query, "city": trip.destination, "places": places},
    )


async def find_nearby(
    trip_id: str,
    stop_id: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_meters: int = 1000,
    category: str | None = None,
    limit: int = 15,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Finds attractions, food, or stations within radius_meters of a stop or coordinate.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    center_lat = lat
    center_lon = lon

    if stop_id:
        for d in doc.days:
            for s in d.itinerary.path:
                if s.stop_id == stop_id:
                    coords = (
                        getattr(s, "coordinates", None)
                        or (
                            s.poi.get("coordinates")
                            if isinstance(s.poi, dict)
                            else None
                        )
                        or {}
                    )
                    center_lat = coords.get("lat") or (
                        s.poi.get("lat") if isinstance(s.poi, dict) else None
                    )
                    center_lon = (
                        coords.get("lng")
                        or coords.get("lon")
                        or (s.poi.get("lon") if isinstance(s.poi, dict) else None)
                    )
                    break
            if center_lat is not None:
                break

    if center_lat is None or center_lon is None:
        return ToolResult(
            ok=False,
            summary="Could not determine center coordinates from stop_id or lat/lon",
            error="Center coordinates required. Provide valid lat/lon or existing stop_id.",
        )

    # Query candidate POIs in bounding box or city
    clean_limit = min(max(1, limit), 50)
    # Search nearby with category filter
    search_res = await api_search_pois(
        city=trip.destination,
        query="",
        category=category,
        trip_id=trip_id,
        limit=50,
        offset=0,
        session=u_ctx.session,
        current_user=u_ctx.user,
    )
    raw_items = _extract_poi_items(search_res)

    nearby_items = []
    for item in raw_items:
        i_lat = item.get("lat")
        i_lon = item.get("lng")
        if i_lat is None or i_lon is None:
            continue
        dist = _haversine_distance(center_lat, center_lon, float(i_lat), float(i_lon))
        if dist <= radius_meters:
            item_copy = dict(item)
            item_copy["distance_meters"] = round(dist, 1)
            nearby_items.append(item_copy)

    nearby_items.sort(key=lambda x: x["distance_meters"])
    selected = nearby_items[:clean_limit]

    await log_agent_action(
        session=u_ctx.session,
        tool="find_nearby",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "stop_id": stop_id, "radius_meters": radius_meters},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(selected)} item(s) within {radius_meters}m",
        data={"center": {"lat": center_lat, "lon": center_lon}, "nearby": selected},
    )


async def suggest_additions(
    trip_id: str,
    day: int,
    category: str | None = None,
    limit: int = 5,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Suggests high-value POI additions for a specific day by analyzing current schedule
    and user preferences.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.READ)

    trip = await TripService.get_trip(trip_id, u_ctx.user, u_ctx.session)
    doc = TripService.get_document(trip)

    # Collect already visited POI IDs in this trip
    visited_poi_ids = set()
    for d in doc.days:
        for s in d.itinerary.path:
            p_id = getattr(s, "poi_id", None) or (
                s.poi.get("id") or s.poi.get("poi_id")
                if isinstance(s.poi, dict)
                else None
            )
            if p_id:
                visited_poi_ids.add(p_id)

    # Search POIs for this day's area
    search_res = await api_search_pois(
        city=trip.destination,
        query="",
        category=category,
        trip_id=trip_id,
        day=day,
        limit=30,
        session=u_ctx.session,
        current_user=u_ctx.user,
    )
    raw_items = _extract_poi_items(search_res)

    candidates = [item for item in raw_items if item.get("id") not in visited_poi_ids]

    selected = candidates[: min(max(1, limit), 20)]

    await log_agent_action(
        session=u_ctx.session,
        tool="suggest_additions",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day, "category": category},
        revision=trip.revision,
    )

    return ToolResult(
        ok=True,
        summary=f"Found {len(selected)} suggestion(s) for Day {day}",
        data={"day": day, "suggestions": selected},
    )


async def create_custom_stop(
    trip_id: str,
    day: int,
    name: str,
    lat: float,
    lon: float,
    duration_mins: int = 60,
    cost: float = 0.0,
    category: str = "custom",
    notes: str | None = None,
    after_stop_id: str | None = None,
    ctx: Context | None = None,
) -> ToolResult:
    """
    Creates a trip-scoped custom stop (e.g. user-specific cafe or meeting point).
    Strictly isolated to this trip - NEVER mutates the global catalog.
    """
    u_ctx = await get_user_context(ctx)
    await u_ctx.check_access(trip_id, TripAccessLevel.EDIT)

    custom_poi = {
        "id": f"custom_{uuid.uuid4().hex[:8]}",
        "name": name,
        "lat": lat,
        "lon": lon,
        "coordinates": {"lat": lat, "lng": lon},
        "cost": cost,
        "category": category,
        "custom_stop": True,
    }

    def _mutation(doc):
        return ItineraryEditor.add_stop(
            doc=doc,
            day=day,
            poi=custom_poi,
            after_stop_id=after_stop_id,
            duration_mins=duration_mins,
            custom_stop=True,
            notes=notes,
        )

    change_set, updated_doc = await TripService.apply_mutation(
        trip_id=trip_id,
        mutation_fn=_mutation,
        summary=f"Created custom stop '{name}' on Day {day}",
        user=u_ctx.user,
        session=u_ctx.session,
    )

    await log_agent_action(
        session=u_ctx.session,
        tool="create_custom_stop",
        outcome="success",
        user_id=u_ctx.user.id if u_ctx.user else None,
        trip_id=trip_id,
        args={"trip_id": trip_id, "day": day, "name": name, "lat": lat, "lon": lon},
    )

    return ToolResult(
        ok=True,
        summary=f"Custom stop '{name}' created on Day {day}",
        change_set=change_set.model_dump(),
    )
