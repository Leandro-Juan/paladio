"""Proposal management for Tier C confirmation-gated tools."""

import json
import uuid
from typing import Any
import redis.asyncio as aioredis
from app.mcp.schemas import ProposalData

_redis_client: aioredis.Redis | None = None
_local_proposals: dict[str, dict[str, Any]] = {}


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        import os

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _redis_client = aioredis.from_url(redis_url, decode_responses=True)
    return _redis_client


async def create_proposal(
    trip_id: str,
    tool: str,
    summary: str,
    arguments: dict[str, Any],
    diff: dict[str, Any] | None = None,
    ttl_seconds: int = 600,
) -> ProposalData:
    """Stores a proposal requiring user confirmation with a TTL."""
    proposal_id = f"prop_{uuid.uuid4().hex[:12]}"
    proposal = ProposalData(
        proposal_id=proposal_id,
        trip_id=trip_id,
        tool=tool,
        summary=summary,
        arguments=arguments,
        diff=diff,
        expires_in_seconds=ttl_seconds,
    )
    payload = proposal.model_dump_json()

    try:
        r = _get_redis()
        await r.setex(f"paladio:proposal:{proposal_id}", ttl_seconds, payload)
    except Exception:
        # Fallback to local dict in case of isolated test or transient Redis error
        _local_proposals[proposal_id] = proposal.model_dump()

    return proposal


async def get_proposal(proposal_id: str) -> dict[str, Any] | None:
    """Retrieves proposal details without consuming it."""
    try:
        r = _get_redis()
        raw = await r.get(f"paladio:proposal:{proposal_id}")
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return _local_proposals.get(proposal_id)


async def consume_proposal(proposal_id: str) -> dict[str, Any] | None:
    """Consumes and invalidates a proposal upon execution/approval."""
    try:
        r = _get_redis()
        raw = await r.get(f"paladio:proposal:{proposal_id}")
        if raw:
            await r.delete(f"paladio:proposal:{proposal_id}")
            return json.loads(raw)
    except Exception:
        pass
    return _local_proposals.pop(proposal_id, None)
