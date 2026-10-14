"""Unified OpenStreetMap HTTP Client, Redis-backed Nominatim Rate Limiter, and Health-Scored Overpass Pool."""

import asyncio
import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "PaladioItineraryEngine/1.0 (https://github.com/Leandro-Juan/Paladio; contact@paladio.local)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

_local_nominatim_lock = asyncio.Lock()
_local_nominatim_last_called = 0.0


class OverpassEndpointPool:
    """Tracks endpoint health and provides automatic failover across mirrors."""

    def __init__(self, endpoints: list[str] | None = None):
        self.endpoints = list(endpoints or DEFAULT_OVERPASS_ENDPOINTS)
        self._failure_counts: dict[str, int] = {ep: 0 for ep in self.endpoints}
        self._cooldown_until: dict[str, float] = {ep: 0.0 for ep in self.endpoints}

    def get_ordered_endpoints(self) -> list[str]:
        """Returns endpoints ordered by health (active endpoints first, lowest failure count)."""
        now = time.time()
        active = [
            ep for ep in self.endpoints if self._cooldown_until.get(ep, 0.0) <= now
        ]
        cooling = [
            ep for ep in self.endpoints if self._cooldown_until.get(ep, 0.0) > now
        ]

        active.sort(key=lambda ep: self._failure_counts.get(ep, 0))
        cooling.sort(key=lambda ep: self._cooldown_until.get(ep, 0.0))
        return active + cooling

    def record_success(self, endpoint: str) -> None:
        self._failure_counts[endpoint] = max(
            0, self._failure_counts.get(endpoint, 0) - 1
        )
        self._cooldown_until[endpoint] = 0.0

    def record_failure(self, endpoint: str, status_code: int | None = None) -> None:
        self._failure_counts[endpoint] = self._failure_counts.get(endpoint, 0) + 1
        # Set cooldown (longer for 429 rate limit or 504 gateway timeout)
        cooldown_secs = 60.0 if status_code in (429, 504) else 15.0
        self._cooldown_until[endpoint] = time.time() + cooldown_secs
        logger.warning(
            f"Overpass endpoint {endpoint} failed (status={status_code}); cooldown {cooldown_secs}s"
        )


_GLOBAL_OVERPASS_POOL = OverpassEndpointPool()


def get_overpass_pool() -> OverpassEndpointPool:
    return _GLOBAL_OVERPASS_POOL


async def acquire_nominatim_slot(redis_client: Any | None = None) -> None:
    """Enforces 1.1s minimum delay between Nominatim calls across processes and threads."""
    global _local_nominatim_last_called

    async with _local_nominatim_lock:
        if redis_client is not None:
            try:
                # Use Redis key to coordinate between API and Celery workers
                now = time.time()
                last_call_raw = await redis_client.get("paladio:nominatim_last_called")
                if last_call_raw:
                    elapsed = now - float(last_call_raw)
                    wait = 1.1 - elapsed
                    if wait > 0:
                        await asyncio.sleep(wait)
                await redis_client.set(
                    "paladio:nominatim_last_called", str(time.time()), ex=60
                )
                _local_nominatim_last_called = time.time()
                return
            except Exception as e:
                logger.debug(
                    f"Redis-backed Nominatim rate limit failed ({e}); using local lock."
                )

        # Local fallback
        elapsed = time.time() - _local_nominatim_last_called
        wait = 1.1 - elapsed
        if wait > 0:
            await asyncio.sleep(wait)
        _local_nominatim_last_called = time.time()


async def execute_overpass_query(
    query: str,
    client: httpx.AsyncClient | None = None,
    timeout: float = 45.0,
    max_retries: int = 3,
) -> list[dict[str, Any]]:
    """Executes an Overpass QL query with automatic mirror failover and retry."""
    pool = get_overpass_pool()
    endpoints = pool.get_ordered_endpoints()

    own_client = client is None
    client = client or httpx.AsyncClient(timeout=timeout)

    last_err: Exception | None = None
    try:
        for attempt in range(max_retries):
            for endpoint in endpoints:
                try:
                    logger.debug(
                        f"Querying Overpass mirror: {endpoint} (attempt {attempt+1})"
                    )
                    resp = await client.post(
                        endpoint,
                        data={"data": query},
                        headers={"User-Agent": USER_AGENT},
                        timeout=timeout,
                    )
                    if resp.status_code == 200:
                        pool.record_success(endpoint)
                        data = resp.json()
                        return data.get("elements", [])
                    else:
                        pool.record_failure(endpoint, resp.status_code)
                except Exception as exc:
                    pool.record_failure(endpoint)
                    last_err = exc
                    logger.debug(f"Overpass query failed via {endpoint}: {exc}")
            # Exponential backoff between multi-mirror passes
            await asyncio.sleep(1.0 * (2**attempt))
    finally:
        if own_client:
            await client.aclose()

    raise RuntimeError(
        f"All Overpass mirrors exhausted after {max_retries} attempts: {last_err}"
    )
