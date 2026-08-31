import pytest
from unittest.mock import patch, MagicMock
from app.swarm.nodes.retriever import get_retriever, rag_node, _retrievers
from app.swarm.state import SwarmState


@pytest.fixture(autouse=True)
def clear_retrievers():
    _retrievers.clear()
    yield
    _retrievers.clear()


@patch("app.swarm.nodes.retriever.PGVector")
def test_get_retriever_dynamic_collection(mock_pgvector):
    # Setup mock
    mock_instance = MagicMock()
    mock_instance.as_retriever.return_value = "mocked_retriever"
    mock_pgvector.return_value = mock_instance

    # Act
    retriever_paris = get_retriever("Paris")

    # Assert
    assert retriever_paris == "mocked_retriever"
    mock_pgvector.assert_called_once()

    # Check the args it was called with
    _, kwargs = mock_pgvector.call_args
    assert kwargs["collection_name"] == "paris_pois"


@pytest.mark.asyncio
@patch("app.swarm.nodes.retriever.get_retriever")
async def test_rag_node_extracts_city(mock_get_retriever):
    mock_retriever = MagicMock()

    # Mock the invoke call which usually returns documents
    class MockDoc:
        def __init__(self, content):
            self.page_content = content

    mock_retriever.invoke.return_value = [MockDoc("Eiffel Tower is nice.")]
    mock_get_retriever.return_value = mock_retriever

    state: SwarmState = {
        "messages": [MagicMock(content="I want to go to Paris")],
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
    mock_get_retriever.assert_called_once_with("Paris")


@pytest.mark.asyncio
@patch("app.swarm.nodes.retriever.get_retriever")
async def test_rag_node_no_city(mock_get_retriever):
    state: SwarmState = {
        "messages": [MagicMock(content="I want to go somewhere")],
        "validated_itinerary": {},  # No city yet
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
