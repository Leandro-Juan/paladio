import logging

from app.schemas.itinerary import TravelConstraints
from app.swarm.agents.ticket_parser import ticket_parser_node
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from app.swarm.nodes.guardrails import guardrails_node
from app.swarm.nodes.prompt_analyzer import prompt_analyzer_node
from app.swarm.nodes.verify_constraints import verify_constraints_node
from app.swarm.state import SwarmState
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)

# Backwards compatibility alias
check_missing_fields_node = verify_constraints_node


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
    ml_scorer = config["configurable"].get("ml_scorer") or (
        getattr(engine, "ml_scorer", None) if engine else None
    )
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


def route_guardrails(state: SwarmState) -> str:
    if state.get("guardrail_status") == "PROCEED":
        return "prompt_analyzer"
    return END


def create_swarm():
    workflow = StateGraph(SwarmState)
    workflow.add_node("ticket_parser", ticket_parser_node)
    workflow.add_node("assemble_constraints", assemble_constraints_node)
    workflow.add_node("verify_constraints", verify_constraints_node)
    workflow.add_node("guardrails", guardrails_node)
    workflow.add_node("prompt_analyzer", prompt_analyzer_node)
    workflow.add_node("planner_scrape", planner_scrape_node)
    workflow.add_node("planner_optimize", planner_optimize_node)

    workflow.add_edge(START, "ticket_parser")
    workflow.add_edge("ticket_parser", "assemble_constraints")
    workflow.add_edge("assemble_constraints", "verify_constraints")
    workflow.add_edge("verify_constraints", "guardrails")
    workflow.add_conditional_edges(
        "guardrails",
        route_guardrails,
        {
            "prompt_analyzer": "prompt_analyzer",
            END: END,
        },
    )
    workflow.add_edge("prompt_analyzer", "planner_scrape")
    workflow.add_edge("planner_scrape", "planner_optimize")
    workflow.add_edge("planner_optimize", END)

    from langgraph.checkpoint.memory import MemorySaver

    return workflow.compile(checkpointer=MemorySaver())


graph = create_swarm()
