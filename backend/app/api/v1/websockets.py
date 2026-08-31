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
        session = websocket.app.state.swarm_manager

    outbound_queue = asyncio.Queue()

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
                except Exception as e:
                    logger.error(f"Stream error: {e}")

            asyncio.create_task(stream_task(action, data, user_msg, thread_id))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except OptimizationError as e:
        logger.error(f"Optimization error: {e}")
        await outbound_queue.put({"event": "ERROR", "status": str(e)})
        try:
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
