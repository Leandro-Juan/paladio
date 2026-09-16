import asyncio
import copy
import logging
import math
import os
from datetime import datetime, timezone

import httpx
from app.services.transit_fare_service import TransitFareService
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class PublicTransitCompilationError(RuntimeError):
    """Raised when public transit compilation fails in background worker."""


async def ensure_transit_ready(city_name: str, max_wait_secs: int = 5) -> bool:
    """
    Ensures that real public transit (GTFS + OSM) data is downloaded and compiled
    for the city in Valhalla. Blocks until READY on cache miss, adhering to the requirement
    that the graph ALWAYS uses real transit schedules when available.
    """
    if not city_name:
        return True

    city_clean = city_name.strip().lower()

    try:
        from app.db.models import TransitCacheModel, TransitCacheStatus
        from app.db.session import async_session
        from sqlalchemy import select
    except (ImportError, ModuleNotFoundError) as e:
        logger.warning(f"Database session unavailable for transit cache check: {e}")
        return True

    start_time = asyncio.get_event_loop().time()
    triggered = False

    while asyncio.get_event_loop().time() - start_time < max_wait_secs:
        try:
            async with async_session() as session:
                stmt = select(TransitCacheModel).where(
                    TransitCacheModel.city == city_clean
                )
                res = await session.execute(stmt)
                cache_entry = res.scalar_one_or_none()

                now = datetime.now(timezone.utc)

                if not cache_entry:
                    if not triggered:
                        logger.info(
                            f"Transit cache MISS for '{city_name}'. Triggering background compile..."
                        )
                        from app.tasks import build_city_map_task

                        build_city_map_task.delay(city_clean)
                        triggered = True
                elif cache_entry.status == TransitCacheStatus.READY.value:
                    if (
                        cache_entry.valid_until
                        and cache_entry.valid_until < now
                        and not triggered
                    ):
                        logger.info(
                            f"Transit cache STALE for '{city_name}'. Triggering background SWR refresh."
                        )
                        from app.tasks import build_city_map_task

                        build_city_map_task.delay(city_clean)
                        triggered = True
                    return True
                elif cache_entry.status == TransitCacheStatus.FAILED.value:
                    logger.warning(
                        f"Transit build previously marked failed for '{city_name}'."
                    )
                    raise PublicTransitCompilationError(
                        f"Public transit compilation failed for {city_name}."
                    )
        except PublicTransitCompilationError:
            raise
        except (SQLAlchemyError, OSError, RuntimeError) as db_err:
            logger.warning(f"Transient error querying transit_cache: {db_err}")
            return True

        await asyncio.sleep(2.0)

    raise TimeoutError(
        f"Timed out waiting for {city_name} public transit data after {max_wait_secs}s."
    )


