import asyncio
import copy
import json
import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import app.db.session as db_session_module
from app.db.models import TripGenerationJobModel, UserModel
from app.services.notification_relay_service import NotificationRelayService
from sqlalchemy import or_, select

logger = logging.getLogger(__name__)

_PROCESS_PID = os.getpid()

_PROGRESS_EVENTS = {
    "STARTING_INFERENCE",
    "PARSING_TICKETS",
    "EXTRACTING_CONSTRAINTS",
    "VERIFYING_CONSTRAINTS",
    "VERIFICATION_COMPLETED",
    "EVALUATING_GUARDRAILS",
    "GUARDRAILS_PASSED",
    "ANALYZING_PROMPT",
    "SCRAPING_DYNAMIC_DATA",
    "RETRIEVING_CONTEXT",
}

_INTERRUPT_EVENTS = {
    "TRIP_OVERLAP_WARNING",
    "VERIFICATION_REQUIRED",
    "CLARIFICATION_NEEDED",
}


def _extract_destination_from_itinerary(
    itinerary: dict[str, Any], extras: dict[str, Any]
) -> str:
    extra_dest = extras.get("destination_city")
    if isinstance(extra_dest, str) and extra_dest.strip():
        return extra_dest.strip()

    itin_dest = itinerary.get("destination")
    if (
        isinstance(itin_dest, str)
        and itin_dest.strip()
        and itin_dest.strip() != "Unknown"
    ):
        return itin_dest.strip()

    tc = itinerary.get("travel_constraints")
    if isinstance(tc, dict):
        tc_dest = tc.get("destination_city")
        if (
            isinstance(tc_dest, str)
            and tc_dest.strip()
            and tc_dest.strip() != "Unknown"
        ):
            return tc_dest.strip()

    days = itinerary.get("days")
    if isinstance(days, list):
        for day in days:
            if not isinstance(day, dict):
                continue
            fi = day.get("flight_info")
            if isinstance(fi, dict) and isinstance(fi.get("destination"), str):
                if fi["destination"].strip():
                    return fi["destination"].strip()
            inner = day.get("itinerary")
            if isinstance(inner, dict) and isinstance(inner.get("path"), list):
                for stop in inner["path"]:
                    if isinstance(stop, dict):
                        poi = stop.get("poi")
                        if isinstance(poi, dict) and isinstance(poi.get("city"), str):
                            if poi["city"].strip():
                                return poi["city"].strip()

    return "Unknown Destination"


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    try:
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            d = date.fromisoformat(raw)
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def _merge_itinerary_with_extras(
    itinerary: dict[str, Any], extras: dict[str, Any]
) -> tuple[str, str, str, dict[str, Any]]:
    """Merge submission metadata/constraints onto generated itinerary payload."""
    itinerary_copy = copy.deepcopy(itinerary) if isinstance(itinerary, dict) else {}
    destination = _extract_destination_from_itinerary(itinerary_copy, extras)

    tc_raw = itinerary_copy.get("travel_constraints")
    existing_constraints: dict[str, Any] = (
        copy.deepcopy(tc_raw) if isinstance(tc_raw, dict) else {}
    )

    days = itinerary_copy.get("days")
    days_len = len(days) if isinstance(days, list) and len(days) > 0 else 3

    start_dt = _parse_datetime(existing_constraints.get("start_date"))
    if start_dt is None:
        start_dt = _parse_datetime(extras.get("start_date"))
    if start_dt is None and isinstance(days, list) and len(days) > 0:
        first_day = days[0] if isinstance(days[0], dict) else {}
        fi = first_day.get("flight_info") if isinstance(first_day, dict) else None
        if isinstance(fi, dict):
            start_dt = _parse_datetime(fi.get("departure_time"))
    if start_dt is None:
        start_dt = datetime.now(timezone.utc)

    end_dt = _parse_datetime(existing_constraints.get("end_date"))
    if end_dt is None:
        end_dt = _parse_datetime(extras.get("end_date"))
    if end_dt is None and isinstance(days, list) and len(days) > 0:
        last_day = days[-1] if isinstance(days[-1], dict) else {}
        fi = last_day.get("flight_info") if isinstance(last_day, dict) else None
        if isinstance(fi, dict):
            end_dt = _parse_datetime(fi.get("departure_time"))
    if end_dt is None:
        end_dt = start_dt + timedelta(days=max(0, days_len - 1))

    merged_constraints = dict(existing_constraints)
    for key in (
        "title",
        "description",
        "currency",
        "origin_city",
        "origin_iata",
        "destination_city",
        "destination_iata",
        "departure_hour",
        "arrival_hour",
        "accommodation",
        "hotel",
        "participants",
    ):
        val = extras.get(key)
        if val:
            merged_constraints[key] = val

    for num_key in ("budget", "budget_usd", "travelers"):
        if extras.get(num_key) is not None:
            merged_constraints[num_key] = extras[num_key]

    itinerary_payload = dict(itinerary_copy)
    if extras.get("title") and not itinerary_payload.get("title"):
        itinerary_payload["title"] = extras["title"]
    if extras.get("description") and not itinerary_payload.get("description"):
        itinerary_payload["description"] = extras["description"]
    if extras.get("cover_photo") and not itinerary_payload.get("cover_photo"):
        itinerary_payload["cover_photo"] = extras["cover_photo"]
    if extras.get("origin_city") and not itinerary_payload.get("origin"):
        itinerary_payload["origin"] = extras["origin_city"]
    if extras.get("departure_hour") and not itinerary_payload.get("departure_hour"):
        itinerary_payload["departure_hour"] = extras["departure_hour"]
    if extras.get("arrival_hour") and not itinerary_payload.get("arrival_hour"):
        itinerary_payload["arrival_hour"] = extras["arrival_hour"]
    if extras.get("hotel") and not itinerary_payload.get("hotel"):
        itinerary_payload["hotel"] = extras["hotel"]
    if extras.get("participants") and not itinerary_payload.get("participants"):
        itinerary_payload["participants"] = extras["participants"]
    if extras.get("scanned_documents"):
        itinerary_payload["scanned_documents"] = extras["scanned_documents"]

    itinerary_payload["travel_constraints"] = merged_constraints

    return (
        destination,
        start_dt.isoformat(),
        end_dt.isoformat(),
        itinerary_payload,
    )


