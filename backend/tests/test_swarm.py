import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from langchain_core.messages import HumanMessage
from app.swarm.graph import graph
from app.swarm.agents.validator import validator_agent
from app.swarm.agents.router import RouterOutput
from pydantic_ai.models.test import TestModel

@pytest.fixture(autouse=True)
def mock_embeddings():
    """Mock out the LangChain Ollama embeddings and PGVector so tests don't require the LLM backend."""
    with patch('app.swarm.nodes.retriever.OllamaEmbeddings.aembed_query', return_value=[0.0] * 768):
        with patch('app.swarm.nodes.retriever.PGVector.asimilarity_search', return_value=[]):
            yield

@pytest.mark.asyncio
async def test_proactive_routing_schedules_alert():
    """Test that proactive intents are correctly routed to the alert node."""
    # Arrange
    config = {"configurable": {"thread_id": "test_1"}}
    state = {"messages": [HumanMessage(content="Set an alert for cheap flights to Tokyo")]}
    
    mock_router_result = MagicMock()
    mock_router_result.output = RouterOutput(intent='PROACTIVE_MONITORING')
    
    test_model = TestModel()
    
    # Act
    with patch('app.swarm.agents.router.router_agent.run', new_callable=AsyncMock, return_value=mock_router_result):
        with validator_agent.override(model=test_model):
            result = await graph.ainvoke(state, config)
    
    # Assert
    assert result.get("intent") == "PROACTIVE_MONITORING"
    assert "final_itinerary" in result
    assert result["final_itinerary"].get("status") == "Alert successfully scheduled."

@pytest.mark.asyncio
async def test_reactive_planning_generates_itinerary():
    """Test that reactive intents flow through RAG -> Validator -> Planner."""
    # Arrange
    config = {"configurable": {"thread_id": "test_2"}}
    state = {"messages": [HumanMessage(content="I want to go to Paris for 3 days with a budget of 1000 USD")]}
    
    mock_router_result = MagicMock()
    mock_router_result.output = RouterOutput(intent='REACTIVE_PLANNING')
    
    test_model = TestModel()
    
    # Act
    with patch('app.swarm.agents.router.router_agent.run', new_callable=AsyncMock, return_value=mock_router_result):
        with patch('app.swarm.graph.run_optimization', return_value={"path": [{"poi": {"name": "Base Hotel"}}]}) as mock_run_opt:
            with validator_agent.override(model=test_model):
                result = await graph.ainvoke(state, config)
        
    # Assert
    assert result.get("intent") == "REACTIVE_PLANNING"
    assert "retrieved_context" in result
    assert result.get("validated_itinerary") is not None
    assert result["validated_itinerary"].budget_usd is not None
