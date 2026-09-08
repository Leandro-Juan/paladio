from datetime import date
import pytest
from app.schemas.itinerary import TravelConstraints
from app.swarm.agents.ticket_parser import ticket_parser_agent, ticket_parser_node
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from app.swarm.graph import check_missing_fields_node
from app.swarm.state import SwarmState
from langgraph.graph import END, START, StateGraph
from pydantic_ai.models.test import TestModel


@pytest.fixture
def mock_ticket_parser():
    """Mock the ticket parser LLM agent using Pydantic AI's TestModel."""
    test_model = TestModel(
        custom_output_args={
            "outbound_flight": {
                "origin_iata": "JFK",
                "destination_iata": "CDG",
                "departure_time": "2026-10-10 10:00",
                "flight_duration_minutes": 420,
                "airline": "Air France",
                "flight_number": "AF007",
            },
            "return_flight": {
                "origin_iata": "CDG",
                "destination_iata": "JFK",
                "departure_time": "2026-10-15 14:00",
                "flight_duration_minutes": 480,
                "airline": "Air France",
                "flight_number": "AF008",
            },
            "hotel": {
                "name": "Hotel Plaza Athenee",
                "address": "25 Avenue Montaigne, 75008 Paris",
                "city": "Paris",
                "check_in_date": "2026-10-10",
                "check_out_date": "2026-10-15",
            },
        }
    )
    with ticket_parser_agent.override(model=test_model):
        yield


@pytest.mark.asyncio
async def test_first_three_nodes_pipeline(mock_ticket_parser):
    """
    Test the first 3 nodes of the graph:
      1. ticket_parser: parses raw booking text into BookingAnchors
      2. assemble_constraints: deterministically derives cities, dates, budget, meals
      3. check_missing: validates all required constraints are satisfied without interrupts
    Verifies that the final output is a valid, sensible TravelConstraints object.
    """
    raw_booking_text = (
        "Flight AF007 from JFK to CDG departing 2026-10-10 10:00. "
        "Flight AF008 return from CDG to JFK departing 2026-10-15 14:00. "
        "Hotel Plaza Athenee booked in Paris from 2026-10-10 to 2026-10-15."
    )

    state: SwarmState = {
        "booking_text": raw_booking_text,
        "booking_anchors": None,
        "manual_constraints": {
            "budget_usd": 3000.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:30", "end_time": "14:30"},
                {"meal_type": "DINNER", "start_time": "20:00", "end_time": "22:30"},
            ],
        },
        "messages": [],
        "retrieved_context": None,
        "validated_itinerary": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
    }

    # Node 1: Ticket Parser
    ticket_output = await ticket_parser_node(state)
    assert ticket_output.get("booking_anchors") is not None
    state["booking_anchors"] = ticket_output["booking_anchors"]

    # Node 2: Assemble Constraints
    assemble_output = await assemble_constraints_node(state)
    assert assemble_output.get("validated_itinerary") is not None
    state["validated_itinerary"] = assemble_output["validated_itinerary"]

    # Node 3: Check Missing Fields
    missing_output = await check_missing_fields_node(state)
    # Since all fields are present, no interrupt is raised and it returns {}
    assert missing_output == {}

    # Verify the produced constraints object
    raw_constraints = state["validated_itinerary"]
    constraints = TravelConstraints(**raw_constraints)

    # --- Verification of TravelConstraints ---
    # 1. Destination & Origin City
    assert constraints.destination_city == "Paris"  # Strictly the hotel's city
    assert constraints.origin_city == "New York"  # Derived from JFK IATA code

    # 2. Calendar Dates & Duration
    assert constraints.start_date == date(2026, 10, 10)
    assert constraints.end_date == date(2026, 10, 15)
    duration_days = (constraints.end_date - constraints.start_date).days
    assert duration_days == 5

    # 3. Strict Financial Budget ($ USD)
    assert constraints.budget_usd == 3000.0

    # 4. Booking Anchors (Flights & Hotel)
    assert constraints.booking_anchors is not None
    assert constraints.booking_anchors.outbound_flight.origin_iata == "JFK"
    assert constraints.booking_anchors.outbound_flight.destination_iata == "CDG"
    assert constraints.booking_anchors.return_flight.origin_iata == "CDG"
    assert constraints.booking_anchors.return_flight.destination_iata == "JFK"
    assert constraints.booking_anchors.hotel.name == "Hotel Plaza Athenee"
    assert constraints.booking_anchors.hotel.city == "Paris"

    # 5. Meal Requirements
    assert len(constraints.meals) == 2
    meal_types = [m.meal_type for m in constraints.meals]
    assert "LUNCH" in meal_types
    assert "DINNER" in meal_types


@pytest.mark.asyncio
async def test_first_three_nodes_subgraph_execution(mock_ticket_parser):
    """
    Test compiling and running the first 3 nodes as a LangGraph StateGraph.
    Flow: START -> ticket_parser -> assemble_constraints -> check_missing -> END
    """
    subgraph = StateGraph(SwarmState)
    subgraph.add_node("ticket_parser", ticket_parser_node)
    subgraph.add_node("assemble_constraints", assemble_constraints_node)
    subgraph.add_node("check_missing", check_missing_fields_node)

    subgraph.add_edge(START, "ticket_parser")
    subgraph.add_edge("ticket_parser", "assemble_constraints")
    subgraph.add_edge("assemble_constraints", "check_missing")
    subgraph.add_edge("check_missing", END)

    compiled = subgraph.compile()

    state = {
        "booking_text": "Flight from MAD to FCO on 2026-11-01. Return 2026-11-05. Hotel Hassler in Rome.",
        "manual_constraints": {
            "budget_usd": 2000.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:00"},
                {"meal_type": "DINNER", "start_time": "19:30", "end_time": "22:00"},
            ],
        },
        "messages": [],
    }

    result = await compiled.ainvoke(state)

    assert "validated_itinerary" in result
    constraints = TravelConstraints(**result["validated_itinerary"])

    assert constraints.destination_city == "Paris"  # From mock ticket parser hotel.city
    assert constraints.origin_city == "New York"
    assert constraints.budget_usd == 2000.0
    assert len(constraints.meals) == 2
    assert constraints.booking_anchors.hotel.name == "Hotel Plaza Athenee"
