import json
import logging
import uuid

from app.infrastructure.engine.bridge_adapter import OptimizationError
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    import asyncio

    if hasattr(websocket.app.state, "mock_swarm_session"):
        session = websocket.app.state.mock_swarm_session
    else:
        from app.db.session import async_session
        from app.adapters.repositories.sql_user_repository import SqlUserRepository
        from app.infrastructure.engine.ml_scorer import MLScorer
        from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
        from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter
        from app.infrastructure.swarm.swarm_session_manager import SwarmSessionManager
        from app.infrastructure.providers.travel_data import (
            LiveTravelDataProvider,
            MockTravelDataProvider,
        )
        import os

        # We must keep the session open for the duration of the websocket
        db_session = async_session()
        user_repo = SqlUserRepository(db_session)
        ml_scorer = MLScorer(
            ml_model=websocket.app.state.ml_model,
            ml_params=websocket.app.state.ml_params,
            user_repo=user_repo,
        )
        engine = CppOptimizationAdapter(ml_scorer=ml_scorer)
        engine.exchange_rate = websocket.app.state.exchange_rate_usd_eur

        if os.getenv("TEST_MODE") == "1":
            travel_data_provider = MockTravelDataProvider()
        else:
            travel_data_provider = LiveTravelDataProvider()

        adapter = SwarmSessionAdapter(
            graph=websocket.app.state.graph,
            engine=engine,
            ml_model=websocket.app.state.ml_model,
            ml_params=websocket.app.state.ml_params,
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

            thread_id = data.get("thread_id", str(uuid.uuid4()))

            async def stream_task(act, d, msg, tid):
                try:
                    async for event in session.process_message(act, d, msg, tid):
                        await outbound_queue.put(event)
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error(f"Stream error: {e}")

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
        if "db_session" in locals():
            await db_session.close()
