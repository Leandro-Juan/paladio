import logging
from collections.abc import AsyncGenerator

from app.domain.interfaces.swarm_session import ISwarmSession
from app.engine.scoring.features import PoiEncoder
from langchain_core.messages import HumanMessage
from langgraph.types import Command

logger = logging.getLogger(__name__)


class SwarmSessionAdapter(ISwarmSession):
    def __init__(self, graph, engine, ml_model, ml_params, user_store):
        self.graph = graph
        self.engine = engine
        self.ml_model = ml_model
        self.ml_params = ml_params
        self.user_store = user_store

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ) -> AsyncGenerator[dict, None]:
        if action == "feedback":
            poi = data.get("poi", {})
            target_score = float(data.get("target_score", 50.0))
            user_id = data.get("user_id", "default_user")

            poi_embedding = PoiEncoder.encode(poi)
            user_emb = self.user_store.get_embedding(user_id)
            updated_emb = self.ml_model.update_user(
                self.ml_params, user_emb, poi_embedding, target_score
            )
            self.user_store.save_embedding(user_id, updated_emb)

            yield {"event": "FEEDBACK_PROCESSED", "status": "completed"}
            return

        yield {"event": "STARTING_INFERENCE", "status": "running"}

        initial_state = {
            "messages": [HumanMessage(content=user_msg)],
            "error_count": 0,
        }

        if "booking_text" in data:
            initial_state["booking_text"] = data["booking_text"]

        config = {"configurable": {"engine": self.engine, "thread_id": thread_id}}

        if action == "resume":
            # swarm_session_manager passes the resume dictionary in the `data` parameter.
            resume_data = data
            stream_input = Command(resume=resume_data)
        else:
            stream_input = initial_state

        async for chunk in self.graph.astream(
            stream_input, config=config, stream_mode="updates"
        ):
            if "__interrupt__" in chunk:
                interrupt_data = chunk["__interrupt__"]
                question = (
                    interrupt_data[0].value
                    if interrupt_data
                    else "Please clarify your request."
                )
                yield {
                    "event": "CLARIFICATION_NEEDED",
                    "status": "completed",
                    "data": question,
                    "thread_id": thread_id,
                }
                break

            for node_name, state_update in chunk.items():
                if not isinstance(state_update, dict):
                    continue

                if node_name == "rag":
                    retrieved = state_update.get("retrieved_context") or ""
                    truncated = (
                        retrieved[:500] + "..." if len(retrieved) > 500 else retrieved
                    )
                    yield {
                        "event": "RETRIEVING_CONTEXT",
                        "status": "completed",
                        "data": truncated,
                    }
                    yield {
                        "event": "PARSING_TICKETS",
                        "status": "running",
                    }

                elif node_name == "ticket_parser":
                    yield {
                        "event": "PARSING_TICKETS",
                        "status": "completed",
                        "data": "Extracted booking anchors if provided.",
                    }
                    yield {
                        "event": "EXTRACTING_CONSTRAINTS",
                        "status": "running",
                    }

                elif node_name == "validator":
                    constraints = state_update.get("validated_itinerary")
                    data_val = None
                    if constraints:
                        data_val = (
                            constraints.model_dump(mode="json")
                            if hasattr(constraints, "model_dump")
                            else constraints
                        )
                    yield {
                        "event": "EXTRACTING_CONSTRAINTS",
                        "status": "completed",
                        "data": data_val,
                    }

                elif node_name == "check_missing":
                    yield {"event": "CHECKING_MISSING_FIELDS", "status": "completed"}

                elif node_name == "planner_fetch":
                    yield {"event": "FETCHING_STATIC_DATA", "status": "completed"}

                elif node_name == "planner_scrape":
                    daily_pois = state_update.get("daily_pois_data", [])
                    num_pois = sum(len(day) for day in daily_pois) if daily_pois else 0
                    yield {
                        "event": "SCRAPING_DYNAMIC_DATA",
                        "status": "completed",
                        "data": f"Fetched {num_pois} POIs, Flight info...",
                    }

                elif node_name == "planner_optimize":
                    final_itinerary = state_update.get("final_itinerary", {})
                    if "error" in final_itinerary:
                        yield {"event": "ERROR", "status": final_itinerary["error"]}
                    else:
                        yield {
                            "event": "EVALUATING_ROUTES",
                            "status": "completed",
                            "data": final_itinerary,
                        }

        else:
            yield {"event": "DONE", "status": "completed"}
