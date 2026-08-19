import pytest
from unittest.mock import patch
from langchain_core.messages import HumanMessage
from app.swarm.graph import graph
from app.swarm.agents.validator import validator_node
from app.swarm.agents.validator import validator_agent
from app.swarm.agents.router import RouterOutput
from pydantic_ai.models.test import TestModel
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture(autouse=True)
def mock_rag_node():
    # Patch the rag_node so it doesn't attempt to load nomic-embed-text via Ollama
    with patch('app.swarm.graph.rag_node', return_value={"retrieved_context": "Mocked context", "error_count": 0}) as m:
        # Since graph is already compiled, patching the import might not affect the compiled graph directly,
        # but actually LangGraph nodes are functions wrapped in Runnables.
        # A better way is to just patch the ainvoke of the graph for the specific nodes or mock the RAG logic inside.
        # But since we just want to bypass the actual embeddings in test, let's patch the embeddings directly:
        pass
    yield

@pytest.fixture(autouse=True)
def mock_embeddings():
    with patch('app.swarm.nodes.retriever.OllamaEmbeddings.aembed_query', return_value=[0.0] * 768):
        # We also need to mock the vector store search
        with patch('app.swarm.nodes.retriever.PGVector.asimilarity_search', return_value=[]):
            yield

@pytest.mark.asyncio
async def test_proactive_routing():
    config = {"configurable": {"thread_id": "test_1"}}
    state = {"messages": [HumanMessage(content="Set an alert for cheap flights to Tokyo")]}
    
    m = TestModel()
    
    mock_result = MagicMock()
    mock_result.output = RouterOutput(intent='PROACTIVE_MONITORING')
    
    with patch('app.swarm.agents.router.router_agent.run', new_callable=AsyncMock, return_value=mock_result):
        with validator_agent.override(model=m):
            result = await graph.ainvoke(state, config)
    
    assert "intent" in result
    assert result["intent"] == "PROACTIVE_MONITORING"
    assert "final_itinerary" in result
    assert result["final_itinerary"].get("status") == "Alert successfully scheduled."

@pytest.mark.asyncio
async def test_reactive_planning_and_validation():
    config = {"configurable": {"thread_id": "test_2"}}
    state = {"messages": [HumanMessage(content="I want to go to Paris for 3 days with a budget of 1000 USD")]}
    
    m = TestModel()
    
    mock_result = MagicMock()
    mock_result.output = RouterOutput(intent='REACTIVE_PLANNING')
    
    with patch('app.swarm.agents.router.router_agent.run', new_callable=AsyncMock, return_value=mock_result):
        with patch('app.swarm.graph.run_optimization', return_value={"path": [{"poi": {"name": "Base Hotel"}}]}) as mock_run_opt:
            with validator_agent.override(model=m):
                result = await graph.ainvoke(state, config)
        
    assert result["intent"] == "REACTIVE_PLANNING"
    assert "retrieved_context" in result
    assert result["validated_itinerary"] is not None
    assert result["validated_itinerary"].budget_usd is not None
