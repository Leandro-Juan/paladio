import asyncio
import json
import logging
import os
import uuid

from app.core.security import decode_access_token
from app.services.trip_generation_manager import TripGenerationManager
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()

_PROCESS_PID = os.getpid()


def _resolve_swarm_session(websocket: WebSocket):
    if (
        hasattr(websocket.app.state, "swarm_session")
        and websocket.app.state.swarm_session is not None
    ):
        return websocket.app.state.swarm_session

    import app.db.session as db_session_module
    from app.adapters.repositories.sql_user_repository import SqlUserRepository
    from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
    from app.infrastructure.engine.ml_scorer import MLScorer
    from app.infrastructure.providers.travel_data import DefaultTravelDataProvider
    from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter
    from app.infrastructure.swarm.swarm_session_manager import SwarmSessionManager

    user_repo = SqlUserRepository(session_factory=db_session_module.async_session)
    ml_scorer = MLScorer(
        ml_model=getattr(websocket.app.state, "ml_model", None),
        ml_params=getattr(websocket.app.state, "ml_params", None),
        user_repo=user_repo,
    )
    engine = CppOptimizationAdapter(ml_scorer=ml_scorer)
    engine.exchange_rate = getattr(websocket.app.state, "exchange_rate_usd_eur", 1.0)
    travel_data_provider = DefaultTravelDataProvider()

    adapter = SwarmSessionAdapter(
        graph=getattr(websocket.app.state, "graph", None),
        engine=engine,
        ml_model=getattr(websocket.app.state, "ml_model", None),
        ml_params=getattr(websocket.app.state, "ml_params", None),
        user_repo=user_repo,
        travel_data_provider=travel_data_provider,
    )
    return SwarmSessionManager(adapter)


@router.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Extract optional token from query parameters: /ws/stream?token=<jwt>
    token = websocket.query_params.get("token")
    auth_state: dict[str, str | None] = {"user_id": None}
    if token:
        payload = decode_access_token(token)
        if payload and "sub" in payload:
            auth_state["user_id"] = payload["sub"]
            logger.info(
                f"WebSocket client authenticated via query param as user {auth_state['user_id']}"
            )

    manager = getattr(websocket.app.state, "trip_generation_manager", None)
    if manager is None:
        manager = TripGenerationManager(websocket.app)
        websocket.app.state.trip_generation_manager = manager

    outbound_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=500)
    manager.register_ws(outbound_queue, auth_state["user_id"])
    feedback_tasks: set[asyncio.Task] = set()

    async def writer_task():
        try:
            while True:
                msg = await outbound_queue.get()
                try:
                    await websocket.send_text(json.dumps(msg, default=str))
                except Exception as e:
                    logger.error(f"Failed to serialize/send websocket message: {e}")
                outbound_queue.task_done()
        except Exception as e:
            logger.debug(f"Writer task closed: {e}")

    writer = asyncio.create_task(writer_task())

    async def heartbeat_task():
        try:
            while True:
                await asyncio.sleep(15)
                try:
                    outbound_queue.put_nowait({"event": "HEARTBEAT", "status": "ping"})
                except asyncio.QueueFull:
                    pass
        except asyncio.CancelledError:
            pass

    heartbeat = asyncio.create_task(heartbeat_task())

    async def redis_subscriber():
        try:
            import redis.asyncio as aioredis

            redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
            r = aioredis.from_url(redis_url)
            pubsub = r.pubsub()
            await pubsub.subscribe("paladio:events")
            try:
                async for message in pubsub.listen():
                    if message and message.get("type") == "message":
                        raw_data = message.get("data")
                        if isinstance(raw_data, bytes):
                            raw_data = raw_data.decode("utf-8")
                        try:
                            event_dict = json.loads(raw_data)
                            if not isinstance(event_dict, dict):
                                continue
                            if event_dict.get("_origin_pid") == _PROCESS_PID:
                                continue
                            event_dict.pop("_origin_pid", None)

                            ev_name = str(event_dict.get("event") or "")
                            ev_user_id = event_dict.get("user_id")
                            sub_user_id = auth_state["user_id"]
                            if ev_name.startswith("TRIP_JOB_"):
                                if ev_user_id != sub_user_id:
                                    continue
                            elif ev_user_id is not None and sub_user_id != ev_user_id:
                                continue

                            try:
                                outbound_queue.put_nowait(event_dict)
                            except asyncio.QueueFull:
                                pass
                        except (json.JSONDecodeError, TypeError, KeyError):
                            pass
            finally:
                await pubsub.aclose()
                await r.aclose()
        except asyncio.CancelledError:
            pass
        except (OSError, RuntimeError) as err:
            logger.debug(f"Redis subscriber closed: {err}")

    redis_task = asyncio.create_task(redis_subscriber())

    try:
        while True:
            text_data = await websocket.receive_text()

            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                continue

            if not isinstance(data, dict):
                continue

            action = data.get("action")
            user_msg = data.get("message", "")

            if "token" in data and not auth_state["user_id"]:
                msg_token = data["token"]
                payload = decode_access_token(msg_token)
                if payload and "sub" in payload:
                    auth_state["user_id"] = payload["sub"]
                    manager.update_ws_user(outbound_queue, auth_state["user_id"])
                    logger.info(
                        f"WebSocket client authenticated via message as user {auth_state['user_id']}"
                    )

            if auth_state["user_id"]:
                data["user_id"] = auth_state["user_id"]
            else:
                data["user_id"] = "default_user"

            if action == "ping":
                try:
                    outbound_queue.put_nowait({"event": "PONG", "status": "ok"})
                except asyncio.QueueFull:
                    pass
                continue

            if action == "feedback":
                thread_id = data.get("thread_id", str(uuid.uuid4()))

                async def run_feedback(d: dict, msg: str, tid: str):
                    try:
                        session = _resolve_swarm_session(websocket)
                        async for event in session.process_message(
                            "feedback", d, msg, tid
                        ):
                            try:
                                outbound_queue.put_nowait(event)
                            except asyncio.QueueFull:
                                pass
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.error(f"Feedback error: {exc}", exc_info=True)
                        try:
                            outbound_queue.put_nowait(
                                {"event": "ERROR", "status": str(exc)}
                            )
                        except asyncio.QueueFull:
                            pass

                task = asyncio.create_task(run_feedback(data, user_msg, thread_id))
                feedback_tasks.add(task)
                task.add_done_callback(feedback_tasks.discard)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"Internal server error: {e}", exc_info=True)
        error_msg = str(e)
        if len(error_msg) > 120:
            error_msg = error_msg[:117] + "..."
        try:
            await websocket.close(code=1011, reason=error_msg)
        except Exception:
            pass
    finally:
        manager.unregister_ws(outbound_queue)
        heartbeat.cancel()
        writer.cancel()
        redis_task.cancel()
        for t in feedback_tasks:
            t.cancel()
