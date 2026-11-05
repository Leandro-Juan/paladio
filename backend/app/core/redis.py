from __future__ import annotations

import asyncio
import os
import redis.asyncio as aioredis

_redis_clients: dict[asyncio.AbstractEventLoop, aioredis.Redis] = {}


def get_redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


async def get_redis() -> aioredis.Redis:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None:
        client = _redis_clients.get(loop)
        if client is None:
            client = aioredis.from_url(get_redis_url(), decode_responses=True)
            _redis_clients[loop] = client
        return client

    return aioredis.from_url(get_redis_url(), decode_responses=True)
