from __future__ import annotations

import asyncio
from contextlib import suppress
import json
import logging
import os
import uuid
from typing import Any, AsyncGenerator, Optional, Set

from pydantic_ai import Agent, RunContext
from pydantic_ai.settings import ModelSettings
from pydantic_ai.mcp import MCPToolset
from app.services.llm_service import LLMService
from app.services.hardware_service import HardwareService

from app.agent.events import AgentServerEvent
from app.agent.prompts import build_system_prompt, build_trip_digest
from app.agent.session import (
    acquire_turn_lock,
    append_session_message,
    get_session_history,
    release_turn_lock,
)
from app.agent.toolsets import detect_domain_toolsets, get_allowed_tool_names
from app.application.trip_editing.expense_service import ExpenseService
from app.application.trip_editing.trip_service import TripService
from app.application.trip_editing.validation import ItineraryValidator
from app.db.models import UserModel
from app.mcp.context import with_user_context
from app.mcp.server import mcp
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class InstrumentedMCPToolset(MCPToolset):
    """
    Subclasses MCPToolset to intercept tool execution, emit real-time WebSocket events,
    and propagate mutations to the UI before returning to the model.
    """

    def __init__(
        self,
        event_queue: asyncio.Queue[AgentServerEvent],
        turn_id: str,
        tools_called: list[str],
        allowed_tool_names: Set[str],
        trip_id: str,
        cancel_event: Optional[asyncio.Event] = None,
        **kwargs: Any,
    ):
        kwargs.setdefault("tool_error_behavior", "error")
        super().__init__(**kwargs)
        self.event_queue = event_queue
        self.turn_id = turn_id
        self.tools_called = tools_called
        self.allowed_tool_names = allowed_tool_names
        self.trip_id = trip_id
        self.cancel_event = cancel_event

    async def call_tool(
        self,
        name: str,
        tool_args: dict[str, Any],
        ctx: RunContext[Any],
        tool: Any,
    ) -> Any:
        if self.cancel_event and self.cancel_event.is_set():
            raise asyncio.CancelledError("Turn was cancelled by user.")

        # Normalize or auto-inject active trip_id for tools operating within trip scope
        non_trip_tools = {
            "convert_currency",
            "load_toolset",
            "get_job_status",
            "cancel_job",
        }
        if name not in non_trip_tools and self.trip_id:
            val = tool_args.get("trip_id")
            if (
                val is None
                or not str(val).strip()
                or str(val).lower()
                in (
                    "your_trip_id",
                    "<trip_id>",
                    "current",
                    "current_trip",
                    "trip_id",
                    "string",
                )
            ):
                tool_args["trip_id"] = self.trip_id

        call_id = f"call_{uuid.uuid4().hex[:6]}"
        self.tools_called.append(name)

        # 1. Emit tool_call event
        await self.event_queue.put(
            AgentServerEvent(
                event="tool_call",
                turn_id=self.turn_id,
                call_id=call_id,
                tool=name,
                args=tool_args,
            )
        )

        try:
            raw_res = await super().call_tool(name, tool_args, ctx, tool)
        except Exception as e:
            await self.event_queue.put(
                AgentServerEvent(
                    event="tool_result",
                    turn_id=self.turn_id,
                    call_id=call_id,
                    tool=name,
                    ok=False,
                    summary=f"Tool '{name}' failed with error: {str(e)}",
                    error=str(e),
                )
            )
            raise e

        # Extract structured details from ToolResult or JSON representation
        res_data: dict[str, Any] = {}
        if (
            isinstance(raw_res, tuple)
            and len(raw_res) > 1
            and isinstance(raw_res[1], dict)
        ):
            res_data = raw_res[1]
        elif isinstance(raw_res, dict):
            res_data = raw_res
        elif hasattr(raw_res, "model_dump"):
            res_data = raw_res.model_dump()
        elif isinstance(raw_res, str):
            try:
                res_data = json.loads(raw_res)
            except Exception:
                res_data = {"summary": raw_res}

        ok = res_data.get("ok", True)
        summary = res_data.get("summary", f"Executed {name}")
        change_set = res_data.get("change_set")
        proposal = res_data.get("proposal")
        data = res_data.get("data")
        error_msg = res_data.get("error")

        # 2. Emit proposal event if Tier C action requires user approval
        if proposal and isinstance(proposal, dict):
            await self.event_queue.put(
                AgentServerEvent(
                    event="proposal",
                    turn_id=self.turn_id,
                    proposal_id=proposal.get("proposal_id"),
                    tool=name,
                    summary=proposal.get("summary", summary),
                    diff=proposal.get("diff"),
                    expires_in_seconds=proposal.get("expires_in_seconds", 600),
                )
            )

        # 3. Emit trip_updated event if mutation altered the trip revision
        if change_set and isinstance(change_set, dict):
            revision = change_set.get("revision")
            undo_token = change_set.get("undo_token")
            changes = change_set.get("changes", [])
            affected_days = list(
                {c.get("day", 0) for c in changes if c.get("day", 0) > 0}
            )
            changed_stops = [c.get("stop_id") for c in changes if c.get("stop_id")]
            await self.event_queue.put(
                AgentServerEvent(
                    event="trip_updated",
                    turn_id=self.turn_id,
                    revision=revision,
                    summary=summary,
                    undo_token=undo_token,
                    affected_days=affected_days,
                    changed_stop_ids=changed_stops,
                )
            )

        # 4. Emit tool_result event
        await self.event_queue.put(
            AgentServerEvent(
                event="tool_result",
                turn_id=self.turn_id,
                call_id=call_id,
                tool=name,
                ok=ok,
                summary=summary,
                change_set=change_set,
                data=data,
                error=error_msg,
            )
        )

        return raw_res


