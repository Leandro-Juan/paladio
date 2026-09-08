import pytest
from unittest.mock import patch, MagicMock
from app.swarm.nodes.retriever import get_retriever, rag_node, _retrievers
from app.swarm.state import SwarmState
from app.schemas.rag_schema import RAGPromptAnalysis


@pytest.fixture(autouse=True)
def clear_retrievers():
    _retrievers.clear()
    yield
    _retrievers.clear()


@patch("app.swarm.nodes.retriever.PGVector")
def test_get_retriever_dynamic_collection(mock_pgvector):
    mock_instance = MagicMock()
    mock_instance.as_retriever.return_value = "mocked_retriever"
    mock_pgvector.return_value = mock_instance

    retriever_paris = get_retriever("Paris")

    assert retriever_paris == "mocked_retriever"
    mock_pgvector.assert_called_once()
    _, kwargs = mock_pgvector.call_args
    assert kwargs["collection_name"] == "paris_pois"


@pytest.mark.asyncio
@patch("app.swarm.nodes.retriever.rag_analysis_agent")
@patch("app.swarm.nodes.retriever.get_retriever")
async def test_rag_node_extracts_city_and_prompt_preferences(
    mock_get_retriever, mock_agent
):
    mock_retriever = MagicMock()

    class MockDoc:
        def __init__(self, content):
            self.page_content = content

    mock_retriever.invoke.return_value = [MockDoc("Eiffel Tower is nice.")]
    mock_get_retriever.return_value = mock_retriever

    from unittest.mock import AsyncMock

    mock_run_result = MagicMock()
    mock_run_result.output = RAGPromptAnalysis(
        mandatory_pois=["Louvre Museum"],
        preferred_cuisines=["french"],
        travel_tastes=["art"],
        cuisine_target_frequency=1,
    )
    mock_agent.run = AsyncMock(return_value=mock_run_result)

    state: SwarmState = {
        "messages": [
            MagicMock(content="I need to visit Louvre Museum. i love french cuisine")
        ],
        "validated_itinerary": {"destination_city": "Paris"},
        "retrieved_context": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
        "booking_text": None,
        "booking_anchors": None,
    }

    result = await rag_node(state)

    assert "Eiffel Tower is nice." in result["retrieved_context"]
    assert "validated_itinerary" in result
    val_it = result["validated_itinerary"]
    assert any(
        n["poi_id"] == "Louvre Museum" and n["mandatory"] for n in val_it["nodes"]
    )
    assert "french" in val_it["preferred_cuisines"]
    assert "art" in val_it["travel_tastes"]
    mock_get_retriever.assert_called_once_with("Paris")


@pytest.mark.asyncio
@patch("app.swarm.nodes.retriever.rag_analysis_agent")
@patch("app.swarm.nodes.retriever.get_retriever")
async def test_rag_node_no_city(mock_get_retriever, mock_agent):
    from unittest.mock import AsyncMock

    mock_run_result = MagicMock()
    mock_run_result.output = RAGPromptAnalysis()
    mock_agent.run = AsyncMock(return_value=mock_run_result)

    state: SwarmState = {
        "messages": [MagicMock(content="I want to go somewhere")],
        "validated_itinerary": {},
        "retrieved_context": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
        "booking_text": None,
        "booking_anchors": None,
    }

    result = await rag_node(state)

    assert result["retrieved_context"] == ""
    mock_get_retriever.assert_not_called()
