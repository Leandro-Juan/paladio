import logging
from collections.abc import AsyncGenerator

from app.domain.interfaces.swarm_session import ISwarmSession
from app.engine.scoring.features import PoiEncoder
from langchain_core.messages import HumanMessage
from langgraph.types import Command

logger = logging.getLogger(__name__)


class SwarmSessionAdapter(ISwarmSession):
    def __init__(
        self, graph, engine, ml_model, ml_params, user_repo, travel_data_provider
    ):
        self.graph = graph
        self.engine = engine
        self.ml_model = ml_model
        self.ml_params = ml_params
        self.user_repo = user_repo
        self.travel_data_provider = travel_data_provider

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ) -> AsyncGenerator[dict, None]:
        if action == "feedback":
            poi = data.get("poi", {})
            target_score = float(data.get("target_score", 50.0))
            user_id = data.get("user_id", "default_user")

            import numpy as np
            from app.engine.scoring.features import TAG_KEYS
            from app.infrastructure.scoring.hybrid_scorer import HybridSovereignScorer
            from app.schemas.user import normalize_user_preferences

            poi_embedding = PoiEncoder.encode(poi)

            user_model = (
                await self.user_repo.get_by_id(user_id)
                if hasattr(self.user_repo, "get_by_id")
                else None
            )
            user_pref = (
                user_model.preferences
                if user_model and user_model.preferences
                else None
            )

            user_emb_list = await self.user_repo.get_embedding(user_id)
            if user_emb_list is None:
                user_emb = np.full(16, 0.5, dtype=np.float32)
            else:
                user_emb = np.array(user_emb_list, dtype=np.float32)

            updated_emb = self.ml_model.update_user(
                self.ml_params, user_pref or user_emb, poi_embedding, target_score
            )

            updated_list = (
                updated_emb.tolist()
                if isinstance(updated_emb, np.ndarray)
                else list(updated_emb)
            )

            from app.engine.scoring.semantic_learning import SemanticLearningEngine

            raw_pref = user_model.preferences if user_model else None
            norm_pref = normalize_user_preferences(raw_pref)
            tag_weights = HybridSovereignScorer._extract_tag_weights(updated_list)
            for idx, tag_name in enumerate(TAG_KEYS):
                norm_pref.tag_affinities[tag_name] = round(float(tag_weights[idx]), 3)

            if hasattr(self.user_repo, "update_preferences"):
                await self.user_repo.update_preferences(
                    user_id, norm_pref.model_dump(mode="json")
                )

            learning_engine = SemanticLearningEngine()
            synthesized_768d = learning_engine.synthesize_768d_from_harmonics(
                norm_pref.tag_affinities, dim=768
            )
            await self.user_repo.save_embedding(user_id, synthesized_768d)

            yield {"event": "FEEDBACK_PROCESSED", "status": "completed"}
            return

        yield {"event": "STARTING_INFERENCE", "status": "running"}
        yield {"event": "PARSING_TICKETS", "status": "running"}

        prompt_val = user_msg or data.get("prompt", "")
        initial_state = {
            "messages": [HumanMessage(content=user_msg)] if user_msg else [],
            "error_count": 0,
            "prompt": prompt_val,
            "verification_completed": False,
            "guardrail_status": None,
            "guardrail_errors": None,
            "validated_itinerary": None,
            "booking_anchors": None,
            "booking_text": None,
            "final_itinerary": None,
            "daily_pois_data": None,
            "outbound_flight": None,
            "return_flight": None,
        }

        manual_constraints = {}
        if "manual_constraints" in data and isinstance(
            data["manual_constraints"], dict
        ):
            manual_constraints.update(data["manual_constraints"])
        elif "constraints" in data and isinstance(data["constraints"], dict):
            manual_constraints.update(data["constraints"])

        if prompt_val:
            manual_constraints["prompt"] = prompt_val

        if "budget_usd" in data:
            manual_constraints["budget_usd"] = data["budget_usd"]
        if "meals" in data:
            manual_constraints["meals"] = data["meals"]
        if "nodes" in data:
            manual_constraints["nodes"] = data["nodes"]
        if "origin_city" in data:
            manual_constraints["origin_city"] = data["origin_city"]
        if "destination_city" in data:
            manual_constraints["destination_city"] = data["destination_city"]
        if "start_date" in data:
            manual_constraints["start_date"] = data["start_date"]
        if "end_date" in data:
            manual_constraints["end_date"] = data["end_date"]

        # Support Test Mode auto-mock tickets using iata_mapping and custom/default dates
        origin = manual_constraints.get("origin_city") or data.get("origin_city")
        dest = manual_constraints.get("destination_city") or data.get(
            "destination_city"
        )
        start_date_val = manual_constraints.get("start_date") or data.get("start_date")
        end_date_val = manual_constraints.get("end_date") or data.get("end_date")

        is_test_mode = data.get("test_mode") is True or (
            origin and dest and not data.get("booking_text")
        )

        if is_test_mode and origin and dest:
            from datetime import date
            from app.utils.mock_tickets import generate_mock_tickets

            parsed_start: date | None = None
            duration_days = 5

            if start_date_val:
                try:
                    parsed_start = date.fromisoformat(str(start_date_val).split("T")[0])
                except (ValueError, TypeError):
                    parsed_start = None

            if start_date_val and end_date_val:
                try:
                    s_d = date.fromisoformat(str(start_date_val).split("T")[0])
                    e_d = date.fromisoformat(str(end_date_val).split("T")[0])
                    diff = (e_d - s_d).days
                    if diff > 0:
                        duration_days = diff
                except (ValueError, TypeError):
                    pass

            mock_res = generate_mock_tickets(
                origin, dest, duration_days=duration_days, start_date=parsed_start
            )
            initial_state["booking_text"] = mock_res["booking_text"]
            # Clear cities and dates from manual_constraints so ticket_parser and
            # assemble_constraints parse and assemble them from booking_text normally
            for key in ("origin_city", "destination_city", "start_date", "end_date"):
                manual_constraints.pop(key, None)
        else:
            if "booking_text" in data:
                initial_state["booking_text"] = data["booking_text"]

        if manual_constraints:
            initial_state["manual_constraints"] = manual_constraints

        initial_state["test_mode"] = is_test_mode

        from app.infrastructure.engine.ml_scorer import MLScorer

        config = {
            "configurable": {
                "engine": self.engine,
                "thread_id": thread_id,
                "travel_data_provider": self.travel_data_provider,
                "ml_scorer": MLScorer(self.ml_model, self.ml_params, self.user_repo),
                "user_id": data.get("user_id", "default_user"),
            }
        }

        if action == "resume":
            # swarm_session_manager passes the resume dictionary in the `data` parameter.
            resume_data = data
            stream_input = Command(resume=resume_data)
        else:
            stream_input = initial_state

        latest_itinerary = None
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
                if (
                    isinstance(question, dict)
                    and question.get("type") == "TRIP_OVERLAP_WARNING"
                ):
                    yield {
                        "event": "TRIP_OVERLAP_WARNING",
                        "status": "warning",
                        "data": question,
                        "thread_id": thread_id,
                    }
                elif (
                    isinstance(question, dict)
                    and question.get("type") == "VERIFICATION_REQUIRED"
                ):
                    yield {
                        "event": "VERIFICATION_REQUIRED",
                        "status": "awaiting_input",
                        "data": question,
                        "thread_id": thread_id,
                    }
                else:
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

                if node_name == "ticket_parser":
                    yield {
                        "event": "PARSING_TICKETS",
                        "status": "completed",
                        "data": "Extracted booking anchors if provided.",
                    }
                    yield {
                        "event": "EXTRACTING_CONSTRAINTS",
                        "status": "running",
                    }

                elif node_name in ["assemble_constraints", "validator"]:
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
                    yield {
                        "event": "VERIFYING_CONSTRAINTS",
                        "status": "running",
                    }

                elif node_name in ["verify_constraints", "check_missing"]:
                    yield {"event": "VERIFICATION_COMPLETED", "status": "completed"}
                    yield {"event": "CHECKING_MISSING_FIELDS", "status": "completed"}
                    yield {"event": "EVALUATING_GUARDRAILS", "status": "running"}

                elif node_name == "guardrails":
                    g_status = state_update.get("guardrail_status")
                    if g_status == "ABORT":
                        yield {
                            "event": "GUARDRAILS_ABORTED",
                            "status": "aborted",
                            "data": state_update.get(
                                "guardrail_errors", ["Trip aborted by guardrails."]
                            ),
                        }
                    else:
                        yield {"event": "GUARDRAILS_PASSED", "status": "completed"}
                        yield {"event": "ANALYZING_PROMPT", "status": "running"}

                elif node_name in ["prompt_analyzer", "prompt_analysis"]:
                    yield {"event": "ANALYZING_PROMPT", "status": "completed"}
                    yield {
                        "event": "SCRAPING_DYNAMIC_DATA",
                        "status": "running",
                    }

                elif node_name == "planner_scrape":
                    daily_pois = state_update.get("daily_pois_data", [])
                    num_pois = sum(len(day) for day in daily_pois) if daily_pois else 0
                    yield {
                        "event": "SCRAPING_DYNAMIC_DATA",
                        "status": "completed",
                        "data": f"Fetched {num_pois} POIs, Flight info...",
                    }
                    yield {"event": "EVALUATING_ROUTES", "status": "running"}

                elif node_name == "planner_optimize":
                    final_itinerary = state_update.get("final_itinerary", {})
                    if "error" in final_itinerary:
                        yield {"event": "ERROR", "status": final_itinerary["error"]}
                    else:
                        latest_itinerary = final_itinerary
                        yield {
                            "event": "EVALUATING_ROUTES",
                            "status": "running",
                            "data": "Evaluating optimal routes and realism...",
                        }

                elif node_name == "planner_repair":
                    yield {
                        "event": "EVALUATING_ROUTES",
                        "status": "running",
                        "data": "Refining schedule for pacing and meal balance...",
                    }

        else:
            if latest_itinerary:
                yield {
                    "event": "EVALUATING_ROUTES",
                    "status": "completed",
                    "data": latest_itinerary,
                }
            yield {"event": "DONE", "status": "completed"}
