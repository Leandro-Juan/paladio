import asyncio
import logging
from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)


class SwarmSessionManager:
    """
    Manages background execution of a SINGLE global LangGraph swarm to ensure it survives WebSocket disconnects.
    If the flow stops and the user reloads, the state is discarded.
    """

    def __init__(self, session_adapter):
        self.session_adapter = session_adapter
        self.active_queue: asyncio.Queue = None
        self.active_task: asyncio.Task = None
        self.active_thread_id: str = None

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ) -> AsyncGenerator[dict, None]:
        if action == "attach":
            try:
                config = {"configurable": {"thread_id": thread_id}}
                state_snapshot = self.session_adapter.graph.get_state(config)
                if state_snapshot and getattr(state_snapshot, "values", None):
                    st = state_snapshot.values
                    if st.get("validated_itinerary"):
                        yield {
                            "event": "EXTRACTING_CONSTRAINTS",
                            "status": "recovered",
                            "data": st["validated_itinerary"],
                        }
                    if st.get("final_itinerary"):
                        yield {
                            "event": "EVALUATING_ROUTES",
                            "status": "recovered",
                            "data": st["final_itinerary"],
                        }
                        if not self.active_task or self.active_task.done():
                            yield {"event": "DONE", "status": "completed"}
            except Exception as e:
                logger.error(f"Error recovering state: {e}")

            if self.active_task and not self.active_task.done():
                yield {
                    "event": "STARTING_INFERENCE",
                    "status": "Reattaching to active planning flow...",
                }
                try:
                    while True:
                        event = await self.active_queue.get()
                        yield event
                        if event.get("event") in [
                            "DONE",
                            "ERROR",
                            "CLARIFICATION_NEEDED",
                        ]:
                            break
                except asyncio.CancelledError:
                    pass
            return

        if action in ["chat", "resume", "feedback"]:
            if self.active_task and not self.active_task.done():
                logger.warning("Cancelling previous active planning flow.")
                self.active_task.cancel()

            self.active_queue = asyncio.Queue()
            self.active_thread_id = thread_id
            self.active_task = asyncio.create_task(
                self._run_graph_and_queue(
                    action, data, user_msg, thread_id, self.active_queue
                )
            )

            try:
                while True:
                    event = await self.active_queue.get()
                    yield event
                    if event.get("event") in ["DONE", "ERROR", "CLARIFICATION_NEEDED"]:
                        break
            except asyncio.CancelledError:
                logger.info(
                    "Client disconnected. Active planning continues in background."
                )

    async def _run_graph_and_queue(
        self,
        action: str,
        data: dict,
        user_msg: str,
        thread_id: str,
        queue: asyncio.Queue,
    ):
        try:
            async for event in self.session_adapter.process_message(
                action, data, user_msg, thread_id
            ):
                await queue.put(event)
        except asyncio.CancelledError:
            logger.info("Active graph task cancelled.")
            raise
        except Exception as e:
            logger.error(f"Error in background graph task: {e}")
            await queue.put({"event": "ERROR", "status": str(e)})
