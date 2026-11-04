from __future__ import annotations

import time
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

# Server-to-Client Event Types
ServerEventType = Literal[
    "turn_started",
    "token",
    "tool_call",
    "tool_result",
    "proposal",
    "trip_updated",
    "warning",
    "error",
    "turn_done",
]

# Client-to-Server Message Types
ClientMessageType = Literal[
    "user_message",
    "approve",
    "reject",
    "cancel",
    "undo",
]


class AgentServerEvent(BaseModel):
    """Event streamed from server to client over WebSocket."""

    event: ServerEventType
    turn_id: str = ""
    timestamp: float = Field(default_factory=time.time)

    # Payload fields depending on event type
    token: Optional[str] = None

    # tool_call
    call_id: Optional[str] = None
    tool: Optional[str] = None
    args: Optional[dict[str, Any]] = None

    # tool_result
    ok: Optional[bool] = None
    summary: Optional[str] = None
    change_set: Optional[dict[str, Any]] = None
    data: Optional[Any] = None

    # proposal
    proposal_id: Optional[str] = None
    diff: Optional[dict[str, Any]] = None
    expires_in_seconds: Optional[int] = None

    # trip_updated
    revision: Optional[int] = None
    undo_token: Optional[str] = None
    affected_days: Optional[list[int]] = None
    changed_stop_ids: Optional[list[str]] = None

    # warning / error
    message: Optional[str] = None
    code: Optional[str] = None

    # turn_done
    final_text: Optional[str] = None
    tools_called: Optional[list[str]] = None


class AgentClientMessage(BaseModel):
    """Message received from client over WebSocket."""

    type: ClientMessageType
    message: Optional[str] = None
    proposal_id: Optional[str] = None
    ui_context: Optional[dict[str, Any]] = None
    undo_token: Optional[str] = None
    revision: Optional[int] = None
