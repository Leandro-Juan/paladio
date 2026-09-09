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


@pytest.mark.asyncio
async def test_swarm_session_auto_generates_mock_tickets_in_test_mode():
    mock_graph = AsyncMock()
    captured_input = None

    async def mock_astream(input_data, *args, **kwargs):
        nonlocal captured_input
        captured_input = input_data
        yield {"check_missing": {}}

    mock_graph.astream = mock_astream

    adapter = SwarmSessionAdapter(
        graph=mock_graph,
        engine=MagicMock(),
        ml_model=MagicMock(),
        ml_params=MagicMock(),
        user_repo=MagicMock(),
        travel_data_provider=MagicMock(),
    )

    data = {
        "test_mode": True,
        "origin_city": "Madrid",
        "destination_city": "Paris",
        "budget_usd": 2000.0,
        "meals": [
            {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:30"},
            {"meal_type": "DINNER", "start_time": "19:30", "end_time": "22:00"},
        ],
    }

    events = []
    async for event in adapter.process_message(
        "chat", data, "Visit Louvre and Eiffel Tower", "thread-test-1"
    ):
        events.append(event)

    assert captured_input is not None
    assert "MAD" in captured_input["booking_text"]
    assert "CDG" in captured_input["booking_text"]
    assert "Paris" in captured_input["booking_text"]
    assert captured_input.get("booking_anchors") is None
    assert captured_input["manual_constraints"]["budget_usd"] == 2000.0
    assert len(captured_input["manual_constraints"]["meals"]) == 2
