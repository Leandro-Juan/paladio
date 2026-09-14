import json
import logging
import uuid

from app.core.security import decode_access_token
from app.infrastructure.engine.bridge_adapter import OptimizationError
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Extract optional token from query parameters: /ws/stream?token=<jwt>
    token = websocket.query_params.get("token")
    auth_user_id = None
    if token:
        payload = decode_access_token(token)
        if payload and "sub" in payload:
            auth_user_id = payload["sub"]
            logger.info(
                f"WebSocket client authenticated via query param as user {auth_user_id}"
            )

    import asyncio

    if (
        hasattr(websocket.app.state, "swarm_session")
        and websocket.app.state.swarm_session is not None
    ):
        session = websocket.app.state.swarm_session
    else:
        from app.adapters.repositories.sql_user_repository import SqlUserRepository
        from app.db.session import async_session
        from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
        from app.infrastructure.engine.ml_scorer import MLScorer
        from app.infrastructure.providers.travel_data import DefaultTravelDataProvider
        from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter
        from app.infrastructure.swarm.swarm_session_manager import SwarmSessionManager

        # Short-lived scoped DB sessions per operation to prevent pool starvation
        user_repo = SqlUserRepository(session_factory=async_session)
        ml_scorer = MLScorer(
            ml_model=getattr(websocket.app.state, "ml_model", None),
            ml_params=getattr(websocket.app.state, "ml_params", None),
            user_repo=user_repo,
        )
        engine = CppOptimizationAdapter(ml_scorer=ml_scorer)
        engine.exchange_rate = getattr(
            websocket.app.state, "exchange_rate_usd_eur", 1.0
        )

        travel_data_provider = DefaultTravelDataProvider()

        adapter = SwarmSessionAdapter(
            graph=getattr(websocket.app.state, "graph", None),
            engine=engine,
            ml_model=getattr(websocket.app.state, "ml_model", None),
            ml_params=getattr(websocket.app.state, "ml_params", None),
            user_repo=user_repo,
            travel_data_provider=travel_data_provider,
        )
        session = SwarmSessionManager(adapter)

    outbound_queue = asyncio.Queue(maxsize=100)
    stream_tasks = set()

    async def writer_task():
        try:
            while True:
                msg = await outbound_queue.get()
                await websocket.send_json(msg)
                outbound_queue.task_done()
        except Exception as e:
            logger.debug(f"Writer task closed: {e}")

    writer = asyncio.create_task(writer_task())

    try:
        while True:
            text_data = await websocket.receive_text()

            data = {}
            action = "chat"
            try:
                data = json.loads(text_data)
                action = data.get("action", "chat")
                user_msg = data.get("message", "")
            except json.JSONDecodeError:
                user_msg = text_data

            if not user_msg and action not in ["feedback", "attach", "resume"]:
                continue

            # Check if token provided in message payload
            if "token" in data and not auth_user_id:
                msg_token = data["token"]
                payload = decode_access_token(msg_token)
                if payload and "sub" in payload:
                    auth_user_id = payload["sub"]
                    logger.info(
                        f"WebSocket client authenticated via message as user {auth_user_id}"
                    )

            # Enforce authenticated user_id if available, disallowing client spoofing
            if auth_user_id:
                data["user_id"] = auth_user_id
            else:
                data["user_id"] = "default_user"

            thread_id = data.get("thread_id", str(uuid.uuid4()))

            # Cancel any previous running stream task on this socket to prevent overlapping inferences
            for t in list(stream_tasks):
                if not t.done():
                    t.cancel()
            stream_tasks.clear()

            async def stream_task(act, d, msg, tid):
                try:
                    async for event in session.process_message(act, d, msg, tid):
                        await outbound_queue.put(event)
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error(f"Stream error: {e}", exc_info=True)
                    try:
                        await outbound_queue.put({"event": "ERROR", "status": str(e)})
                    except Exception:
                        pass

            task = asyncio.create_task(stream_task(action, data, user_msg, thread_id))
            stream_tasks.add(task)
            task.add_done_callback(stream_tasks.discard)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except OptimizationError as e:
        logger.error(f"Optimization error: {e}")
        try:
            outbound_queue.put_nowait({"event": "ERROR", "status": str(e)})
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
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
        writer.cancel()
        for t in stream_tasks:
            t.cancel()
