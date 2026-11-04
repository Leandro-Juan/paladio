import json
import logging
import os
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")


async def publish_trip_event(
    trip_id: str, event_type: str, payload: dict[str, Any]
) -> None:
    """
    Publishes a trip event to the dedicated per-trip Redis channel `paladio:trip:{trip_id}`
    and fan-out to `paladio:events` for system bridges.
    """
    message = {
        "type": event_type,
        "trip_id": trip_id,
        "data": payload,
    }
    raw_json = json.dumps(message)
    try:
        r = aioredis.from_url(REDIS_URL, decode_responses=True)
        # Dedicated per-trip channel for isolated scoping
        await r.publish(f"paladio:trip:{trip_id}", raw_json)
        # Global relay channel
        await r.publish("paladio:events", raw_json)
        await r.aclose()
    except Exception as e:
        logger.warning(f"Failed to publish trip event {event_type} for {trip_id}: {e}")
