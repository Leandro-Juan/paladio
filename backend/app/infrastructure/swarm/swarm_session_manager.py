import logging
from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)


class SwarmSessionManager:
    """
    Manages LangGraph swarm execution.
    """

    def __init__(self, session_adapter):
        self.session_adapter = session_adapter

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
                        yield {"event": "DONE", "status": "completed"}
            except Exception as e:
                logger.error(f"Error recovering state: {e}")
            return

        if action in ["chat", "resume", "feedback"]:
            async for event in self.session_adapter.process_message(
                action, data, user_msg, thread_id
            ):
                yield event
