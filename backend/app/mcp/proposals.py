"""Proposal management for Tier C confirmation-gated tools."""

import json
import uuid
from typing import Any
from app.core.redis import get_redis
from app.mcp.schemas import ProposalData

_local_proposals: dict[str, dict[str, Any]] = {}


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
    _local_proposals[proposal_id] = proposal.model_dump()

    try:
        r = await get_redis()
        await r.set(f"paladio:proposal:{proposal_id}", payload, ex=ttl_seconds)
    except Exception:
        pass

    return proposal


async def get_proposal(proposal_id: str) -> dict[str, Any] | None:
    """Retrieves proposal details without consuming it."""
    try:
        r = await get_redis()
        raw = await r.get(f"paladio:proposal:{proposal_id}")
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return _local_proposals.get(proposal_id)


async def consume_proposal(proposal_id: str) -> dict[str, Any] | None:
    """Consumes and invalidates a proposal upon execution/approval."""
    try:
        r = await get_redis()
        raw = await r.get(f"paladio:proposal:{proposal_id}")
        if raw:
            await r.delete(f"paladio:proposal:{proposal_id}")
            _local_proposals.pop(proposal_id, None)
            return json.loads(raw)
    except Exception:
        pass
    return _local_proposals.pop(proposal_id, None)
