import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel, Field

from app.adapters.repositories.sql_transit_repository import SQLTransitRepository
from app.api.deps import get_optional_user
from app.db.models import TripModel, UserModel
from app.db.session import get_db
from app.services.transit_service import (
    TransitService,
    calculate_point_to_point_directions,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class DirectionsLocation(BaseModel):
    name: str = "Location"
    lat: float
    lon: float


class TransitDirectionsRequest(BaseModel):
    origin: DirectionsLocation
    destination: DirectionsLocation
    date_time: str | None = None
    date_time_type: int = Field(1, description="1 for Depart At, 2 for Arrive By")
    city: str | None = None


def get_transit_service(session: AsyncSession = Depends(get_db)) -> TransitService:
    repo = SQLTransitRepository(session)
    return TransitService(repo)


async def _get_authorized_trip(
    trip_id: str,
    current_user: UserModel | None,
    session: AsyncSession,
) -> TripModel:
    stmt = select(TripModel).where(TripModel.id == trip_id)
    res = await session.execute(stmt)
    trip = res.scalar_one_or_none()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.get("/trips/{trip_id}/transit/availability")
async def get_trip_transit_availability(
    trip_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    trip = await _get_authorized_trip(trip_id, current_user, session)
    city = (trip.destination or "").strip().lower()
    if not city:
        raise HTTPException(status_code=400, detail="Trip has no destination city")
    return await transit_svc.get_availability(city)


@router.get("/trips/{trip_id}/transit/nearby")
async def get_trip_transit_nearby(
    trip_id: str,
    day: int = Query(0, ge=0, description="0-indexed day of the itinerary"),
    radius: float = Query(
        800.0, ge=100.0, le=10000.0, description="Search radius in meters"
    ),
    center_lat: float | None = Query(
        None, description="Optional center latitude for custom circle search"
    ),
    center_lng: float | None = Query(
        None, description="Optional center longitude for custom circle search"
    ),
    modes: str | None = Query(
        None, description="Comma-separated modes e.g. 'metro,rail'"
    ),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    trip = await _get_authorized_trip(trip_id, current_user, session)
    city = (trip.destination or "").strip().lower()
    if not city:
        raise HTTPException(status_code=400, detail="Trip has no destination city")

    anchors: list[dict[str, Any]] = []

    if center_lat is not None and center_lng is not None:
        anchors.append(
            {
                "id": "waypoint",
                "name": "Waypoint Area",
                "type": "waypoint",
                "lat": float(center_lat),
                "lon": float(center_lng),
            }
        )
    else:
        # Extract anchors from trip: Lodging + Day itinerary stops
        # 1. Lodging anchor (from itinerary_data.get('lodging') or hotel)
        itin = trip.itinerary_data or {}
        lodging = itin.get("lodging") or itin.get("hotel") or {}
        if (
            isinstance(lodging, dict)
            and (lodging.get("latitude") or lodging.get("lat"))
            and (lodging.get("longitude") or lodging.get("lon"))
        ):
            lat_val = lodging.get("latitude") or lodging.get("lat")
            lon_val = lodging.get("longitude") or lodging.get("lon")
            anchors.append(
                {
                    "id": "lodging",
                    "name": lodging.get("name") or "Your Hotel",
                    "type": "lodging",
                    "lat": float(lat_val),
                    "lon": float(lon_val),
                }
            )

        # 2. Day itinerary stops
        days = itin.get("days", [])
        if isinstance(days, list) and day < len(days):
            day_obj = days[day]
            day_itin = day_obj.get("itinerary", {})
            path = day_itin.get("path", [])
            for item in path:
                poi = item.get("poi") or {}
                loc = poi.get("location") or {}
                lat = (
                    loc.get("lat")
                    or loc.get("latitude")
                    or poi.get("lat")
                    or poi.get("latitude")
                )
                lon = (
                    loc.get("lon")
                    or loc.get("longitude")
                    or poi.get("lon")
                    or poi.get("longitude")
                )
                if lat is not None and lon is not None:
                    p_id = poi.get("id") or item.get("poi_id") or str(len(anchors))
                    p_name = poi.get("name") or item.get("name") or "Attraction"
                    anchors.append(
                        {
                            "id": str(p_id),
                            "name": p_name,
                            "type": "stop",
                            "lat": float(lat),
                            "lon": float(lon),
                        }
                    )

    mode_list = [m.strip() for m in modes.split(",") if m.strip()] if modes else None
    grouped_stations = await transit_svc.get_nearby_stations_for_anchors(
        city=city,
        anchors=anchors,
        radius_meters=radius,
        modes=mode_list,
    )

    avail = await transit_svc.get_availability(city)

    return {
        "city": city,
        "day": day,
        "availability": avail,
        "anchors_count": len(anchors),
        "grouped_stations": grouped_stations,
    }


@router.get("/trips/{trip_id}/transit/lines")
async def get_trip_transit_lines(
    trip_id: str,
    mode: str | None = Query(
        None, description="Optional filter by mode e.g. Metro, Rail"
    ),
    center_lat: float | None = Query(
        None, description="Optional center latitude for custom circle search"
    ),
    center_lng: float | None = Query(
        None, description="Optional center longitude for custom circle search"
    ),
    radius: float | None = Query(
        None, description="Optional radius in meters for circle search"
    ),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    trip = await _get_authorized_trip(trip_id, current_user, session)
    city = (trip.destination or "").strip().lower()
    lines = await transit_svc.get_lines(city, mode=mode)

    if center_lat is not None and center_lng is not None:
        nearby_res = await transit_svc.get_nearby_stations_for_anchors(
            city=city,
            anchors=[
                {
                    "id": "waypoint",
                    "name": "Waypoint Area",
                    "type": "waypoint",
                    "lat": float(center_lat),
                    "lon": float(center_lng),
                }
            ],
            radius_meters=radius or 800.0,
            modes=[mode] if mode else None,
        )
        active_line_ids: set[str] = set()
        for grp in nearby_res:
            for st in grp.get("stations", []):
                for l_chip in st.get("lines", []):
                    if l_chip.get("line_id"):
                        active_line_ids.add(str(l_chip["line_id"]).lower())
                    if l_chip.get("short_name"):
                        active_line_ids.add(str(l_chip["short_name"]).lower())
        lines = [
            line_item
            for line_item in lines
            if str(line_item.get("id", "")).lower() in active_line_ids
            or str(line_item.get("short_name", "")).lower() in active_line_ids
        ]

    avail = await transit_svc.get_availability(city)
    return {
        "city": city,
        "availability": avail,
        "lines": lines,
    }


@router.get("/trips/{trip_id}/transit/lines/{line_id}")
async def get_trip_transit_line_detail(
    trip_id: str,
    line_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    trip = await _get_authorized_trip(trip_id, current_user, session)
    city = (trip.destination or "").strip().lower()
    line_detail = await transit_svc.get_line_detail(city, line_id)
    if not line_detail:
        raise HTTPException(status_code=404, detail="Line not found")
    return line_detail


@router.get("/trips/{trip_id}/transit/stations/{station_id}")
async def get_trip_transit_station_detail(
    trip_id: str,
    station_id: str,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    trip = await _get_authorized_trip(trip_id, current_user, session)
    city = (trip.destination or "").strip().lower()
    station = await transit_svc.get_station_detail(city, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


@router.get("/trips/{trip_id}/transit/stations/{station_id}/departures")
async def get_trip_transit_station_departures(
    trip_id: str,
    station_id: str,
    date: str = Query(..., description="Date YYYY-MM-DD"),
    seconds: int = Query(..., ge=0, description="Seconds from midnight"),
    limit: int = Query(10, ge=1, le=50),
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
    transit_svc: TransitService = Depends(get_transit_service),
) -> list[dict[str, Any]]:
    trip = await _get_authorized_trip(trip_id, current_user, session)
    city = (trip.destination or "").strip().lower()
    return await transit_svc.get_station_departures(
        city=city,
        station_id=station_id,
        target_date=date,
        target_seconds=seconds,
        limit=limit,
    )


@router.get("/transit/{city}/map-stations")
async def get_city_map_stations(
    city: str,
    bbox: str = Query(..., description="min_lat,min_lon,max_lat,max_lon"),
    limit: int = Query(200, ge=1, le=500),
    transit_svc: TransitService = Depends(get_transit_service),
) -> list[dict[str, Any]]:
    try:
        parts = [float(x.strip()) for x in bbox.split(",")]
        if len(parts) != 4:
            raise ValueError()
        min_lat, min_lon, max_lat, max_lon = parts
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="bbox must be min_lat,min_lon,max_lat,max_lon formatted floats",
        )

    city_clean = city.strip().lower()
    return await transit_svc.get_map_stations(
        city=city_clean,
        min_lat=min_lat,
        min_lon=min_lon,
        max_lat=max_lat,
        max_lon=max_lon,
        limit=limit,
    )


@router.get("/transit/{city}/stations/{station_id}")
async def get_city_station_detail(
    city: str,
    station_id: str,
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    city_clean = city.strip().lower()
    station = await transit_svc.get_station_detail(city_clean, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


@router.get("/transit/{city}/stations/{station_id}/departures")
async def get_city_station_departures(
    city: str,
    station_id: str,
    date: str = Query(..., description="Date YYYY-MM-DD"),
    seconds: int = Query(..., ge=0, description="Seconds from midnight"),
    limit: int = Query(10, ge=1, le=50),
    transit_svc: TransitService = Depends(get_transit_service),
) -> list[dict[str, Any]]:
    city_clean = city.strip().lower()
    return await transit_svc.get_station_departures(
        city=city_clean,
        station_id=station_id,
        target_date=date,
        target_seconds=seconds,
        limit=limit,
    )


@router.get("/transit/{city}/lines/{line_id}")
async def get_city_line_detail(
    city: str,
    line_id: str,
    transit_svc: TransitService = Depends(get_transit_service),
) -> dict[str, Any]:
    city_clean = city.strip().lower()
    line_detail = await transit_svc.get_line_detail(city_clean, line_id)
    if not line_detail:
        raise HTTPException(status_code=404, detail="Line not found")
    return line_detail


@router.post("/trips/{trip_id}/transit/directions")
async def get_trip_transit_directions(
    trip_id: str,
    payload: TransitDirectionsRequest,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Computes multimodal public transit and walking directions between two locations
    for a given trip, enforcing realistic travel heuristics and dynamic fare computation.
    """
    trip = await _get_authorized_trip(trip_id, current_user, session)
    resolved_city = payload.city or trip.destination
    return await calculate_point_to_point_directions(
        origin={
            "name": payload.origin.name,
            "lat": payload.origin.lat,
            "lon": payload.origin.lon,
            "city": resolved_city,
        },
        destination={
            "name": payload.destination.name,
            "lat": payload.destination.lat,
            "lon": payload.destination.lon,
            "city": resolved_city,
        },
        departure_iso=payload.date_time,
        date_time_type=payload.date_time_type,
        city=resolved_city,
    )


@router.post("/transit/directions")
async def get_general_transit_directions(
    payload: TransitDirectionsRequest,
) -> dict[str, Any]:
    """
    General point-to-point transit and walking routing for any city.
    """
    resolved_city = payload.city or ""
    return await calculate_point_to_point_directions(
        origin={
            "name": payload.origin.name,
            "lat": payload.origin.lat,
            "lon": payload.origin.lon,
            "city": resolved_city,
        },
        destination={
            "name": payload.destination.name,
            "lat": payload.destination.lat,
            "lon": payload.destination.lon,
            "city": resolved_city,
        },
        departure_iso=payload.date_time,
        date_time_type=payload.date_time_type,
        city=resolved_city,
    )
