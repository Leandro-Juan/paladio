from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.events import AgentClientMessage, AgentServerEvent
from app.agent.runner import TripAgentRunner
from app.agent.session import (
    cancel_active_turn,
    register_cancel_token,
    unregister_cancel_token,
)
from app.application.trip_editing.trip_service import TripService
from app.core.access import TripAccessLevel, assert_trip_access
from app.db.session import get_db
from app.core.redis import get_redis
from app.mcp.auth import resolve_user_from_jwt
from app.mcp.context import with_user_context
from app.mcp.proposals import consume_proposal, get_proposal
from app.mcp.server import mcp

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Trip Agent"])


@router.websocket("/api/ws/trip-agent/{trip_id}")
async def trip_agent_websocket(
    websocket: WebSocket,
    trip_id: str,
    db: AsyncSession = Depends(get_db),
):
    # 1. Extract authentication token
    token = (
        websocket.query_params.get("token")
        or websocket.headers.get("authorization", "").replace("Bearer ", "")
        or websocket.cookies.get("paladio_token", "")
        or websocket.cookies.get("access_token", "")
    )
    if not token:
        logger.warning(f"TripAgent WS connection rejected for {trip_id}: missing token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await resolve_user_from_jwt(token, db)
    if not user:
        logger.warning(
            f"TripAgent WS connection rejected for {trip_id}: invalid or inactive user"
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Assert trip access
    try:
        await assert_trip_access(user, trip_id, TripAccessLevel.VIEWER, db)
    except Exception as e:
        logger.warning(
            f"TripAgent WS connection unauthorized for user {user.id} on trip {trip_id}: {e}"
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info(f"TripAgent WS connected: trip={trip_id}, user={user.id}")

    runner = TripAgentRunner()
    active_turn_task: Optional[asyncio.Task] = None
    cancel_event: Optional[asyncio.Event] = None
    pubsub_task: Optional[asyncio.Task] = None

    # 3. Dedicated Redis pub/sub listener for paladio:trip:{trip_id}
    async def _trip_events_listener():
        try:
            r = await get_redis()
            pubsub = r.pubsub()
            channel_name = f"paladio:trip:{trip_id}"
            await pubsub.subscribe(channel_name)
            async for raw_msg in pubsub.listen():
                if raw_msg.get("type") == "message":
                    try:
                        data = json.loads(raw_msg["data"])
                        payload = data.get("data") or data.get("payload") or {}
                        ev = AgentServerEvent(
                            event="trip_updated",
                            revision=payload.get("revision"),
                            summary=payload.get("summary", "Trip updated"),
                            undo_token=payload.get("undo_token"),
                            affected_days=payload.get("affected_days"),
                            changed_stop_ids=payload.get("changed_stop_ids"),
                        )
                        await websocket.send_text(ev.model_dump_json())
                    except Exception as parse_err:
                        logger.debug(f"Error parsing trip event: {parse_err}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Pubsub listener error for trip {trip_id}: {e}")

    pubsub_task = asyncio.create_task(_trip_events_listener())

    # 4. Inbound WebSocket message handling loop
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
                client_msg = AgentClientMessage.model_validate(data)
            except Exception as e:
                err_ev = AgentServerEvent(
                    event="error",
                    message=f"Invalid message format: {e}",
                    code="BAD_REQUEST",
                )
                await websocket.send_text(err_ev.model_dump_json())
                continue

            msg_type = client_msg.type

            # A) User Message
            if msg_type == "user_message":
                if active_turn_task and not active_turn_task.done():
                    err_ev = AgentServerEvent(
                        event="warning",
                        message="A turn is already active. Please wait or cancel the active turn.",
                        code="TURN_IN_PROGRESS",
                    )
                    await websocket.send_text(err_ev.model_dump_json())
                    continue

                cancel_event = await register_cancel_token(trip_id)

                async def _run_turn_task(
                    message_text: str, ui_ctx: Optional[dict[str, Any]]
                ):
                    try:
                        async for ev in runner.run_turn(
                            trip_id=trip_id,
                            user=user,
                            session=db,
                            user_message=message_text,
                            ui_context=ui_ctx,
                            cancel_event=cancel_event,
                        ):
                            await websocket.send_text(ev.model_dump_json())
                    except Exception as turn_err:
                        logger.exception(f"Turn error for trip {trip_id}: {turn_err}")
                        err_ev = AgentServerEvent(
                            event="error", message=str(turn_err), code="TURN_FAILED"
                        )
                        await websocket.send_text(err_ev.model_dump_json())
                    finally:
                        await unregister_cancel_token(trip_id)

                active_turn_task = asyncio.create_task(
                    _run_turn_task(client_msg.message or "", client_msg.ui_context)
                )

            # B) Cancel
            elif msg_type == "cancel":
                await cancel_active_turn(trip_id)
                if active_turn_task and not active_turn_task.done():
                    active_turn_task.cancel()
                warn_ev = AgentServerEvent(
                    event="warning",
                    message="Turn cancellation requested.",
                    code="CANCELLED",
                )
                await websocket.send_text(warn_ev.model_dump_json())

            # C) Approve Proposal
            elif msg_type == "approve":
                prop_id = client_msg.proposal_id
                if not prop_id:
                    err_ev = AgentServerEvent(
                        event="error", message="Missing proposal_id", code="BAD_REQUEST"
                    )
                    await websocket.send_text(err_ev.model_dump_json())
                    continue

                prop = await get_proposal(prop_id)
                if not prop:
                    err_ev = AgentServerEvent(
                        event="error",
                        message=f"Proposal '{prop_id}' expired or not found",
                        code="EXPIRED",
                    )
                    await websocket.send_text(err_ev.model_dump_json())
                    continue

                # Execute with confirmed=True
                tool_name = prop.get("tool")
                tool_args = prop.get("arguments", {})
                tool_args["confirmed"] = True

                async with with_user_context(
                    user=user,
                    session=db,
                    auth_mode="trip_agent_ws",
                ):
                    try:
                        res = await mcp.call_tool(tool_name, tool_args)
                        await consume_proposal(prop_id)
                        res_dict = {}
                        if (
                            isinstance(res, tuple)
                            and len(res) > 1
                            and isinstance(res[1], dict)
                        ):
                            res_dict = res[1]
                        elif isinstance(res, dict):
                            res_dict = res
                        elif hasattr(res, "model_dump"):
                            res_dict = res.model_dump()
                        else:
                            res_dict = {"summary": str(res)}
                        ok_ev = AgentServerEvent(
                            event="tool_result",
                            tool=tool_name,
                            ok=True,
                            summary=res_dict.get(
                                "summary", f"Successfully executed {tool_name}."
                            ),
                            data=res_dict.get("data"),
                        )
                        await websocket.send_text(ok_ev.model_dump_json())
                    except Exception as e:
                        err_ev = AgentServerEvent(
                            event="error",
                            message=f"Approval execution failed: {e}",
                            code="APPROVAL_FAILED",
                        )
                        await websocket.send_text(err_ev.model_dump_json())

            # D) Reject Proposal
            elif msg_type == "reject":
                prop_id = client_msg.proposal_id
                if prop_id:
                    await consume_proposal(prop_id)
                warn_ev = AgentServerEvent(
                    event="warning", message=f"Proposal '{prop_id}' rejected by user."
                )
                await websocket.send_text(warn_ev.model_dump_json())

            # E) Undo
            elif msg_type == "undo":
                target_rev = client_msg.revision
                try:
                    if target_rev is not None:
                        await TripService.undo_to_revision(
                            trip_id, target_rev, user, db
                        )
                    else:
                        await TripService.undo_last_change(trip_id, user, db)
                except Exception as undo_err:
                    err_ev = AgentServerEvent(
                        event="error",
                        message=f"Undo failed: {undo_err}",
                        code="UNDO_FAILED",
                    )
                    await websocket.send_text(err_ev.model_dump_json())

    except WebSocketDisconnect:
        logger.info(f"TripAgent WS disconnected: trip={trip_id}, user={user.id}")
    finally:
        if active_turn_task and not active_turn_task.done():
            active_turn_task.cancel()
        if pubsub_task and not pubsub_task.done():
            pubsub_task.cancel()
        await unregister_cancel_token(trip_id)
