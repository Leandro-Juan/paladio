import pytest
from app.swarm.agents.ticket_parser import ticket_parser_agent, ticket_parser_node
from pydantic_ai.models.test import TestModel


@pytest.mark.asyncio
async def test_ticket_parser_llm_execution():
    """Test the ticket parser agent with unstructured text using TestModel."""
    test_model = TestModel(
        custom_output_args={
            "outbound_flight": {
                "origin_iata": "JFK",
                "destination_iata": "LHR",
                "departure_time": "2026-10-10 17:00",
                "flight_duration_minutes": 420,
            },
            "return_flight": {
                "origin_iata": "LHR",
                "destination_iata": "JFK",
                "departure_time": "2026-10-20 09:00",
                "flight_duration_minutes": 480,
            },
            "hotel": {"name": "The Savoy hotel in London", "city": "London"},
        }
    )

    llm_booking_text = "I have a delta flight from JFK to LHR on Oct 10th 2026 at 5pm (duration 420m). Coming back from LHR to JFK on Oct 20th 2026 at 9am (duration 480m). Booked at the Savoy hotel in London."
    state = {"booking_text": llm_booking_text}

    with ticket_parser_agent.override(model=test_model):
        result = await ticket_parser_node(state)

    anchors = result.get("booking_anchors")
    assert anchors is not None
    assert anchors["outbound_flight"] is not None
    assert anchors["outbound_flight"]["origin_iata"] == "JFK"
    assert anchors["outbound_flight"]["destination_iata"] == "LHR"
    assert anchors["return_flight"] is not None
    assert anchors["hotel"] is not None
    assert "Savoy" in anchors["hotel"]["name"]
