import pytest
from langchain_core.messages import HumanMessage
from app.swarm.graph import swarm
from app.swarm.agents.validator import validator_agent
from pydantic_ai.models.test import TestModel

@pytest.mark.asyncio
async def test_proactive_routing():
    config = {"configurable": {"thread_id": "test_1"}}
    state = {"messages": [HumanMessage(content="Set an alert for cheap flights to Tokyo")]}
    
    result = await swarm.ainvoke(state, config)
    
    assert result["intent"] == "PROACTIVE_MONITORING"
    # Since proactive routing ends early, it shouldn't have validated_itinerary
    assert result.get("validated_itinerary") is None

@pytest.mark.asyncio
async def test_reactive_planning_and_validation():
    config = {"configurable": {"thread_id": "test_2"}}
    state = {"messages": [HumanMessage(content="I want to go to Paris for 3 days with a budget of 1000 USD")]}
    
    # We use TestModel to mock the Pydantic AI agent inside the swarm, ensuring deterministic outputs without LLM
    m = TestModel()
    
    with validator_agent.override(model=m):
        result = await swarm.ainvoke(state, config)
        
    assert result["intent"] == "REACTIVE_PLANNING"
    assert "retrieved_context" in result
    assert result["validated_itinerary"] is not None
    # TestModel automatically generates valid structured data based on the schema
    assert result["validated_itinerary"].budget_usd is not None
