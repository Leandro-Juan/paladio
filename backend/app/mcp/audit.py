"""Audit logger for MCP tools recording to agent_actions table."""

import hashlib
import json
import uuid
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentActionModel


def hash_arguments(args: dict[str, Any] | None) -> str:
    """Computes a deterministic SHA256 hex digest of tool arguments."""
    if not args:
        return ""
    try:
        # Sort keys and serialize safely
        serialized = json.dumps(args, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    except Exception:
        return ""


async def log_agent_action(
    session: AsyncSession,
    tool: str,
    outcome: str,  # 'success', 'error', 'requires_confirmation'
    user_id: str | None = None,
    trip_id: str | None = None,
    args: dict[str, Any] | None = None,
    revision: int | None = None,
    detail: dict[str, Any] | None = None,
) -> str:
    """
    Records an entry in agent_actions table for auditability and security compliance.
    """
    action_id = str(uuid.uuid4())
    args_hash = hash_arguments(args)

    action = AgentActionModel(
        id=action_id,
        user_id=user_id,
        trip_id=trip_id,
        tool=tool,
        args_hash=args_hash,
        outcome=outcome,
        revision=revision,
        detail=detail,
    )
    session.add(action)
    try:
        await session.flush()
    except Exception:
        # Avoid masking main operation errors if audit fails
        pass

    return action_id
