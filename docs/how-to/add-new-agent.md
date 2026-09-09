# How-To: Add a New Agent to the Swarm

The Paladio swarm is built on **LangGraph**. Adding a new agent or node requires updating the state schema, implementing the node logic, and wiring it into the graph.

This guide shows how to add a hypothetical `WeatherAgent` that checks forecasts before validation.

## 1. Update the State Schema

All communication between nodes happens via the `SwarmState`. If your new agent produces new data, you must declare it in `app/swarm/state.py`.

```python
# backend/app/swarm/state.py
from typing import TypedDict, Annotated

class SwarmState(TypedDict):
    # ... existing fields
    weather_forecast: str  # Add your new field here
```

## 2. Create the Node Logic

Create a new file for your agent in `app/swarm/nodes/` or `app/swarm/agents/`.

```python
# backend/app/swarm/nodes/weather.py
import logging
from app.swarm.state import SwarmState

logger = logging.getLogger(__name__)

def weather_node(state: SwarmState) -> dict:
    logger.info("--- [PHASE: WEATHER] Fetching forecast ---")
    
    # Mocking weather fetch logic
    forecast = "Sunny, 25°C"
    
    # Return the dictionary representing the state update
    return {"weather_forecast": forecast}
```

## 3. Wire the Node into the Graph

Open `app/swarm/graph.py` to add your node to the workflow.

```python
# backend/app/swarm/graph.py
from langgraph.graph import StateGraph, START, END
from app.swarm.nodes.weather import weather_node

def create_swarm():
    workflow = StateGraph(SwarmState)
    
    # 1. Add existing nodes
    workflow.add_node("prompt_analyzer", prompt_analyzer_node)
    
    # 2. Add your new node
    workflow.add_node("weather", weather_node)
    
    # ...
    
    # 3. Update Edges
    workflow.add_edge("prompt_analyzer", "weather")
    workflow.add_edge("weather", "planner_scrape")
    
    return workflow.compile()
```

## 4. Update the WebSocket Stream (Optional)

If you want clients to see when your agent executes, update the WebSocket handler in `app/api/v1/websockets.py`.

```python
# backend/app/api/v1/websockets.py
async for chunk in graph.astream(initial_state, stream_mode="updates"):
    for node_name, state_update in chunk.items():
        # ... existing handlers
        
        elif node_name == "weather":
            forecast = state_update.get("weather_forecast", "")
            await websocket.send_json({
                "event": "FETCHING_WEATHER", 
                "status": "completed", 
                "data": forecast
            })
```

Your new `WeatherAgent` is now fully integrated into the swarm pipeline.
