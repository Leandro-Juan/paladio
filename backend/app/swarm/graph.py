import logging

from app.schemas.itinerary import TravelConstraints
from app.scraper.static_scraper import scrape_static
from app.swarm.agents.ticket_parser import ticket_parser_node
from app.swarm.agents.validator import validator_node
from app.swarm.nodes.retriever import rag_node
from app.swarm.state import SwarmState
from langchain_core.runnables.config import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
import time
from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase

_airport_cache = {}
_CACHE_TTL = 12 * 3600


async def get_airport_coordinates(city: str) -> tuple[float, float]:
    """Dynamically geocode the airport coordinates using Nominatim API."""
    now = time.time()
    if city in _airport_cache:
        cached_data, timestamp = _airport_cache[city]
        if now - timestamp < _CACHE_TTL:
            return cached_data

    try:
        query = f"airport in {city}"
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "json", "limit": 1}
        # Nominatim requires a User-Agent to avoid IP bans
        headers = {"User-Agent": "PaladioOptimizationEngine/1.0 (contact@paladio.app)"}
        result = await scrape_static(url, params=params, custom_headers=headers)
        data = result.get("data")
        if data and isinstance(data, list) and len(data) > 0:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            logger.info(f"Dynamically resolved {city} airport to {lat}, {lon}")
            _airport_cache[city] = ((lat, lon), now)
            return lat, lon
        else:
            logger.warning(
                f"Could not resolve airport for {city}. Falling back to city center."
            )
    except Exception as e:
        logger.error(f"Geocoding airport failed for {city}: {e}")

    raise RuntimeError(
        f"Could not resolve real airport coordinates for {city}. No mock data allowed."
    )


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

    if missing_fields:
        # Request all missing fields at once to prevent hanging the state machine loop
        answers = interrupt(
            {
                "message": f"Missing information for: {', '.join(missing_fields)}",
                "fields": missing_fields,
            }
        )

        if isinstance(answers, dict):
            constraints_dict.update({k: v for k, v in answers.items() if v})
            try:
                constraints = TravelConstraints(**constraints_dict)
            except Exception as e:
                logger.error(f"Validation error on user input: {e}")

        return {"validated_itinerary": constraints.model_dump(mode="json")}
    return {}


async def planner_fetch_node(state: SwarmState) -> dict:
    logger.info("--- [PHASE: PLANNER] Fetching static POIs (Delegated) ---")
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

    test_data = state.get("test_data")
    use_case = FetchTravelContextUseCase(data_provider=provider)

    try:
        context = await use_case.execute(constraints, test_data)
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
    workflow.add_node("rag", rag_node)
    workflow.add_node("ticket_parser", ticket_parser_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("check_missing", check_missing_fields_node)
    workflow.add_node("planner_fetch", planner_fetch_node)
    workflow.add_node("planner_scrape", planner_scrape_node)
    workflow.add_node("planner_optimize", planner_optimize_node)

    workflow.add_edge(START, "ticket_parser")
    workflow.add_edge("ticket_parser", "validator")
    workflow.add_edge("validator", "rag")
    workflow.add_edge("rag", "check_missing")
    workflow.add_edge("check_missing", "planner_fetch")
    workflow.add_edge("planner_fetch", "planner_scrape")
    workflow.add_edge("planner_scrape", "planner_optimize")
    workflow.add_edge("planner_optimize", END)

    from langgraph.checkpoint.memory import MemorySaver

    return workflow.compile(checkpointer=MemorySaver())


graph = create_swarm()