def _job_to_dict(job: TripGenerationJobModel) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "id": job.id,
        "user_id": job.user_id,
        "thread_id": job.thread_id,
        "destination": job.destination,
        "title": job.title,
        "status": job.status,
        "stage": job.stage,
        "stage_message": job.stage_message,
        "prompt": job.prompt,
        "interrupt_type": job.interrupt_type,
        "interrupt_payload": job.interrupt_payload,
        "guardrail_errors": (
            list(job.guardrail_errors)
            if isinstance(job.guardrail_errors, list)
            else None
        ),
        "error_message": job.error_message,
        "trip_id": job.trip_id,
        "acknowledged": bool(job.acknowledged),
        "created_at": job.created_at.isoformat() if job.created_at else now_iso,
        "updated_at": job.updated_at.isoformat() if job.updated_at else now_iso,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


def _strip_large_cover_photo(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    cleaned = dict(payload)
    cover = cleaned.get("cover_photo")
    if isinstance(cover, str) and cover.startswith("data:") and len(cover) > 2048:
        cleaned.pop("cover_photo", None)
    return cleaned


class TripGenerationManager:
    """Manages detached, PostgreSQL-backed background trip generation jobs."""

    def __init__(self, app: Any):
        self._app = app
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._ws_subscribers: dict[asyncio.Queue[dict[str, Any]], str | None] = {}

    def register_ws(
        self, queue: asyncio.Queue[dict[str, Any]], user_id: str | None
    ) -> None:
        self._ws_subscribers[queue] = user_id

    def update_ws_user(
        self, queue: asyncio.Queue[dict[str, Any]], user_id: str | None
    ) -> None:
        if queue in self._ws_subscribers:
            self._ws_subscribers[queue] = user_id

    def unregister_ws(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._ws_subscribers.pop(queue, None)

    def _get_session_manager(self):
        existing = getattr(self._app.state, "swarm_session", None)
        if existing is not None:
            return existing

        from app.adapters.repositories.sql_user_repository import SqlUserRepository
        from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
        from app.infrastructure.engine.ml_scorer import MLScorer
        from app.infrastructure.providers.travel_data import DefaultTravelDataProvider
        from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter
        from app.infrastructure.swarm.swarm_session_manager import SwarmSessionManager

        graph = getattr(self._app.state, "graph", None)
        if graph is None:
            from app.swarm.graph import graph as default_graph

            graph = default_graph
            self._app.state.graph = graph

        user_repo = SqlUserRepository(session_factory=db_session_module.async_session)
        ml_model = getattr(self._app.state, "ml_model", None)
        ml_params = getattr(self._app.state, "ml_params", None)
        ml_scorer = MLScorer(
            ml_model=ml_model,
            ml_params=ml_params,
            user_repo=user_repo,
        )
        engine = CppOptimizationAdapter(ml_scorer=ml_scorer)
        engine.exchange_rate = getattr(self._app.state, "exchange_rate_usd_eur", 1.0)
        travel_data_provider = DefaultTravelDataProvider()

        adapter = SwarmSessionAdapter(
            graph=graph,
            engine=engine,
            ml_model=ml_model,
            ml_params=ml_params,
            user_repo=user_repo,
            travel_data_provider=travel_data_provider,
        )
        return SwarmSessionManager(adapter)

    async def _publish_event(self, event: dict[str, Any]) -> None:
        event_user_id = event.get("user_id")
        for queue, sub_user_id in list(self._ws_subscribers.items()):
            if event_user_id is not None:
                if sub_user_id != event_user_id:
                    continue
            else:
                if sub_user_id is not None:
                    continue
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.debug("Dropped WS event due to full outbound queue")

        try:
            import redis.asyncio as aioredis

            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
            redis_payload = json.dumps(
                {**event, "_origin_pid": _PROCESS_PID}, default=str
            )
            client = aioredis.from_url(redis_url)
            try:
                await client.publish("paladio:events", redis_payload)
            finally:
                await client.aclose()
        except Exception as exc:
            logger.debug("Redis publish skipped for trip generation event: %s", exc)

    async def reconcile_interrupted_jobs(self) -> int:
        """Mark stale in-flight jobs as failed after a server restart."""
        now = datetime.now(timezone.utc)
        updated_count = 0
        async with db_session_module.async_session() as session:
            stmt = select(TripGenerationJobModel).where(
                TripGenerationJobModel.status.in_(["running", "awaiting_input"])
            )
            jobs = (await session.execute(stmt)).scalars().all()
            for job in jobs:
                job.status = "failed"
                job.error_message = (
                    "Server restarted while trip generation was in progress."
                )
                job.completed_at = now
                job.acknowledged = False
                updated_count += 1
            if updated_count:
                await session.commit()
        return updated_count

    async def start_job(
        self, prompt: str, extras: dict[str, Any], user_id: str | None
    ) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        thread_id = f"paladio_{job_id}"
        clean_extras = dict(extras or {})
        destination = (
            str(clean_extras.get("destination_city") or "").strip()
            or "Unknown Destination"
        )
        raw_title = clean_extras.get("title")
        title = (
            str(raw_title).strip()
            if isinstance(raw_title, str) and raw_title.strip()
            else f"Trip to {destination}"
        )

        job = TripGenerationJobModel(
            id=job_id,
            user_id=user_id,
            thread_id=thread_id,
            destination=destination,
            title=title,
            status="running",
            stage="STARTING_INFERENCE",
            stage_message="Initializing trip optimization...",
            prompt=prompt,
            request_payload=clean_extras,
            acknowledged=False,
        )

        async with db_session_module.async_session() as session:
            session.add(job)
            await session.commit()
            await session.refresh(job)
            job_dict = _job_to_dict(job)

        task = asyncio.create_task(
            self._run_job(
                job_id=job_id,
                action="chat",
                prompt=prompt,
                payload=clean_extras,
                user_id=user_id,
                thread_id=thread_id,
            )
        )
        self._tasks[job_id] = task
        task.add_done_callback(lambda _t, jid=job_id: self._tasks.pop(jid, None))

        await self._publish_event(
            {
                "event": "TRIP_JOB_STARTED",
                "status": "running",
                "job_id": job_id,
                "thread_id": thread_id,
                "user_id": user_id,
                "destination": destination,
                "title": title,
                "stage": "STARTING_INFERENCE",
                "data": job_dict,
            }
        )
        return job_dict

    async def _load_owned_job(
        self, session, job_id: str, user_id: str | None
    ) -> TripGenerationJobModel | None:
        stmt = select(TripGenerationJobModel).where(TripGenerationJobModel.id == job_id)
        job = (await session.execute(stmt)).scalar_one_or_none()
        if not job:
            return None
        if job.user_id is not None and job.user_id != user_id:
            return None
        if job.user_id is None and user_id is not None:
            return None
        return job

    async def get_job(self, job_id: str, user_id: str | None) -> dict[str, Any] | None:
        async with db_session_module.async_session() as session:
            job = await self._load_owned_job(session, job_id, user_id)
            return _job_to_dict(job) if job else None

    async def list_jobs(self, user_id: str | None) -> list[dict[str, Any]]:
        async with db_session_module.async_session() as session:
            user_filter = (
                TripGenerationJobModel.user_id == user_id
                if user_id is not None
                else TripGenerationJobModel.user_id.is_(None)
            )
            stmt = (
                select(TripGenerationJobModel)
                .where(
                    user_filter,
                    or_(
                        TripGenerationJobModel.status.in_(
                            ["running", "awaiting_input"]
                        ),
                        TripGenerationJobModel.acknowledged.is_(False),
                    ),
                )
                .order_by(TripGenerationJobModel.created_at.desc())
            )
            jobs = (await session.execute(stmt)).scalars().all()
            return [_job_to_dict(j) for j in jobs]

    async def resume_job(
        self, job_id: str, resume_data: dict[str, Any], user_id: str | None
    ) -> tuple[str, dict[str, Any] | None]:
        """Resume an awaiting_input job or abort it. Returns (outcome, job_dict)."""
        now = datetime.now(timezone.utc)
        async with db_session_module.async_session() as session:
            job = await self._load_owned_job(session, job_id, user_id)
            if not job:
                return "not_found", None
            if job.status != "awaiting_input":
                return "invalid_state", _job_to_dict(job)

            is_abort = (
                resume_data.get("abort") is True or resume_data.get("approved") is False
            )
            if is_abort:
                job.status = "cancelled"
                job.stage = "CANCELLED"
                job.interrupt_type = None
                job.interrupt_payload = None
                job.acknowledged = True
                job.completed_at = now
                await session.commit()
                await session.refresh(job)
                job_dict = _job_to_dict(job)
                await self._publish_event(
                    {
                        "event": "TRIP_JOB_CANCELLED",
                        "status": "cancelled",
                        "job_id": job.id,
                        "thread_id": job.thread_id,
                        "user_id": job.user_id,
                        "destination": job.destination,
                        "title": job.title,
                        "data": job_dict,
                    }
                )
                return "cancelled", job_dict

            job.status = "running"
            job.stage = "RESUMING"
            job.stage_message = "Resuming optimization..."
            job.interrupt_type = None
            job.interrupt_payload = None
            await session.commit()
            await session.refresh(job)
            job_dict = _job_to_dict(job)
            thread_id = job.thread_id
            job_user_id = job.user_id
            destination = job.destination
            title = job.title

        task = asyncio.create_task(
            self._run_job(
                job_id=job_id,
                action="resume",
                prompt="",
                payload=dict(resume_data),
                user_id=job_user_id,
                thread_id=thread_id,
            )
        )
        self._tasks[job_id] = task
        task.add_done_callback(lambda _t, jid=job_id: self._tasks.pop(jid, None))

        await self._publish_event(
            {
                "event": "TRIP_JOB_PROGRESS",
                "status": "running",
                "job_id": job_id,
                "thread_id": thread_id,
                "user_id": job_user_id,
                "destination": destination,
                "title": title,
                "stage": "RESUMING",
                "message": "Resuming optimization...",
                "data": job_dict,
            }
        )
        return "resumed", job_dict

    async def cancel_job(
        self, job_id: str, user_id: str | None
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        async with db_session_module.async_session() as session:
            job = await self._load_owned_job(session, job_id, user_id)
            if not job:
                return None
            if job.status in ("completed", "aborted", "failed", "cancelled"):
                job.acknowledged = True
                await session.commit()
                await session.refresh(job)
                return _job_to_dict(job)

            job.status = "cancelled"
            job.stage = "CANCELLED"
            job.interrupt_type = None
            job.interrupt_payload = None
            job.acknowledged = True
            job.completed_at = now
            await session.commit()
            await session.refresh(job)
            job_dict = _job_to_dict(job)

        active_task = self._tasks.get(job_id)
        if active_task and not active_task.done():
            active_task.cancel()

        await self._publish_event(
            {
                "event": "TRIP_JOB_CANCELLED",
                "status": "cancelled",
                "job_id": job_dict["id"],
                "thread_id": job_dict["thread_id"],
                "user_id": job_dict["user_id"],
                "destination": job_dict["destination"],
                "title": job_dict["title"],
                "data": job_dict,
            }
        )
        return job_dict

    async def acknowledge_job(self, job_id: str, user_id: str | None) -> bool:
        async with db_session_module.async_session() as session:
            job = await self._load_owned_job(session, job_id, user_id)
            if not job:
                return False
            job.acknowledged = True
            await session.commit()
            return True

    async def _update_job_stage(
        self, job_id: str, stage: str, message: str | None
    ) -> dict[str, Any] | None:
        async with db_session_module.async_session() as session:
            stmt = select(TripGenerationJobModel).where(
                TripGenerationJobModel.id == job_id
            )
            job = (await session.execute(stmt)).scalar_one_or_none()
            if not job or job.status == "cancelled":
                return None
            job.stage = stage
            if message is not None:
                job.stage_message = message
            await session.commit()
            await session.refresh(job)
            return _job_to_dict(job)

    async def _mark_awaiting_input(
        self, job_id: str, interrupt_type: str, interrupt_payload: Any
    ) -> dict[str, Any] | None:
        async with db_session_module.async_session() as session:
            stmt = select(TripGenerationJobModel).where(
                TripGenerationJobModel.id == job_id
            )
            job = (await session.execute(stmt)).scalar_one_or_none()
            if not job or job.status == "cancelled":
                return None
            job.status = "awaiting_input"
            job.stage = interrupt_type
            job.interrupt_type = interrupt_type
            job.interrupt_payload = (
                interrupt_payload
                if isinstance(interrupt_payload, dict)
                else {"message": str(interrupt_payload)}
            )
            if isinstance(interrupt_payload, dict) and interrupt_payload.get("message"):
                job.stage_message = str(interrupt_payload["message"])
            await session.commit()
            await session.refresh(job)
            return _job_to_dict(job)

    async def _mark_aborted(
        self, job_id: str, errors: list[str]
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        async with db_session_module.async_session() as session:
            stmt = select(TripGenerationJobModel).where(
                TripGenerationJobModel.id == job_id
            )
            job = (await session.execute(stmt)).scalar_one_or_none()
            if not job or job.status == "cancelled":
                return None
            job.status = "aborted"
            job.stage = "GUARDRAILS_ABORTED"
            job.guardrail_errors = errors
            job.stage_message = (
                "; ".join(errors) if errors else "Trip aborted by guardrails."
            )
            job.completed_at = now
            job.acknowledged = False
            await session.commit()
            await session.refresh(job)
            return _job_to_dict(job)

    async def _mark_failed(
        self, job_id: str, error_message: str
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        async with db_session_module.async_session() as session:
            stmt = select(TripGenerationJobModel).where(
                TripGenerationJobModel.id == job_id
            )
            job = (await session.execute(stmt)).scalar_one_or_none()
            if not job or job.status == "cancelled":
                return None
            job.status = "failed"
            job.stage = "ERROR"
            job.error_message = error_message
            job.stage_message = error_message
            job.completed_at = now
            job.acknowledged = False
            await session.commit()
            await session.refresh(job)
            return _job_to_dict(job)

    async def _run_job(
        self,
        job_id: str,
        action: str,
        prompt: str,
        payload: dict[str, Any],
        user_id: str | None,
        thread_id: str,
    ) -> None:
        try:
            session_manager = self._get_session_manager()
            run_data = dict(payload or {})
            run_data["user_id"] = user_id or "default_user"

            generated_itinerary: dict[str, Any] | None = None
            async for event in session_manager.process_message(
                action, run_data, prompt, thread_id
            ):
                ev_name = str(event.get("event") or "")
                ev_status = str(event.get("status") or "")
                ev_data = event.get("data")

                if ev_name in _INTERRUPT_EVENTS:
                    updated = await self._mark_awaiting_input(job_id, ev_name, ev_data)
                    if updated:
                        await self._publish_event(
                            {
                                "event": "TRIP_JOB_AWAITING_INPUT",
                                "status": "awaiting_input",
                                "job_id": job_id,
                                "thread_id": thread_id,
                                "user_id": user_id,
                                "destination": updated["destination"],
                                "title": updated["title"],
                                "stage": ev_name,
                                "interrupt_type": ev_name,
                                "interrupt_payload": updated["interrupt_payload"],
                                "data": updated,
                            }
                        )
                    return

                if ev_name == "GUARDRAILS_ABORTED":
                    raw_errors = (
                        ev_data
                        if isinstance(ev_data, list)
                        else [ev_data or "Trip aborted by guardrails."]
                    )
                    err_list = [str(err) for err in raw_errors]
                    updated = await self._mark_aborted(job_id, err_list)
                    if updated:
                        await self._publish_event(
                            {
                                "event": "TRIP_JOB_ABORTED",
                                "status": "aborted",
                                "job_id": job_id,
                                "thread_id": thread_id,
                                "user_id": user_id,
                                "destination": updated["destination"],
                                "title": updated["title"],
                                "guardrail_errors": err_list,
                                "data": updated,
                            }
                        )
                    return

                if ev_name == "ERROR":
                    err_msg = ev_status or "Trip generation failed."
                    updated = await self._mark_failed(job_id, err_msg)
                    if updated:
                        await self._publish_event(
                            {
                                "event": "TRIP_JOB_FAILED",
                                "status": "failed",
                                "job_id": job_id,
                                "thread_id": thread_id,
                                "user_id": user_id,
                                "destination": updated["destination"],
                                "title": updated["title"],
                                "error_message": err_msg,
                                "data": updated,
                            }
                        )
                    return

                if ev_name == "EVALUATING_ROUTES":
                    if isinstance(ev_data, dict):
                        generated_itinerary = ev_data
                        continue
                    msg = (
                        str(ev_data)
                        if isinstance(ev_data, str)
                        else "Optimizing routes & transit..."
                    )
                    updated = await self._update_job_stage(job_id, ev_name, msg)
                    if updated:
                        await self._publish_event(
                            {
                                "event": "TRIP_JOB_PROGRESS",
                                "status": "running",
                                "job_id": job_id,
                                "thread_id": thread_id,
                                "user_id": user_id,
                                "destination": updated["destination"],
                                "title": updated["title"],
                                "stage": ev_name,
                                "message": msg,
                                "data": updated,
                            }
                        )
                    continue

                if ev_name in _PROGRESS_EVENTS:
                    msg = (
                        str(ev_data)
                        if isinstance(ev_data, str)
                        else (
                            str(event.get("message")) if event.get("message") else None
                        )
                    )
                    updated = await self._update_job_stage(job_id, ev_name, msg)
                    if updated:
                        await self._publish_event(
                            {
                                "event": "TRIP_JOB_PROGRESS",
                                "status": "running",
                                "job_id": job_id,
                                "thread_id": thread_id,
                                "user_id": user_id,
                                "destination": updated["destination"],
                                "title": updated["title"],
                                "stage": ev_name,
                                "message": msg,
                                "data": updated,
                            }
                        )

            if generated_itinerary is None:
                err_msg = "Trip optimization ended without producing an itinerary."
                updated = await self._mark_failed(job_id, err_msg)
                if updated:
                    await self._publish_event(
                        {
                            "event": "TRIP_JOB_FAILED",
                            "status": "failed",
                            "job_id": job_id,
                            "thread_id": thread_id,
                            "user_id": user_id,
                            "destination": updated["destination"],
                            "title": updated["title"],
                            "error_message": err_msg,
                            "data": updated,
                        }
                    )
                return

            saving_state = await self._update_job_stage(
                job_id, "SAVING_TRIP", "Saving generated trip workspace..."
            )
            if saving_state:
                await self._publish_event(
                    {
                        "event": "TRIP_JOB_PROGRESS",
                        "status": "running",
                        "job_id": job_id,
                        "thread_id": thread_id,
                        "user_id": user_id,
                        "destination": saving_state["destination"],
                        "title": saving_state["title"],
                        "stage": "SAVING_TRIP",
                        "message": "Saving generated trip workspace...",
                        "data": saving_state,
                    }
                )

            from app.api.trips import persist_trip_record

            async with db_session_module.async_session() as session:
                stmt = select(TripGenerationJobModel).where(
                    TripGenerationJobModel.id == job_id
                )
                job = (await session.execute(stmt)).scalar_one_or_none()
                if not job or job.status == "cancelled":
                    return

                stored_extras = (
                    dict(job.request_payload)
                    if isinstance(job.request_payload, dict)
                    else {}
                )
                destination, start_iso, end_iso, merged_itin = (
                    _merge_itinerary_with_extras(generated_itinerary, stored_extras)
                )

                current_user: UserModel | None = None
                if job.user_id:
                    u_res = await session.execute(
                        select(UserModel).where(UserModel.id == job.user_id)
                    )
                    current_user = u_res.scalar_one_or_none()

                saved_trip = await persist_trip_record(
                    session=session,
                    destination=destination,
                    start_date=start_iso,
                    end_date=end_iso,
                    itinerary_data=merged_itin,
                    current_user=current_user,
                )

                # Re-fetch job row in case persist_trip_record committed/refreshed
                job = (
                    await session.execute(
                        select(TripGenerationJobModel).where(
                            TripGenerationJobModel.id == job_id
                        )
                    )
                ).scalar_one_or_none()
                if not job:
                    return

                resolved_title = (
                    merged_itin.get("title")
                    or (merged_itin.get("travel_constraints") or {}).get("title")
                    or job.title
                    or f"Trip to {saved_trip.destination}"
                )
                job.destination = saved_trip.destination
                job.title = str(resolved_title)
                job.status = "completed"
                job.stage = "DONE"
                job.stage_message = "Itinerary ready."
                job.trip_id = saved_trip.id
                job.completed_at = datetime.now(timezone.utc)
                job.acknowledged = False
                job.request_payload = _strip_large_cover_photo(stored_extras)
                await session.commit()
                await session.refresh(job)
                completed_dict = _job_to_dict(job)

            await self._publish_event(
                {
                    "event": "TRIP_JOB_COMPLETED",
                    "status": "completed",
                    "job_id": job_id,
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "trip_id": completed_dict["trip_id"],
                    "destination": completed_dict["destination"],
                    "title": completed_dict["title"],
                    "start_date": start_iso,
                    "end_date": end_iso,
                    "data": completed_dict,
                }
            )

            asyncio.create_task(
                NotificationRelayService.dispatch_background(
                    title=f"Trip Ready: {completed_dict['title'] or completed_dict['destination']}",
                    message=f"Your {completed_dict['destination']} itinerary is ready.",
                    level="success",
                    action_url=f"/trips/{completed_dict['trip_id']}",
                    event_type="itinerary_change",
                )
            )
        except asyncio.CancelledError:
            logger.info("Trip generation job %s cancelled.", job_id)
            raise
        except Exception as exc:
            logger.error(
                "Trip generation job %s failed: %s", job_id, exc, exc_info=True
            )
            err_msg = str(exc) or "Trip generation encountered an unexpected error."
            updated = await self._mark_failed(job_id, err_msg)
            if updated:
                await self._publish_event(
                    {
                        "event": "TRIP_JOB_FAILED",
                        "status": "failed",
                        "job_id": job_id,
                        "thread_id": thread_id,
                        "user_id": user_id,
                        "destination": updated["destination"],
                        "title": updated["title"],
                        "error_message": err_msg,
                        "data": updated,
                    }
                )

    async def shutdown(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            if not task.done():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()
