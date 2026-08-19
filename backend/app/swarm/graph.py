import logging
from langgraph.graph import StateGraph, START, END
from app.swarm.state import SwarmState
from app.swarm.nodes.retriever import rag_node
from app.swarm.agents.validator import validator_node
from app.swarm.agents.router import router_node
from app.swarm.nodes.alert import alert_node
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.engine.bridge import run_optimization

logger = logging.getLogger(__name__)

async def planner_node(state: SwarmState) -> dict:
    """
    Coordinates fetching POIs, getting transit matrix, and running the deterministic C++ engine.
    """
    logger.info("--- [PHASE: PLANNER] Running itinerary optimization engine ---")
    constraints = state.get("validated_itinerary")
    if not constraints:
        logger.error("No validated itinerary constraints found in state!")
        return {"error_count": state.get("error_count", 0) + 1}
        
    # In a full implementation, we would query the database here using the POI IDs
    # or categories extracted by the validator. For this Phase 2 MVP, we mock
    # fetching the coordinates for the requested POIs.
    pois_data = []
    
    logger.debug(f"Building POI data from {len(constraints.nodes)} constraint nodes...")
    # Always ensure there's at least a start/end node if requested.
    # We will build a list from constraints.
    for i, node in enumerate(constraints.nodes):
        pois_data.append({
            "name": node.poi_id,
            "category": "HOTEL" if i == 0 else "ATTRACTION",
            "cost_eur": 10.0,
            "duration_mins": node.min_duration_minutes,
            # Slight offset so they aren't all exactly 0 distance
            "lat": 40.4168 + (i * 0.001), 
            "lon": -3.7038 + (i * 0.001)
        })
        
    if not pois_data:
        # Fallback if no nodes specified
        logger.warning("No POIs found in constraints, using fallback Base Hotel.")
        pois_data.append({
            "name": "Base Hotel",
            "category": "HOTEL",
            "cost_eur": 0.0,
            "duration_mins": 0,
            "lat": 40.4168,
            "lon": -3.7038
        })

    # Inject mock restaurants to ensure meal deadlines can be satisfied
    pois_data.append({
        "name": "Mock Breakfast Cafe",
        "category": "RESTAURANT",
        "cost_eur": 5.0,
        "duration_mins": 30,
        "lat": 40.4170,
        "lon": -3.7040
    })
    pois_data.append({
        "name": "Mock Lunch Spot",
        "category": "RESTAURANT",
        "cost_eur": 15.0,
        "duration_mins": 60,
        "lat": 40.4180,
        "lon": -3.7050
    })
    pois_data.append({
        "name": "Mock Dinner Restaurant",
        "category": "RESTAURANT",
        "cost_eur": 25.0,
        "duration_mins": 90,
        "lat": 40.4190,
        "lon": -3.7060
    })
        
    num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
    logger.info(f"Planning {num_days}-day itinerary for {len(pois_data)} total nodes...")
    
    unvisited_pois = list(pois_data)
    multi_day_itinerary = []
    
    for day in range(num_days):
        logger.debug(f"Running optimization for Day {day+1}...")
        # Stop planning if only the base hotel (or nothing) is left
        if len(unvisited_pois) <= 1 and unvisited_pois and unvisited_pois[0].get("category") == "HOTEL":
            logger.debug("Only HOTEL left, stopping multi-day planning early.")
            break
            
        matrix = await get_transit_matrix(unvisited_pois)
        matrix = inject_slack_time(matrix, 0.15)
        
        result = run_optimization(constraints, unvisited_pois, matrix, num_days=num_days)
        
        multi_day_itinerary.append({
            "day": day + 1,
            "itinerary": result
        })
        
        # Determine which POIs were visited today
        visited_names = {p_info["poi"]["name"] for p_info in result["path"]}
        logger.debug(f"Day {day+1} scheduled {len(visited_names)} POIs.")
        
        # Remove visited POIs for the next day, keeping the HOTEL (base node)
        unvisited_pois = [
            p for p in unvisited_pois
            if p["category"] == "HOTEL" or p["name"] not in visited_names
        ]
    
    logger.info("--- [PHASE: PLANNER] Successfully generated itinerary ---")
    return {"final_itinerary": {"days": multi_day_itinerary}}

def route_after_router(state: SwarmState) -> str:
    return state.get("intent", "REACTIVE_PLANNING")

def create_swarm():
    workflow = StateGraph(SwarmState)
    
    workflow.add_node("router", router_node)
    workflow.add_node("rag", rag_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("planner", planner_node)
    workflow.add_node("alert", alert_node)

    workflow.add_edge(START, "router")
    workflow.add_conditional_edges(
        "router",
        route_after_router,
        {
            "REACTIVE_PLANNING": "rag",
            "PROACTIVE_MONITORING": "alert"
        }
    )
    workflow.add_edge("rag", "validator")
    workflow.add_edge("validator", "planner")
    workflow.add_edge("planner", END)
    workflow.add_edge("alert", END)

    return workflow.compile()

graph = create_swarm()
