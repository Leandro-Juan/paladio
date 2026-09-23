# How-To: Add a Custom LangGraph Agent

This guide demonstrates how to extend Paladio's **LangGraph StateGraph** by adding a new specialized AI agent (e.g., a *Weather Advisory Agent* or *Dietary Restriction Agent*) with strict Pydantic AI guardrails.

---

## 1. Step 1: Extend the Shared State Schema (`SwarmState`)

All agents communicate across a central, typed state bus defined in `backend/app/swarm/state.py`. To allow your new agent to read and write data, add a new field to `SwarmState`:

```python
# backend/app/swarm/state.py
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

class SwarmState(TypedDict):
    messages: Annotated[list, add_messages]
    validated_itinerary: dict | None
    booking_anchors: dict | None
    prompt_analysis: dict | None
    daily_pois_data: list | None
    final_itinerary: dict | None
    # NEW FIELD:
    weather_advisory: dict | None
```

---

## 2. Step 2: Define the Pydantic AI Agent

Create your new agent in `backend/app/swarm/agents/weather_advisory.py`. Use **Pydantic AI** with an explicit output type model to eliminate JSON parsing errors:

```python
# backend/app/swarm/agents/weather_advisory.py
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from app.swarm.agents.prompt_analyzer import get_prompt_model

class WeatherForecast(BaseModel):
    is_rainy: bool = Field(description="True if significant precipitation is expected")
    indoor_bias: float = Field(default=0.5, ge=0.0, le=1.0, description="Preference for indoor venues")
    advisory_notes: str = Field(description="Summary of weather precautions")

weather_agent = Agent(
    name="weather_advisory",
    output_type=WeatherForecast,
    retries=2,
    instructions=(
        "You analyze destination city weather patterns for given trip dates. "
        "Recommend whether travelers should bias towards indoor museums or outdoor parks."
    ),
)

async def weather_advisory_node(state: dict) -> dict:
    constraints = state.get("validated_itinerary", {})
    city = constraints.get("destination_city", "Unknown")
    
    model = get_prompt_model()
    try:
        res = await weather_agent.run(f"Destination: {city}", model=model)
        output = res.output
    except Exception:
        output = WeatherForecast(is_rainy=False, indoor_bias=0.5, advisory_notes="Normal conditions")

    return {"weather_advisory": output.model_dump(mode="json")}
```

---

## 3. Step 3: Wire the Node into the StateGraph

In `backend/app/swarm/graph.py`, import the node and connect it into the workflow graph:

```python
# backend/app/swarm/graph.py
from app.swarm.agents.weather_advisory import weather_advisory_node

def create_swarm():
    workflow = StateGraph(SwarmState)
    
    # 1. Register Nodes
    workflow.add_node("ticket_parser", ticket_parser_node)
    workflow.add_node("assemble_constraints", assemble_constraints_node)
    workflow.add_node("check_missing", check_missing_fields_node)
    workflow.add_node("prompt_analyzer", prompt_analyzer_node)
    workflow.add_node("weather_advisory", weather_advisory_node)  # <-- Register node
    workflow.add_node("planner_scrape", planner_scrape_node)
    workflow.add_node("planner_optimize", planner_optimize_node)

    # 2. Wire Edges
    workflow.add_edge(START, "ticket_parser")
    workflow.add_edge("ticket_parser", "assemble_constraints")
    workflow.add_edge("assemble_constraints", "check_missing")
    workflow.add_edge("check_missing", "prompt_analyzer")
    workflow.add_edge("prompt_analyzer", "weather_advisory")      # <-- Connect incoming
    workflow.add_edge("weather_advisory", "planner_scrape")       # <-- Connect outgoing
    workflow.add_edge("planner_scrape", "planner_optimize")
    workflow.add_edge("planner_optimize", END)

    return workflow.compile(checkpointer=MemorySaver())
```

---

## 4. Verification

Test the newly wired agent by executing the test suite:

```bash
pytest backend/tests/test_swarm.py
```
