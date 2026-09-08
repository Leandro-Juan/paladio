import json
import logging

from app.schemas.itinerary import TravelConstraints
from app.swarm.agents.ticket_parser import ticket_parser_node
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from app.swarm.nodes.retriever import rag_node
from app.swarm.state import SwarmState
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase

logger = logging.getLogger(__name__)


async def check_missing_fields_node(state: SwarmState) -> dict:
    """
    Intelligently pause execution to ask the user for any missing vital information.
    """
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        raise RuntimeError("Missing validated itinerary. Validation may have failed.")

    constraints = TravelConstraints(**constraints_dict)

    missing_fields = []

    if not constraints.origin_city or constraints.origin_city.lower() == "unknown":
        missing_fields.append("origin_city")

    if (
        not constraints.destination_city
        or constraints.destination_city.lower() == "unknown"
    ):
        missing_fields.append("destination_city")

    if not constraints.budget_usd or constraints.budget_usd <= 0:
        missing_fields.append("budget_usd")

    if not constraints.start_date:
        missing_fields.append("start_date")

    if not constraints.end_date:
        missing_fields.append("end_date")

    if not constraints.booking_anchors:
        missing_fields.append("booking_anchors")
    else:
        if not constraints.booking_anchors.hotel:
            missing_fields.append("hotel_booking")
        if not constraints.booking_anchors.outbound_flight:
            missing_fields.append("outbound_flight")
        if not constraints.booking_anchors.return_flight:
            missing_fields.append("return_flight")

    if not constraints.meals or len(constraints.meals) == 0:
        missing_fields.append("meals")
    else:
        meal_types = [m.meal_type.upper() for m in constraints.meals]
        if not any("LUNCH" in mt for mt in meal_types) or not any(
            "DINNER" in mt for mt in meal_types
        ):
            missing_fields.append("meals")

    if missing_fields:
        # Request all missing fields at once to prevent hanging the state machine loop
        answers = interrupt(
            {
                "message": f"Missing information for: {', '.join(missing_fields)}",
                "fields": missing_fields,
            }
        )

        if isinstance(answers, dict):
            raw_answers = (
                answers.get("answers")
                if isinstance(answers.get("answers"), dict)
                else answers
            )
            valid_keys = set(TravelConstraints.model_fields.keys())
            if isinstance(raw_answers, dict):
                # Handle nested or converted fields
                if "budget_usd" in raw_answers:
                    try:
                        raw_answers["budget_usd"] = float(raw_answers["budget_usd"])
                    except (ValueError, TypeError):
                        pass

                if "meals" in raw_answers:
                    meals_val = raw_answers["meals"]
                    if isinstance(meals_val, str):
                        try:
                            raw_answers["meals"] = json.loads(meals_val)
                        except Exception:
                            pass

                filtered_answers = {
                    k: v
                    for k, v in raw_answers.items()
                    if k in valid_keys and v is not None and v != ""
                }
                constraints_dict.update(filtered_answers)

            clean_constraints = {
                k: v for k, v in constraints_dict.items() if k in valid_keys
            }
            try:
                constraints = TravelConstraints(**clean_constraints)
            except Exception as e:
                logger.error(f"Validation error on user input: {e}")

        return {"validated_itinerary": constraints.model_dump(mode="json")}
    return {}


async def planner_scrape_node(state: SwarmState, config: RunnableConfig) -> dict:
    logger.info(
        "--- [PHASE: PLANNER] Scraping dynamic data (Flights, Hotels, Restaurants) ---"
    )
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        raise RuntimeError("Missing validated itinerary for scraping phase.")
    constraints = TravelConstraints(**constraints_dict)

    provider = config["configurable"].get("travel_data_provider")
    if not provider:
        raise ValueError("travel_data_provider must be provided in the runnable config")

    engine = config["configurable"].get("engine")
    ml_scorer = engine.ml_scorer if engine else None
    user_id = config["configurable"].get("user_id", "default_user")

    test_data = state.get("test_data")
    use_case = FetchTravelContextUseCase(data_provider=provider, ml_scorer=ml_scorer)

    try:
        context = await use_case.execute(constraints, test_data, user_id=user_id)
        return context
    except Exception as e:
        logger.error(f"Failed to fetch context: {e}")
        raise RuntimeError(f"Context fetching failed: {e}")


async def planner_optimize_node(state: SwarmState, config: RunnableConfig) -> dict:
    logger.info("--- [PHASE: PLANNER] Optimizing Itinerary ---")
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        raise RuntimeError("Missing validated itinerary for optimization phase.")

    constraints = TravelConstraints(**constraints_dict)

    engine = config["configurable"].get("engine")
    use_case = OptimizeDailyItineraryUseCase(engine)

    try:
        final_itinerary = await use_case.execute(
            constraints,
            state.get("daily_pois_data", []),
            state.get("outbound_flight"),
            state.get("return_flight"),
        )
        return {"final_itinerary": final_itinerary}
    except Exception as e:
        logger.error(f"Optimization failed: {e}")
        raise RuntimeError(f"Optimization failed: {e}")


def create_swarm():
    workflow = StateGraph(SwarmState)
    workflow.add_node("ticket_parser", ticket_parser_node)
    workflow.add_node("assemble_constraints", assemble_constraints_node)
    workflow.add_node("check_missing", check_missing_fields_node)
    workflow.add_node("rag", rag_node)
    workflow.add_node("planner_scrape", planner_scrape_node)
    workflow.add_node("planner_optimize", planner_optimize_node)

    workflow.add_edge(START, "ticket_parser")
    workflow.add_edge("ticket_parser", "assemble_constraints")
    workflow.add_edge("assemble_constraints", "check_missing")
    workflow.add_edge("check_missing", "rag")
    workflow.add_edge("rag", "planner_scrape")
    workflow.add_edge("planner_scrape", "planner_optimize")
    workflow.add_edge("planner_optimize", END)

    from langgraph.checkpoint.memory import MemorySaver

    return workflow.compile(checkpointer=MemorySaver())


graph = create_swarm()
