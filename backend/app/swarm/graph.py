from langgraph.graph import StateGraph, START, END
from app.swarm.state import SwarmState
from app.swarm.nodes.retriever import rag_node
from app.swarm.agents.validator import validator_node
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.engine.bridge import run_optimization

async def planner_node(state: SwarmState) -> dict:
    """
    Coordinates fetching POIs, getting transit matrix, and running the deterministic C++ engine.
    """
    constraints = state.get("constraints")
    if not constraints:
        return {"error_count": state.get("error_count", 0) + 1}
        
    # In a full implementation, we would query the database here using the POI IDs
    # or categories extracted by the validator. For this Phase 2 MVP, we mock
    # fetching the coordinates for the requested POIs.
    pois_data = []
    
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
        pois_data.append({
            "name": "Base Hotel",
            "category": "HOTEL",
            "cost_eur": 0.0,
            "duration_mins": 0,
            "lat": 40.4168,
            "lon": -3.7038
        })
        
    matrix = await get_transit_matrix(pois_data)
    matrix = inject_slack_time(matrix, 0.15)
    
    result = run_optimization(constraints, pois_data, matrix)
    
    return {"final_itinerary": result}

def create_swarm():
    workflow = StateGraph(SwarmState)
    
    workflow.add_node("rag", rag_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("planner", planner_node)

    # Simple linear flow for the Phase 2 MVP
    # Later we can add a router to skip planning if it's just a general question
    workflow.add_edge(START, "rag")
    workflow.add_edge("rag", "validator")
    workflow.add_edge("validator", "planner")
    workflow.add_edge("planner", END)

    return workflow.compile()

graph = create_swarm()
