import logging
from langgraph.graph import StateGraph, START, END
from app.swarm.state import SwarmState
from app.swarm.nodes.retriever import rag_node
from app.swarm.agents.validator import validator_node
from app.swarm.agents.router import router_node
from app.swarm.nodes.alert import alert_node
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.services.poi_service import get_attractions_for_city
from app.services.poi_service import get_attractions_for_city
from app.services.poi_service import get_attractions_for_city
from app.services.travel_data_service import fetch_flight, fetch_hotels, fetch_restaurants
from app.scraper.static_scraper import scrape_static
import random
import urllib.parse
from datetime import datetime, timedelta

import httpx

async def get_airport_coordinates(city: str) -> tuple[float, float]:
    """Dynamically geocode the airport coordinates using Nominatim API."""
    try:
        query = f"airport in {city}"
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "json", "limit": 1}
        result = await scrape_static(url, params=params)
        data = result.get("data")
        if data and isinstance(data, list) and len(data) > 0:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            logger.info(f"Dynamically resolved {city} airport to {lat}, {lon}")
            return lat, lon
        else:
            logger.warning(f"Could not resolve airport for {city}. Falling back to city center.")
    except Exception as e:
        logger.error(f"Geocoding airport failed for {city}: {e}")
        
    raise RuntimeError(f"Could not resolve real airport coordinates for {city}. No mock data allowed.")

logger = logging.getLogger(__name__)

from langgraph.types import interrupt

async def check_missing_fields_node(state: SwarmState) -> dict:
    """
    Intelligently pause execution to ask the user for any missing vital information.
    """
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        return {}
        
    from app.schemas.itinerary import TravelConstraints
    constraints = TravelConstraints(**constraints_dict)
    
    missing_fields = []
    
    if not constraints.origin_city or constraints.origin_city.lower() == "unknown":
        missing_fields.append("origin_city")
        
    if not constraints.destination_city or constraints.destination_city.lower() == "unknown":
        missing_fields.append("destination_city")
        
    if not constraints.budget_usd or constraints.budget_usd <= 0:
        missing_fields.append("budget_usd")
            
    if not constraints.start_date:
        missing_fields.append("start_date")
            
    if not constraints.end_date:
        missing_fields.append("end_date")

    if missing_fields:
        # Request all missing fields at once to prevent hanging the state machine loop
        answers = interrupt(f"Missing information for: {', '.join(missing_fields)}")
        
        if isinstance(answers, dict):
            if "origin_city" in answers:
                constraints.origin_city = str(answers["origin_city"]).strip()
            if "destination_city" in answers:
                constraints.destination_city = str(answers["destination_city"]).strip()
            if "budget_usd" in answers:
                try: constraints.budget_usd = float(answers["budget_usd"])
                except: pass
            if "start_date" in answers:
                from datetime import datetime
                try: constraints.start_date = datetime.strptime(str(answers["start_date"]).strip(), "%Y-%m-%d").date()
                except: pass
            if "end_date" in answers:
                from datetime import datetime
                try: constraints.end_date = datetime.strptime(str(answers["end_date"]).strip(), "%Y-%m-%d").date()
                except: pass
                
        return {"validated_itinerary": constraints.model_dump(mode='json')}
    return {}

async def planner_fetch_node(state: SwarmState) -> dict:
    logger.info("--- [PHASE: PLANNER] Fetching static POIs (Delegated) ---")
    return {}

async def planner_scrape_node(state: SwarmState) -> dict:
    logger.info("--- [PHASE: PLANNER] Scraping dynamic data (Flights, Hotels, Restaurants) ---")
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict: return {}
    from app.schemas.itinerary import TravelConstraints
    constraints = TravelConstraints(**constraints_dict)
    
    from app.use_cases.fetch_travel_context import FetchTravelContextUseCase
    use_case = FetchTravelContextUseCase()
    
    try:
        context = await use_case.execute(constraints, state.get("test_data"))
        return context
    except Exception as e:
        logger.error(f"Failed to fetch context: {e}")
        return {"error_count": state.get("error_count", 0) + 1}

from langchain_core.runnables.config import RunnableConfig

async def planner_optimize_node(state: SwarmState, config: RunnableConfig) -> dict:
    logger.info("--- [PHASE: PLANNER] Optimizing Itinerary ---")
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict: return {}
    
    from app.schemas.itinerary import TravelConstraints
    constraints = TravelConstraints(**constraints_dict)
    
    from app.use_cases.optimize_daily_itinerary import OptimizeDailyItineraryUseCase
    
    engine = config["configurable"].get("engine")
    use_case = OptimizeDailyItineraryUseCase(engine)
    
    try:
        final_itinerary = await use_case.execute(
            constraints,
            state.get("pois_data", []),
            state.get("outbound_flight"),
            state.get("return_flight")
        )
        return {"final_itinerary": final_itinerary}
    except Exception as e:
        logger.error(f"Optimization failed: {e}")
        return {"error_count": state.get("error_count", 0) + 1}

def route_after_router(state: SwarmState) -> str:
    return state.get("intent", "REACTIVE_PLANNING")

def create_swarm():
    workflow = StateGraph(SwarmState)
    workflow.add_node("router", router_node)
    workflow.add_node("rag", rag_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("check_missing", check_missing_fields_node)
    workflow.add_node("planner_fetch", planner_fetch_node)
    workflow.add_node("planner_scrape", planner_scrape_node)
    workflow.add_node("planner_optimize", planner_optimize_node)
    workflow.add_node("alert", alert_node)

    workflow.add_edge(START, "router")
    workflow.add_conditional_edges("router", route_after_router, {"REACTIVE_PLANNING": "rag", "PROACTIVE_MONITORING": "alert"})
    workflow.add_edge("rag", "validator")
    workflow.add_edge("validator", "check_missing")
    workflow.add_edge("check_missing", "planner_fetch")
    workflow.add_edge("planner_fetch", "planner_scrape")
    workflow.add_edge("planner_scrape", "planner_optimize")
    workflow.add_edge("planner_optimize", END)
    workflow.add_edge("alert", END)

    from langgraph.checkpoint.memory import MemorySaver
    return workflow.compile(checkpointer=MemorySaver())

graph = create_swarm()

