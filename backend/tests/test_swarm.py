from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.swarm.agents.validator import validator_agent
from app.swarm.graph import graph
from langchain_core.messages import HumanMessage
from pydantic_ai.models.test import TestModel


@pytest.fixture(autouse=True)
def mock_embeddings():
    """Mock out the LangChain Ollama embeddings and PGVector so tests don't require the LLM backend."""
    with patch(
        "app.swarm.nodes.retriever.OllamaEmbeddings.aembed_query",
        return_value=[0.0] * 768,
    ), patch("app.swarm.nodes.retriever.PGVector.asimilarity_search", return_value=[]):
        yield


@pytest.mark.asyncio
async def test_reactive_planning_generates_itinerary():
    """Test that reactive intents flow through RAG -> Validator -> Planner."""
    # Arrange
    config = {
        "configurable": {
            "thread_id": "test_2",
            "engine": MagicMock(),
            "travel_data_provider": MagicMock(),
        }
    }
    state = {
        "messages": [
            HumanMessage(
                content="I want to go to Paris for 3 days with a budget of 1000 USD"
            )
        ]
    }

    test_model = TestModel()

    # Act
    with patch(
        "app.use_cases.optimize_daily_itinerary.OptimizeDailyItineraryUseCase.execute",
        new_callable=AsyncMock,
        return_value={
            "days": [
                {"day": 1, "itinerary": {"path": [{"poi": {"name": "Base Hotel"}}]}}
            ]
        },
    ), validator_agent.override(model=test_model):
        result = await graph.ainvoke(state, config)

    # Assert
    assert "retrieved_context" in result
    assert result.get("validated_itinerary") is not None
    assert result["validated_itinerary"].get("budget_usd") is not None
