import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.swarm.nodes.retriever import get_retriever, rag_node, _retrievers
from app.swarm.agents.prompt_analyzer import prompt_analyzer_node
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
@patch("app.swarm.agents.prompt_analyzer.prompt_analysis_agent")
async def test_prompt_analyzer_node_extracts_preferences(mock_agent):
    mock_run_result = MagicMock()
    mock_run_result.output = RAGPromptAnalysis(
        mandatory_pois=["Louvre Museum"],
        preferred_cuisines=["french"],
        travel_tastes=["art"],
        tag_affinities={"art_culture": 0.95},
        cuisine_target_frequency=2,
    )
    mock_agent.run = AsyncMock(return_value=mock_run_result)

    state: SwarmState = {
        "messages": [
            MagicMock(
                content="I need to visit Louvre Museum. I love french cuisine and art."
            )
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
        "manual_constraints": None,
        "prompt_analysis": None,
    }

    result = await prompt_analyzer_node(state)

    assert "validated_itinerary" in result
    assert "prompt_analysis" in result
    val_it = result["validated_itinerary"]
    assert any(
        n["poi_id"] == "Louvre Museum" and n["mandatory"] for n in val_it["nodes"]
    )
    assert "french" in val_it["preferred_cuisines"]
    assert "art" in val_it["travel_tastes"]
    assert val_it["tag_affinities"]["art_culture"] == 0.95
    assert val_it["cuisine_target_frequency"] == 2
    assert result["prompt_analysis"]["mandatory_pois"] == ["Louvre Museum"]


@pytest.mark.asyncio
@patch("app.swarm.agents.prompt_analyzer.prompt_analysis_agent")
async def test_prompt_analyzer_node_empty_prompt(mock_agent):
    state: SwarmState = {
        "messages": [],
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
        "manual_constraints": None,
        "prompt_analysis": None,
    }

    result = await prompt_analyzer_node(state)
    assert "validated_itinerary" in result
    assert "prompt_analysis" in result
    mock_agent.run.assert_not_called()


@pytest.mark.asyncio
@patch("app.swarm.nodes.retriever.get_retriever")
async def test_rag_node_retrieves_context_with_prompt_analysis(mock_get_retriever):
    mock_retriever = MagicMock()

    class MockDoc:
        def __init__(self, content):
            self.page_content = content

    mock_retriever.invoke.return_value = [MockDoc("Eiffel Tower is nice.")]
    mock_get_retriever.return_value = mock_retriever

    state: SwarmState = {
        "messages": [MagicMock(content="Irrelevant raw text")],
        "validated_itinerary": {"destination_city": "Paris"},
        "prompt_analysis": {
            "mandatory_pois": ["Louvre Museum"],
            "preferred_cuisines": ["french"],
            "travel_tastes": ["art"],
        },
        "retrieved_context": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
        "booking_text": None,
        "booking_anchors": None,
        "manual_constraints": None,
    }

    result = await rag_node(state)

    assert "Eiffel Tower is nice." in result["retrieved_context"]
    mock_get_retriever.assert_called_once_with("Paris")
    mock_retriever.invoke.assert_called_once_with("Louvre Museum french art")


@pytest.mark.asyncio
@patch("app.swarm.nodes.retriever.get_retriever")
async def test_rag_node_no_destination_city(mock_get_retriever):
    state: SwarmState = {
        "messages": [MagicMock(content="I want to go somewhere")],
        "validated_itinerary": {},
        "prompt_analysis": None,
        "retrieved_context": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
        "booking_text": None,
        "booking_anchors": None,
        "manual_constraints": None,
    }

    result = await rag_node(state)

    assert result["retrieved_context"] == ""
    mock_get_retriever.assert_not_called()
