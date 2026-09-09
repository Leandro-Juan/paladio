from unittest.mock import AsyncMock, MagicMock

import pytest
from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter


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
    assert events[0]["event"] == "STARTING_INFERENCE"
    assert events[1]["event"] == "PARSING_TICKETS"
    assert "ANALYZING_PROMPT" in event_names
    assert "SCRAPING_DYNAMIC_DATA" in event_names
    assert events[-1]["event"] == "DONE"
