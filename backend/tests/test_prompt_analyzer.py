import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.swarm.agents.prompt_analyzer import prompt_analyzer_node
from app.swarm.state import SwarmState
from app.schemas.rag_schema import RAGPromptAnalysis


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
@patch("app.swarm.agents.prompt_analyzer.prompt_analysis_agent")
async def test_prompt_analyzer_node_agent_failure_fallback(mock_agent):
    mock_agent.run = AsyncMock(side_effect=RuntimeError("LLM connection error"))

    state: SwarmState = {
        "messages": [MagicMock(content="Some user trip message")],
        "validated_itinerary": {"destination_city": "Rome"},
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
    assert result["validated_itinerary"]["destination_city"] == "Rome"


@pytest.mark.asyncio
@patch("app.swarm.agents.prompt_analyzer.prompt_analysis_agent")
async def test_prompt_analyzer_filters_cross_city_hallucinations(mock_agent):
    mock_run_result = MagicMock()
    mock_run_result.output = RAGPromptAnalysis(
        mandatory_pois=["MoMA", "Museo del Prado"],
        preferred_cuisines=["tapas"],
        travel_tastes=["art"],
        tag_affinities={"art_culture": 0.9},
        cuisine_target_frequency=1,
    )
    mock_agent.run = AsyncMock(return_value=mock_run_result)

    state: SwarmState = {
        "messages": [MagicMock(content="We love modern art and museums in Madrid")],
        "validated_itinerary": {"destination_city": "Madrid"},
        "destination_city": "Madrid",
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
    val_it = result["validated_itinerary"]
    # MoMA should be filtered out because destination is Madrid
    assert not any(n["poi_id"] == "MoMA" for n in val_it.get("nodes", []))
    assert any(n["poi_id"] == "Museo del Prado" for n in val_it.get("nodes", []))
    assert result["prompt_analysis"]["mandatory_pois"] == ["Museo del Prado"]
