from unittest.mock import AsyncMock, MagicMock

import pytest
from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter


@pytest.mark.asyncio
async def test_swarm_session_maps_rag_event():
    mock_graph = AsyncMock()

    async def mock_astream(*args, **kwargs):
        yield {"rag": {"retrieved_context": "dummy"}}

    mock_graph.astream = mock_astream

    adapter = SwarmSessionAdapter(
        graph=mock_graph,
        engine=MagicMock(),
        ml_model=MagicMock(),
        ml_params=MagicMock(),
        user_repo=MagicMock(),
        travel_data_provider=MagicMock(),
    )

    events = []
    async for event in adapter.process_message("chat", {}, "hello", "thread-123"):
        events.append(event)

    assert events[0]["event"] == "STARTING_INFERENCE"
    assert events[1]["event"] == "PARSING_TICKETS"
    assert events[1]["status"] == "running"
    assert events[2]["event"] == "RETRIEVING_CONTEXT"
    assert events[2]["data"] == "dummy"
    assert events[3]["event"] == "SCRAPING_DYNAMIC_DATA"
    assert events[4]["event"] == "DONE"


@pytest.mark.asyncio
async def test_swarm_session_maps_prompt_analyzer_event():
    mock_graph = AsyncMock()

    async def mock_astream(*args, **kwargs):
        yield {"prompt_analyzer": {"prompt_analysis": {"mandatory_pois": ["Louvre"]}}}

    mock_graph.astream = mock_astream

    adapter = SwarmSessionAdapter(
        graph=mock_graph,
        engine=MagicMock(),
        ml_model=MagicMock(),
        ml_params=MagicMock(),
        user_repo=MagicMock(),
        travel_data_provider=MagicMock(),
    )

    events = []
    async for event in adapter.process_message("chat", {}, "hello", "thread-123"):
        events.append(event)

    event_names = [e["event"] for e in events]
    assert "ANALYZING_PROMPT" in event_names
    assert "RETRIEVING_CONTEXT" in event_names
