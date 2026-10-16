from unittest.mock import AsyncMock, MagicMock
import pytest

from app.swarm.agents.ticket_parser import ticket_parser_node
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from app.infrastructure.swarm.swarm_session_adapter import SwarmSessionAdapter


@pytest.mark.asyncio
async def test_ticket_parser_success_and_event_loop_safety():
    """Verify ticket_parser_node successfully parses Budapest and doesn't crash across loops."""
    state = {
        "booking_text": (
            "Flight outbound MAD to BUD on 2026-10-23 10:00 arriving at 2026-10-23 13:00 (duration 180m). "
            "Flight return BUD to MAD on 2026-10-28 14:00 arriving at 2026-10-28 17:00 (duration 180m). "
            "Hotel Budapest Center booked in Budapest from 2026-10-23 to 2026-10-28."
        )
    }

    res1 = await ticket_parser_node(state)
    assert res1["booking_anchors"] is not None
    assert res1["booking_anchors"]["hotel"] is not None
    assert res1["booking_anchors"]["hotel"]["city"] == "Budapest"
    assert res1["booking_anchors"]["outbound_flight"]["destination_iata"] == "BUD"


@pytest.mark.asyncio
async def test_assemble_constraints_anchors_for_known_destination():
    """Verify assemble_constraints_node anchors hotel and flights if destination is known."""
    state = {
        "manual_constraints": {
            "origin_city": "Madrid",
            "destination_city": "Budapest",
            "start_date": "2026-10-23",
            "end_date": "2026-10-28",
            "budget_usd": 1500,
            "meals": ["LUNCH", "DINNER"],
        },
        "booking_anchors": None,
    }

    output = await assemble_constraints_node(state)
    assert "validated_itinerary" in output
    val = output["validated_itinerary"]
    assert val["destination_city"] == "Budapest"
    assert val["origin_city"] == "Madrid"
    assert val["booking_anchors"] is not None
    assert val["booking_anchors"]["hotel"] is not None
    assert val["booking_anchors"]["hotel"]["city"] == "Budapest"


@pytest.mark.asyncio
async def test_swarm_session_budapest_initial_state_and_pipeline():
    """Verify swarm session adapter produces mock booking text for Budapest and downstream nodes assemble it."""
    mock_graph = AsyncMock()
    captured_initial_state = {}

    async def mock_astream(input_data, *args, **kwargs):
        nonlocal captured_initial_state
        if isinstance(input_data, dict):
            captured_initial_state.update(input_data)
        yield {"ticket_parser": {"booking_anchors": None}}

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
        "destination_city": "Budapest",
        "start_date": "2026-10-23",
        "end_date": "2026-10-28",
    }

    async for _ in adapter.process_message(
        "chat", data, "trip to Budapest", "thread-buda-test"
    ):
        pass

    assert "booking_text" in captured_initial_state
    assert "BUD" in captured_initial_state["booking_text"]

    # Now verify ticket_parser parses this booking_text cleanly
    parser_output = await ticket_parser_node(captured_initial_state)
    assert parser_output["booking_anchors"] is not None
    assert parser_output["booking_anchors"]["hotel"]["city"] == "Budapest"

    # Now verify assemble_constraints assembles constraints with Budapest
    state_for_assemble = {**captured_initial_state, **parser_output}
    assembled = await assemble_constraints_node(state_for_assemble)
    val = assembled["validated_itinerary"]
    assert val["destination_city"] == "Budapest"
    assert val["origin_city"] == "Madrid"
    assert val["booking_anchors"]["hotel"]["city"] == "Budapest"
