from app.swarm.state import SwarmState

async def router_node(state: SwarmState) -> dict:
    """
    Classifies user intent: Reactive Itinerary Planning vs. Proactive Continuous Monitoring.
    """
    last_msg = state["messages"][-1].content.lower()
    
    # Stub logic for intent classification
    if 'alert' in last_msg or 'monitor' in last_msg or 'price' in last_msg:
        intent = 'PROACTIVE_MONITORING'
    else:
        intent = 'REACTIVE_PLANNING'
        
    return {"intent": intent}
