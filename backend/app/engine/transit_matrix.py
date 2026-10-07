import asyncio
import copy
import logging
import math
import os
from datetime import datetime, timezone

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
                        import os
                        import redis

                        cancelled = False
                        try:
                            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
                            r_chk = redis.from_url(redis_url)
                            cancelled = bool(
                                r_chk.get(f"paladio:transit_cancelled:{city_clean}")
                            )
                        except Exception:
                            pass

                        if cancelled:
                            logger.info(
                                f"Transit compilation for '{city_name}' was recently cancelled/deleted. Skipping auto-trigger."
                            )
                            return True

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
                elif (
                    cache_entry.status == TransitCacheStatus.FAILED.value
                    or cache_entry.gtfs_status in ("FAILED", "UNAVAILABLE")
                ) and not triggered:
                    logger.info(
                        f"Transit build previously marked failed/unavailable for '{city_name}'. Retrying compilation..."
                    )
                    from app.tasks import build_city_map_task

                    cache_entry.status = TransitCacheStatus.BUILDING.value
                    cache_entry.gtfs_status = "BUILDING"
                    await session.commit()
                    build_city_map_task.delay(city_clean)
                    triggered = True
        except PublicTransitCompilationError:
            raise
        except (SQLAlchemyError, OSError, RuntimeError) as db_err:
            logger.warning(f"Transient error querying transit_cache: {db_err}")

        await asyncio.sleep(2.0)

    raise TimeoutError(
        f"Timed out waiting for {city_name} public transit data after {max_wait_secs}s."
    )


async def get_transit_matrix(
    pois: list[dict],
    city_name: str = "",
    departure_dt: datetime | str | None = None,
    plan_mode: str = "real",
) -> list[list[dict]]:
    """
    Generate an N x N transit matrix between a list of POIs using RoutingService.
    Supports plan_mode='real' (strict fail-fast Valhalla routing) or 'estimated'.
    """
    from app.services.routing_service import RoutingService

    return await RoutingService.get_transit_matrix(
        pois=pois,
        city_name=city_name,
        departure_dt=departure_dt,
        plan_mode=plan_mode,
    )


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