async def get_transit_matrix(
    pois: list[dict],
    city_name: str = "",
    departure_dt: datetime | str | None = None,
) -> list[list[dict]]:
    """
    Generate an N x N transit matrix between a list of POIs using local Valhalla multimodal routing.
    Ensures real-life public transit information from city GTFS and OSM data is used when available,
    and falls back to resilient transit calculation if compilation times out or fails.
    """
    n = len(pois)
    matrix = [
        [{"duration_mins": 0, "cost_eur": 0.0, "mode": "none"} for _ in range(n)]
        for _ in range(n)
    ]
    if n == 0:
        return matrix

    # Ensure real transit data is loaded in Valhalla for this city
    valhalla_ready = False
    if city_name:
        try:
            valhalla_ready = await ensure_transit_ready(city_name, max_wait_secs=5)
        except (TimeoutError, PublicTransitCompilationError) as exc:
            logger.warning(
                f"Transit tiles not ready in Valhalla for '{city_name}': {exc}. "
                "Proceeding with resilient transit matrix estimation."
            )
            valhalla_ready = False
    else:
        valhalla_ready = True

    locations = []
    for p in pois:
        lat = p.get("location", {}).get("latitude", p.get("lat", 0.0))
        lon = p.get("location", {}).get("longitude", p.get("lon", 0.0))
        locations.append({"lat": lat, "lon": lon})

    # Format ISO departure time for timetable lookup
    if isinstance(departure_dt, datetime):
        iso_dep = departure_dt.strftime("%Y-%m-%dT%H:%M")
    elif isinstance(departure_dt, str) and departure_dt:
        iso_dep = departure_dt
    else:
        iso_dep = datetime.now(timezone.utc).strftime("%Y-%m-%dT09:00")

    req_json = {
        "sources": locations,
        "targets": locations,
        "costing": "multimodal",
        "date_time": {
            "type": 1,  # 1 = depart at
            "value": iso_dep,
        },
        "costing_options": {
            "transit": {
                "use_bus": 0.8,
                "use_rail": 1.0,
                "use_transfers": 0.5,
            }
        },
        "units": "km",
    }

    fare_info = TransitFareService.get_city_transit_fare(city_name)
    transit_single_fare = fare_info.single_fare

    if valhalla_ready:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    f"{VALHALLA_URL}/sources_to_targets", json=req_json
                )
                resp.raise_for_status()
                data = resp.json()
                sources_to_targets = data.get("sources_to_targets", [])

                for i in range(n):
                    for j in range(n):
                        if i == j:
                            continue

                        if i < len(sources_to_targets) and j < len(
                            sources_to_targets[i]
                        ):
                            cell = sources_to_targets[i][j]
                            dist_km = cell.get(
                                "distance",
                                haversine_distance(
                                    locations[i]["lat"],
                                    locations[i]["lon"],
                                    locations[j]["lat"],
                                    locations[j]["lon"],
                                ),
                            )
                            duration_secs = cell.get("time", 1800)

                            mode = "pedestrian" if dist_km <= 1.0 else "transit"
                            cost = 0.0 if mode == "pedestrian" else transit_single_fare

                            matrix[i][j] = {
                                "duration_mins": max(1, int(duration_secs / 60)),
                                "cost_eur": cost,
                                "mode": mode,
                            }
                        else:
                            raise ValueError("Matrix size mismatch")
                return matrix

            except (
                httpx.HTTPError,
                KeyError,
                IndexError,
                ValueError,
                OSError,
                RuntimeError,
            ) as exc:
                logger.warning(
                    f"Valhalla multimodal query failed ({exc}). Falling back to walking/transit calculation."
                )

    # Fallback to realistic geographical walking/transit calculation using dynamic tariffs
    try:
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                lat_i, lon_i = locations[i]["lat"], locations[i]["lon"]
                lat_j, lon_j = locations[j]["lat"], locations[j]["lon"]

                dist_km = haversine_distance(lat_i, lon_i, lat_j, lon_j)
                if dist_km > 1.2:
                    duration = int((dist_km / 25.0 * 60) + 6)
                    cost = transit_single_fare
                    mode = "transit"
                else:
                    duration = int(dist_km / 4.8 * 60)
                    cost = 0.0
                    mode = "pedestrian"
                matrix[i][j] = {
                    "duration_mins": max(1, duration),
                    "cost_eur": cost,
                    "mode": mode,
                }
    except (TypeError, ValueError, KeyError, ZeroDivisionError) as exc:
        logger.warning(
            f"Distance calculation fallback failed ({exc}). Using standard baseline estimates."
        )
        for i in range(n):
            for j in range(n):
                if i != j:
                    matrix[i][j] = {
                        "duration_mins": 20,
                        "cost_eur": transit_single_fare,
                        "mode": "transit",
                    }

    return matrix


def inject_slack_time(
    matrix: list[list[dict]], slack_percentage: float = 0.15
) -> list[list[dict]]:
    """
    Adds slack time to the matrix to account for unforeseen delays.
    """
    n = len(matrix)
    matrix_copy = copy.deepcopy(matrix)
    for i in range(n):
        for j in range(n):
            if i != j:
                original = matrix_copy[i][j]["duration_mins"]
                matrix_copy[i][j]["duration_mins"] = int(
                    original * (1.0 + slack_percentage)
                )
    return matrix_copy