class TripAgentRunner:
    """
    TripAgentRunner manages the execution of conversational turns for a trip.
    It builds the system prompt and trip digest, connects in-process to FastMCP tools,
    enforces turn locks and cancellation, and streams real-time events.
    """

    def __init__(
        self,
        model: Optional[Any] = None,
        model_name: Optional[str] = None,
        ollama_base_url: Optional[str] = None,
    ):
        self._explicit_model = model
        self.model_name = model_name

    @property
    def model(self) -> Optional[Any]:
        if self._explicit_model is not None:
            return self._explicit_model
        return LLMService.get_model(model_name=self.model_name)

    @model.setter
    def model(self, value: Any) -> None:
        self._explicit_model = value

    async def run_turn(
        self,
        trip_id: str,
        user: UserModel,
        session: AsyncSession,
        user_message: str,
        ui_context: Optional[dict[str, Any]] = None,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> AsyncGenerator[AgentServerEvent, None]:
        turn_id = f"turn_{uuid.uuid4().hex[:8]}"

        # Yield turn_started immediately
        yield AgentServerEvent(event="turn_started", turn_id=turn_id)

        # Acquire turn lock
        locked = await acquire_turn_lock(trip_id, user.id)
        if not locked:
            yield AgentServerEvent(
                event="error",
                turn_id=turn_id,
                message="Another turn is currently executing for this trip. Please wait.",
                code="CONCURRENT_TURN",
            )
            return

        # Check host memory safety before launching local turn
        is_safe, mem_msg = HardwareService.check_memory_safety()
        if not is_safe:
            yield AgentServerEvent(
                event="error",
                turn_id=turn_id,
                message=mem_msg,
                code="LOW_MEMORY",
            )
            await release_turn_lock(trip_id)
            return

        event_queue: asyncio.Queue[AgentServerEvent] = asyncio.Queue()
        tools_called: list[str] = []
        worker_task: Optional[asyncio.Task[str]] = None

        try:
            # 1. Fetch trip, itinerary, issues, and budget
            trip = await TripService.get_trip(trip_id, user, session)
            doc = TripService.get_document(trip)
            issues = ItineraryValidator.validate_itinerary(
                doc, destination_city=trip.destination
            )
            expenses = await ExpenseService.list_expenses(trip_id, user, session)
            total_spent = sum(float(e.amount) for e in expenses)

            # 2. Build system prompt and trip digest
            system_prompt = build_system_prompt(trip_id=trip_id)
            digest = build_trip_digest(
                doc=doc,
                trip=trip,
                issues=issues,
                expenses_total=total_spent,
                ui_context=ui_context,
            )

            # 3. Dynamic domain toolset selection
            detected_domains = detect_domain_toolsets(user_message)
            allowed_tool_names = get_allowed_tool_names(detected_domains)

            # 4. Build instrumented MCP toolset
            toolset = InstrumentedMCPToolset(
                event_queue=event_queue,
                turn_id=turn_id,
                tools_called=tools_called,
                allowed_tool_names=allowed_tool_names,
                trip_id=trip_id,
                cancel_event=cancel_event,
                client=mcp,
            )
            filtered_toolset = toolset.filtered(
                lambda ctx, t: t.name in allowed_tool_names
            )

            # 5. Fetch previous session history from Redis
            history = await get_session_history(trip_id, user.id)
            history_prompt = ""
            if history:
                prev_lines = ["--- RECENT CONVERSATION ---"]
                for h in history[-6:]:
                    prev_lines.append(
                        f"{h.get('role', 'user').capitalize()}: {h.get('content', '')}"
                    )
                prev_lines.append("--- END CONVERSATION ---\n")
                history_prompt = "\n".join(prev_lines)

            composed_prompt = (
                f"{digest}\n\n{history_prompt}User message:\n{user_message}"
            )

            # 6. Instantiate agent with dynamic hardware-safe settings
            active_model = self._explicit_model or await LLMService.get_model_async(
                session=session, model_name=self.model_name
            )
            hardware = HardwareService.get_hardware_profile()
            max_tokens = int(os.getenv("TRIP_AGENT_MAX_TOKENS", "1024"))
            model_extra_body = {
                "options": {
                    "num_ctx": hardware.recommended_num_ctx,
                    "num_thread": hardware.recommended_num_thread,
                },
                "keep_alive": hardware.keep_alive,
            }

            agent = Agent(
                model=active_model,
                system_prompt=system_prompt,
                toolsets=[filtered_toolset],
                retries=2,
                model_settings=ModelSettings(
                    max_tokens=max_tokens,
                    parallel_tool_calls=False,
                    extra_body=model_extra_body,
                ),
            )

            async def _agent_worker() -> str:
                async with with_user_context(
                    user=user,
                    session=session,
                    auth_mode="trip_agent_ws",
                ):
                    if cancel_event and cancel_event.is_set():
                        raise asyncio.CancelledError("Turn cancelled by user.")
                    accumulated_text = ""
                    async with agent.run_stream(composed_prompt) as stream_res:
                        async for chunk in stream_res.stream_text(delta=True):
                            if cancel_event and cancel_event.is_set():
                                raise asyncio.CancelledError("Turn cancelled by user.")
                            accumulated_text += chunk
                            await event_queue.put(
                                AgentServerEvent(
                                    event="token",
                                    turn_id=turn_id,
                                    token=chunk,
                                )
                            )
                    return accumulated_text

            worker_task = asyncio.create_task(_agent_worker())

            # Read queue while worker is running
            while not worker_task.done() or not event_queue.empty():
                if cancel_event and cancel_event.is_set():
                    if not worker_task.done():
                        worker_task.cancel()
                    break
                try:
                    ev = await asyncio.wait_for(event_queue.get(), timeout=0.05)
                    if cancel_event and cancel_event.is_set():
                        if not worker_task.done():
                            worker_task.cancel()
                        break
                    yield ev
                except asyncio.TimeoutError:
                    if cancel_event and cancel_event.is_set():
                        if not worker_task.done():
                            worker_task.cancel()
                        break

            if (cancel_event and cancel_event.is_set()) or (
                worker_task and worker_task.cancelled()
            ):
                if worker_task and not worker_task.done():
                    worker_task.cancel()
                if worker_task:
                    with suppress(asyncio.CancelledError):
                        await worker_task
                yield AgentServerEvent(
                    event="warning",
                    turn_id=turn_id,
                    message="Turn cancelled by user.",
                    code="CANCELLED",
                )
                return

            final_text = await worker_task

            # Save to Redis session thread
            await append_session_message(trip_id, user.id, "user", user_message)
            await append_session_message(trip_id, user.id, "assistant", final_text)

            yield AgentServerEvent(
                event="turn_done",
                turn_id=turn_id,
                final_text=final_text,
                tools_called=tools_called,
            )

        except asyncio.CancelledError:
            yield AgentServerEvent(
                event="warning",
                turn_id=turn_id,
                message="Turn execution was cancelled.",
                code="CANCELLED",
            )
        except Exception as e:
            logger.exception(f"Error in TripAgentRunner turn {turn_id}: {e}")
            err_str = str(e)
            err_lower = err_str.lower()
            if (
                "413" in err_str
                or "429" in err_str
                or "rate limit" in err_lower
                or "ratelimit" in err_lower
                or "tpm" in err_lower
            ):
                user_msg = (
                    "Provider token rate limit exceeded (TPM/RPM limit reached). "
                    "Please wait a few moments before trying again, or configure a higher-capacity provider in Settings."
                )
                yield AgentServerEvent(
                    event="error",
                    turn_id=turn_id,
                    message=user_msg,
                    code="RATE_LIMIT_EXCEEDED",
                )
            elif (
                "403" in err_str
                or "access denied" in err_lower
                or "network settings" in err_lower
                or "forbidden" in err_lower
            ):
                yield AgentServerEvent(
                    event="error",
                    turn_id=turn_id,
                    message=err_str,
                    code="ACCESS_DENIED",
                )
            elif (
                "401" in err_str
                or "unauthorized" in err_lower
                or "invalid api key" in err_lower
            ):
                yield AgentServerEvent(
                    event="error",
                    turn_id=turn_id,
                    message=err_str,
                    code="AUTH_FAILED",
                )
            else:
                yield AgentServerEvent(
                    event="error",
                    turn_id=turn_id,
                    message=err_str,
                    code="INTERNAL_ERROR",
                )
        finally:
            if worker_task and not worker_task.done():
                worker_task.cancel()
                with suppress(asyncio.CancelledError):
                    await worker_task
            await release_turn_lock(trip_id)
