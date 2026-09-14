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


@pytest.mark.asyncio
async def test_swarm_session_feedback_routes_8d_and_synthesizes_768d():
    import numpy as np

    mock_user_repo = AsyncMock()
    mock_user_repo.get_by_id = AsyncMock(return_value=None)
    mock_user_repo.get_embedding = AsyncMock(return_value=None)
    mock_user_repo.update_preferences = AsyncMock()
    mock_user_repo.save_embedding = AsyncMock()

    mock_ml_model = MagicMock()
    # update_user returns 8D tag weights
    mock_ml_model.update_user = MagicMock(
        return_value=np.array(
            [0.7, 0.6, 0.5, 0.4, 0.8, 0.3, 0.2, 0.9], dtype=np.float32
        )
    )

    adapter = SwarmSessionAdapter(
        graph=AsyncMock(),
        engine=MagicMock(),
        ml_model=mock_ml_model,
        ml_params=MagicMock(),
        user_repo=mock_user_repo,
        travel_data_provider=MagicMock(),
    )

    poi_data = {
        "name": "Prado Museum",
        "category": "museum",
        "description": "Art gallery",
    }
    feedback_data = {
        "poi": poi_data,
        "target_score": 90.0,
        "user_id": "test_user_42",
    }

    events = []
    async for event in adapter.process_message(
        "feedback", feedback_data, "", "thread-fb-1"
    ):
        events.append(event)

    assert len(events) == 1
    assert events[0]["event"] == "FEEDBACK_PROCESSED"

    # Verify update_preferences was called with tag_affinities
    assert mock_user_repo.update_preferences.called
    user_id_arg, pref_arg = mock_user_repo.update_preferences.call_args[0]
    assert user_id_arg == "test_user_42"
    assert "tag_affinities" in pref_arg
    assert len(pref_arg["tag_affinities"]) == 8

    # Verify save_embedding was called with a 768-dimensional synthesized vector
    assert mock_user_repo.save_embedding.called
    save_uid, save_emb = mock_user_repo.save_embedding.call_args[0]
    assert save_uid == "test_user_42"
    assert len(save_emb) == 768
    assert all(isinstance(x, float) for x in save_emb)
