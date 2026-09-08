import pytest
from app.schemas.itinerary import (
    BookingAnchors,
    FlightSegment,
    HotelAnchor,
)
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from langchain_core.messages import HumanMessage


@pytest.mark.asyncio
async def test_assemble_constraints_from_tickets_and_manual():
    """
    Test deterministic constraint assembly:
    - Origin city from outbound flight IATA
    - Destination city strictly from hotel city
    - Dates from flight departures
    - Budget and meals from manual inputs
    - Messages are NOT parsed by constraint builder
    """
    booking = BookingAnchors(
        outbound_flight=FlightSegment(
            origin_iata="JFK",
            destination_iata="CDG",
            departure_time="2026-06-01 10:00",
            flight_duration_minutes=420,
        ),
        return_flight=FlightSegment(
            origin_iata="CDG",
            destination_iata="JFK",
            departure_time="2026-06-05 14:00",
            flight_duration_minutes=480,
        ),
        hotel=HotelAnchor(
            name="Le Bristol Paris",
            address="112 Rue du Faubourg Saint-Honore",
            city="Paris",
            check_in_date="2026-06-01",
            check_out_date="2026-06-05",
        ),
    )

    state = {
        "booking_anchors": booking.model_dump(mode="json"),
        "manual_constraints": {
            "budget_usd": 2500.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "12:30", "end_time": "14:30"},
                {"meal_type": "DINNER", "start_time": "20:00", "end_time": "22:30"},
            ],
        },
        # Human message should be ignored by constraint builder
        "messages": [HumanMessage(content="Random unrelated prompt 999 USD Tokyo")],
    }

    result = await assemble_constraints_node(state)
    validated = result.get("validated_itinerary")

    assert validated is not None
    assert validated["destination_city"] == "Paris"
    assert validated["origin_city"] == "New York"
    assert validated["start_date"] == "2026-06-01"
    assert validated["end_date"] == "2026-06-05"
    assert validated["budget_usd"] == 2500.0  # From manual input, not prompt
    assert len(validated["meals"]) == 2
    assert validated["meals"][0]["meal_type"] == "LUNCH"
    assert validated["meals"][1]["meal_type"] == "DINNER"
    assert validated["booking_anchors"]["hotel"]["name"] == "Le Bristol Paris"


@pytest.mark.asyncio
async def test_assemble_constraints_no_tickets():
    """
    Test when no tickets are provided:
    Cities and dates remain Unknown / None, which check_missing will flag.
    """
    state = {
        "booking_anchors": None,
        "manual_constraints": {
            "budget_usd": 1500.0,
        },
        "messages": [HumanMessage(content="Trip request")],
    }

    result = await assemble_constraints_node(state)
    validated = result.get("validated_itinerary")

    assert validated is not None
    assert validated["destination_city"] == "Unknown"
    assert validated["origin_city"] == "Unknown"
    assert validated["start_date"] is None
    assert validated["end_date"] is None
    assert validated["budget_usd"] == 1500.0
    assert validated["booking_anchors"] is None


@pytest.mark.asyncio
async def test_destination_city_strictly_from_hotel():
    """
    Verifies that destination city is anchored strictly to the hotel city.
    """
    booking = BookingAnchors(
        outbound_flight=FlightSegment(
            origin_iata="MAD",
            destination_iata="FCO",
            departure_time="2026-07-10 09:00",
            flight_duration_minutes=150,
        ),
        return_flight=FlightSegment(
            origin_iata="FCO",
            destination_iata="MAD",
            departure_time="2026-07-15 18:00",
            flight_duration_minutes=150,
        ),
        hotel=HotelAnchor(
            name="Hotel Hassler Roma",
            city="Rome",
        ),
    )

    state = {
        "booking_anchors": booking.model_dump(mode="json"),
        "manual_constraints": {
            "budget_usd": 1800.0,
            "meals": [
                {"meal_type": "LUNCH", "start_time": "13:00", "end_time": "15:00"},
                {"meal_type": "DINNER", "start_time": "20:30", "end_time": "23:00"},
            ],
        },
        "messages": [],
    }

    result = await assemble_constraints_node(state)
    validated = result.get("validated_itinerary")

    assert validated["destination_city"] == "Rome"
    assert validated["origin_city"] == "Madrid"
