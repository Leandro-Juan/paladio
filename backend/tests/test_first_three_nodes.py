from datetime import date
import pytest
from app.schemas.itinerary import TravelConstraints
from app.swarm.agents.ticket_parser import ticket_parser_agent, ticket_parser_node
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from app.swarm.nodes.verify_constraints import verify_constraints_node
from app.swarm.nodes.guardrails import guardrails_node
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
async def test_post_parser_nodes_pipeline(mock_ticket_parser):
    """
    Test the post-parser pipeline:
      1. ticket_parser: parses raw booking text into BookingAnchors
      2. assemble_constraints: deterministically derives cities, dates, budget, meals
      3. verify_constraints: human-in-the-loop review and validation
      4. guardrails: evaluates hard logic rules and schedule overlap
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
            "test_mode": True,
            "budget_usd": 3000.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:30", "end_time": "14:30"},
                {"meal_type": "DINNER", "start_time": "20:00", "end_time": "22:30"},
            ],
        },
        "messages": [],
        "validated_itinerary": None,
        "error_count": 0,
        "final_itinerary": None,
        "test_data": None,
        "daily_pois_data": None,
        "outbound_flight": None,
        "return_flight": None,
        "guardrail_status": None,
        "guardrail_errors": None,
    }

    # Node 1: Ticket Parser
    ticket_output = await ticket_parser_node(state)
    assert ticket_output.get("booking_anchors") is not None
    state["booking_anchors"] = ticket_output["booking_anchors"]

    # Node 2: Assemble Constraints
    assemble_output = await assemble_constraints_node(state)
    assert assemble_output.get("validated_itinerary") is not None
    state["validated_itinerary"] = assemble_output["validated_itinerary"]

    # Node 3: Verify Constraints (raises GraphInterrupt for normal Human-In-The-Loop review)
    from langgraph.errors import GraphInterrupt

    with pytest.raises((GraphInterrupt, RuntimeError)):
        await verify_constraints_node(state)

    # Ensure verification_completed alone does NOT bypass confirmation (human review is always mandatory)
    state_with_old_verif = dict(state)
    state_with_old_verif["verification_completed"] = True
    with pytest.raises((GraphInterrupt, RuntimeError)):
        await verify_constraints_node(state_with_old_verif)

    # Only when auto_verify is explicitly True for headless test harnesses, it proceeds
    state["auto_verify"] = True
    verify_output = await verify_constraints_node(state)
    assert verify_output.get("verification_completed") is True
    assert verify_output.get("validated_itinerary") is not None
    state["validated_itinerary"] = verify_output["validated_itinerary"]

    # Node 4: Guardrails Node
    guardrail_output = await guardrails_node(state)
    assert guardrail_output.get("guardrail_status") == "PROCEED"
    assert guardrail_output.get("guardrail_errors") == []

    # Verify the produced constraints object
    raw_constraints = state["validated_itinerary"]
    constraints = TravelConstraints(**raw_constraints)

    assert constraints.destination_city == "Paris"
    assert constraints.origin_city == "New York"
    assert constraints.start_date == date(2026, 10, 10)
    assert constraints.end_date == date(2026, 10, 15)
    assert constraints.budget_usd == 3000.0
    assert len(constraints.meals) == 2


@pytest.mark.asyncio
async def test_guardrails_hard_errors():
    """Verify that hard guardrail violations result in ABORT status."""
    base_constraints = {
        "destination_city": "Paris",
        "origin_city": "New York",
        "start_date": "2026-10-10",
        "end_date": "2026-10-15",
        "budget_usd": 1500.0,
        "meals": [
            {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:00"},
            {"meal_type": "DINNER", "start_time": "20:00", "end_time": "22:00"},
        ],
    }

    # 1. Past departure date
    past_state: SwarmState = {
        "validated_itinerary": {**base_constraints, "start_date": "2020-01-01"},
    }
    res_past = await guardrails_node(past_state)
    assert res_past["guardrail_status"] == "ABORT"
    assert any("past" in err for err in res_past["guardrail_errors"])

    # 2. Return before departure
    inverted_state: SwarmState = {
        "validated_itinerary": {
            **base_constraints,
            "start_date": "2026-10-15",
            "end_date": "2026-10-10",
        },
    }
    res_inv = await guardrails_node(inverted_state)
    assert res_inv["guardrail_status"] == "ABORT"
    assert any("before departure" in err for err in res_inv["guardrail_errors"])

    # 3. Origin city == Destination city
    same_city_state: SwarmState = {
        "validated_itinerary": {
            **base_constraints,
            "origin_city": "Paris",
            "destination_city": "Paris",
        },
    }
    res_same = await guardrails_node(same_city_state)
    assert res_same["guardrail_status"] == "ABORT"
    assert any("same as destination" in err for err in res_same["guardrail_errors"])

    # 4. Duration > 30 days
    long_state: SwarmState = {
        "validated_itinerary": {
            **base_constraints,
            "start_date": "2026-10-01",
            "end_date": "2026-11-15",
        },
    }
    res_long = await guardrails_node(long_state)
    assert res_long["guardrail_status"] == "ABORT"
    assert any(
        "exceeds maximum limit of 30 days" in err
        for err in res_long["guardrail_errors"]
    )


@pytest.mark.asyncio
async def test_subgraph_execution(mock_ticket_parser):
    """
    Test compiling and running the post-parser subgraph as a LangGraph StateGraph:
    Flow: START -> ticket_parser -> assemble_constraints -> verify_constraints -> guardrails -> END
    """
    subgraph = StateGraph(SwarmState)
    subgraph.add_node("ticket_parser", ticket_parser_node)
    subgraph.add_node("assemble_constraints", assemble_constraints_node)
    subgraph.add_node("verify_constraints", verify_constraints_node)
    subgraph.add_node("guardrails", guardrails_node)

    subgraph.add_edge(START, "ticket_parser")
    subgraph.add_edge("ticket_parser", "assemble_constraints")
    subgraph.add_edge("assemble_constraints", "verify_constraints")
    subgraph.add_edge("verify_constraints", "guardrails")
    subgraph.add_edge("guardrails", END)

    compiled = subgraph.compile()

    state = {
        "booking_text": "Flight from MAD to FCO on 2026-11-01. Return 2026-11-05. Hotel Hassler in Rome.",
        "manual_constraints": {
            "test_mode": True,
            "budget_usd": 2000.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:00"},
                {"meal_type": "DINNER", "start_time": "19:30", "end_time": "22:00"},
            ],
        },
        "messages": [],
        "auto_verify": True,
    }

    result = await compiled.ainvoke(state)

    assert "validated_itinerary" in result
    assert result.get("guardrail_status") == "PROCEED"
    constraints = TravelConstraints(**result["validated_itinerary"])

    assert constraints.destination_city == "Paris"
    assert constraints.origin_city == "New York"
    assert constraints.budget_usd == 2000.0
    assert len(constraints.meals) == 2
