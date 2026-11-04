from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

# In-memory cancellation registry per trip
_CANCEL_TOKENS: dict[str, asyncio.Event] = {}
_CANCEL_LOCK = asyncio.Lock()

DEFAULT_SESSION_TTL = 86400  # 24 hours
LOCK_TTL = 90  # 90 seconds max per turn


def get_session_key(trip_id: str, user_id: str) -> str:
    return f"paladio:agent:session:{trip_id}:{user_id}"


def get_lock_key(trip_id: str) -> str:
    return f"paladio:agent:lock:{trip_id}"


async def get_session_history(trip_id: str, user_id: str) -> list[dict[str, Any]]:
    """Retrieves chat message history for this trip and user from Redis."""
    try:
        r = await get_redis()
        key = get_session_key(trip_id, user_id)
        raw_items = await r.lrange(key, 0, -1)
        messages = []
        for item in raw_items:
            try:
                messages.append(json.loads(item))
            except Exception:
                pass
        return messages
    except Exception as e:
        logger.warning(f"Error fetching session history from Redis: {e}")
        return []


async def append_session_message(
    trip_id: str,
    user_id: str,
    role: str,
    content: str,
    metadata: Optional[dict[str, Any]] = None,
    max_history: int = 14,
) -> None:
    """Appends a message to the Redis session thread and trims older messages."""
    try:
        r = await get_redis()
        key = get_session_key(trip_id, user_id)
        entry = {
            "role": role,
            "content": content,
            "timestamp": time.time(),
            "metadata": metadata or {},
        }
        await r.rpush(key, json.dumps(entry))
        await r.ltrim(key, -max_history, -1)
        await r.expire(key, DEFAULT_SESSION_TTL)
    except Exception as e:
        logger.warning(f"Error appending session message to Redis: {e}")


async def clear_session_history(trip_id: str, user_id: str) -> None:
    """Clears message history for a trip session."""
    try:
        r = await get_redis()
        key = get_session_key(trip_id, user_id)
        await r.delete(key)
    except Exception as e:
        logger.warning(f"Error clearing session history in Redis: {e}")


async def acquire_turn_lock(trip_id: str, user_id: str) -> bool:
    """
    Acquires an exclusive turn lock so only one agent turn can execute
    concurrently on the same trip.
    """
    try:
        r = await get_redis()
        lock_key = get_lock_key(trip_id)
        # SET NX EX
        acquired = await r.set(lock_key, user_id, nx=True, ex=LOCK_TTL)
        return bool(acquired)
    except Exception as e:
        logger.warning(f"Error acquiring turn lock in Redis: {e}")
        return True  # Fallback to allow progress if Redis fails


async def release_turn_lock(trip_id: str) -> None:
    """Releases the turn lock for a trip."""
    try:
        r = await get_redis()
        lock_key = get_lock_key(trip_id)
        await r.delete(lock_key)
    except Exception as e:
        logger.warning(f"Error releasing turn lock in Redis: {e}")


async def register_cancel_token(trip_id: str) -> asyncio.Event:
    """Registers an asyncio.Event cancellation token for an active turn."""
    async with _CANCEL_LOCK:
        ev = asyncio.Event()
        _CANCEL_TOKENS[trip_id] = ev
        return ev


async def cancel_active_turn(trip_id: str) -> bool:
    """Signals cancellation to an active turn. Returns True if a turn was running."""
    async with _CANCEL_LOCK:
        ev = _CANCEL_TOKENS.get(trip_id)
        if ev:
            ev.set()
            return True
        return False


async def unregister_cancel_token(trip_id: str) -> None:
    """Unregisters the cancellation token once a turn completes."""
    async with _CANCEL_LOCK:
        _CANCEL_TOKENS.pop(trip_id, None)
