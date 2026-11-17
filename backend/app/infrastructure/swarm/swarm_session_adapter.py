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

            # Persist structured taste event if SQL session or factory is available
            sess_factory = getattr(self.user_repo, "session_factory", None)
            raw_sess = getattr(self.user_repo, "session", None) or getattr(
                self.user_repo, "_session", None
            )
            if (
                (sess_factory is not None or raw_sess is not None)
                and user_id
                and user_id != "default_user"
            ):
                try:
                    from app.application.taste.taste_service import TasteService
                    from app.domain.entities.taste import (
                        InferredReason,
                        TasteEvent,
                        TasteSignalType,
                    )
                    from app.engine.scoring.features import PoiEncoder as _PE

                    cat = _PE._infer_category(poi)
                    pol = max(-1.0, min(1.0, (target_score - 50.0) / 50.0))
                    ev = TasteEvent(
                        user_id=user_id,
                        trip_id=data.get("trip_id"),
                        entity_type="poi",
                        entity_id=str(poi.get("id") or poi.get("name") or "poi"),
                        event_type=TasteSignalType.CHAT_PREFERENCE,
                        polarity=pol,
                        weight=1.0,
                        inferred_reason=InferredReason.EXPLICIT_CONSTRAINT,
                        context={"category": cat, "embedding": poi.get("embedding")},
                    )
                    if sess_factory is not None:
                        async with sess_factory() as db_sess:
                            await TasteService.record_events(
                                db_sess, user_id, [ev], trip_id=data.get("trip_id")
                            )
                    else:
                        await TasteService.record_events(
                            raw_sess, user_id, [ev], trip_id=data.get("trip_id")
                        )
                except Exception as exc:
                    logger.debug("Feedback taste persistence skipped: %s", exc)

            yield {"event": "FEEDBACK_PROCESSED", "status": "completed"}
            return

        yield {"event": "STARTING_INFERENCE", "status": "running"}
        yield {"event": "PARSING_TICKETS", "status": "running"}

        prompt_val = user_msg or data.get("prompt", "")
        initial_state = {
            "messages": [HumanMessage(content=user_msg)] if user_msg else [],
            "error_count": 0,
            "prompt": prompt_val,
            "user_id": data.get("user_id", "default_user"),
            "trip_id": data.get("trip_id"),
            "participants": data.get("participants"),
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

        if "booking_text" in data:
            initial_state["booking_text"] = data["booking_text"]

        # Populate booking anchors from explicit parameters (hotel, flights, or direct booking_anchors)
        booking_anchors = None
        if "booking_anchors" in data and isinstance(data["booking_anchors"], dict):
            booking_anchors = data["booking_anchors"]
        else:
            anchors_dict = {}
            dest_city = data.get("destination_city") or "Unknown"
            origin_city = data.get("origin_city")
            if (
                "hotel" in data
                and isinstance(data["hotel"], dict)
                and data["hotel"].get("name")
            ):
                h = data["hotel"]
                anchors_dict["hotel"] = {
                    "name": h["name"],
                    "address": h.get("address"),
                    "city": dest_city,
                    "lat": h.get("lat"),
                    "lng": h.get("lng"),
                    "check_in_date": h.get("check_in_date") or data.get("start_date"),
                    "check_in_time": h.get("check_in_time", "15:00"),
                    "check_out_date": h.get("check_out_date") or data.get("end_date"),
                    "check_out_time": h.get("check_out_time", "11:00"),
                }

            origin_iata = data.get("origin_iata")
            dest_iata = data.get("destination_iata")
            if not dest_iata and dest_city and dest_city != "Unknown":
                try:
                    from app.services.airport_service import get_airport_service

                    ap_dest = get_airport_service().resolve_airport_for_city(dest_city)
                    if ap_dest and ap_dest.iata:
                        dest_iata = ap_dest.iata
                except Exception:
                    pass
            if not origin_iata and origin_city and origin_city != "Unknown":
                try:
                    from app.services.airport_service import get_airport_service

                    ap_orig = get_airport_service().resolve_airport_for_city(
                        origin_city
                    )
                    if ap_orig and ap_orig.iata:
                        origin_iata = ap_orig.iata
                except Exception:
                    pass

            start_date = data.get("start_date")
            end_date = data.get("end_date")
            dep_hour = data.get("departure_hour", "09:00")
            arr_hour = data.get("arrival_hour", "20:00")

            scanned_docs = data.get("scanned_documents")
            flight_dep_from_doc = None
            if isinstance(scanned_docs, list):
                for sdoc in scanned_docs:
                    if isinstance(sdoc, dict) and sdoc.get("ticket_type") == "flight":
                        meta = sdoc.get("metadata") or {}
                        if meta.get("flight_departure_hour"):
                            flight_dep_from_doc = meta.get("flight_departure_hour")
                            break

            eff_origin = origin_iata or "ORG"
            if dest_iata and start_date:
                anchors_dict["outbound_flight"] = {
                    "origin_iata": eff_origin,
                    "destination_iata": dest_iata,
                    "departure_time": f"{start_date} {flight_dep_from_doc or dep_hour}",
                    "arrival_time": f"{start_date} {dep_hour}",
                    "direction": "arrival",
                }
            if dest_iata and end_date:
                anchors_dict["return_flight"] = {
                    "origin_iata": dest_iata,
                    "destination_iata": eff_origin,
                    "departure_time": f"{end_date} {arr_hour}",
                    "direction": "departure",
                }

            if anchors_dict:
                booking_anchors = anchors_dict

        if booking_anchors:
            initial_state["booking_anchors"] = booking_anchors

        if "auto_verify" in data:
            initial_state["auto_verify"] = bool(data["auto_verify"])

        if manual_constraints:
            initial_state["manual_constraints"] = manual_constraints

        initial_state["test_mode"] = bool(data.get("test_mode"))

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

                elif node_name == "assemble_constraints":
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

                elif node_name == "verify_constraints":
                    yield {"event": "VERIFICATION_COMPLETED", "status": "completed"}
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

                elif node_name == "prompt_analyzer":
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
