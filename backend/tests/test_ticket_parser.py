import pytest
from app.swarm.agents.ticket_parser import (
    BookingParseError,
    parse_booking_text,
    ticket_parser_node,
)


@pytest.mark.asyncio
async def test_ticket_parser_natural_prose_roundtrip():
    """Test deterministic ticket parser node with natural prose confirmation text."""
    booking_text = (
        "I have a delta flight from JFK to LHR on Oct 10th 2026 at 5pm (duration 420m). "
        "Coming back from LHR to JFK on Oct 20th 2026 at 9am (duration 480m). "
        "Booked at the Savoy hotel in London."
    )
    result = await ticket_parser_node({"booking_text": booking_text})

    anchors = result["booking_anchors"]
    assert anchors is not None
    assert anchors["outbound_flight"]["origin_iata"] == "JFK"
    assert anchors["outbound_flight"]["destination_iata"] == "LHR"
    assert anchors["outbound_flight"]["departure_time"] == "2026-10-10 17:00"
    assert anchors["outbound_flight"]["flight_duration_minutes"] == 420
    assert anchors["outbound_flight"]["airline"] == "Delta"
    assert anchors["outbound_flight"]["direction"] == "arrival"

    assert anchors["return_flight"]["origin_iata"] == "LHR"
    assert anchors["return_flight"]["destination_iata"] == "JFK"
    assert anchors["return_flight"]["departure_time"] == "2026-10-20 09:00"
    assert anchors["return_flight"]["flight_duration_minutes"] == 480
    assert anchors["return_flight"]["direction"] == "departure"

    assert anchors["hotel"]["name"] == "Savoy hotel"
    assert anchors["hotel"]["city"] == "London"
    assert anchors["hotel"]["check_in_date"] == "2026-10-10"
    assert anchors["hotel"]["check_out_date"] == "2026-10-20"


def test_parse_booking_text_iso_structured_and_arrows():
    """Test ISO dates, arrow routes (->), flight numbers, and structured Hotel lines."""
    booking_text = (
        "Flight AF1234: CDG -> NRT on 2026-12-01 13:15 arriving 2026-12-02 09:30. "
        "Return NRT -> CDG on 2026-12-10 11:00. "
        "Hotel: Park Hyatt Tokyo, Tokyo (Check-in: 2026-12-02, Check-out: 2026-12-10)"
    )
    anchors = parse_booking_text(booking_text)

    assert anchors is not None
    assert anchors.outbound_flight is not None
    assert anchors.outbound_flight.flight_number == "AF1234"
    assert anchors.outbound_flight.origin_iata == "CDG"
    assert anchors.outbound_flight.destination_iata == "NRT"
    assert anchors.outbound_flight.departure_time == "2026-12-01 13:15"
    assert anchors.outbound_flight.arrival_time == "2026-12-02 09:30"

    assert anchors.return_flight is not None
    assert anchors.return_flight.origin_iata == "NRT"
    assert anchors.return_flight.destination_iata == "CDG"
    assert anchors.return_flight.departure_time == "2026-12-10 11:00"

    assert anchors.hotel is not None
    assert anchors.hotel.name == "Park Hyatt Tokyo"
    assert anchors.hotel.city == "Tokyo"
    assert anchors.hotel.check_in_date == "2026-12-02"
    assert anchors.hotel.check_out_date == "2026-12-10"


def test_parse_booking_text_terse_return_and_hotel():
    """Test terse return dates inferred from outbound airports and 'Hotel X in City' syntax."""
    booking_text = "Flight from MAD to FCO on 2026-12-01. Return 2026-12-05. Hotel Hassler in Rome."
    anchors = parse_booking_text(booking_text)

    assert anchors is not None
    assert anchors.outbound_flight is not None
    assert anchors.outbound_flight.origin_iata == "MAD"
    assert anchors.outbound_flight.destination_iata == "FCO"
    assert anchors.return_flight is not None
    assert anchors.return_flight.origin_iata == "FCO"
    assert anchors.return_flight.destination_iata == "MAD"
    assert anchors.return_flight.departure_time == "2026-12-05 14:00"
    assert anchors.hotel is not None
    assert anchors.hotel.name == "Hotel Hassler"
    assert anchors.hotel.city == "Rome"
    assert anchors.hotel.check_in_date == "2026-12-01"
    assert anchors.hotel.check_out_date == "2026-12-05"


@pytest.mark.asyncio
async def test_ticket_parser_node_raises_422_on_unparseable_text():
    """Non-empty unparseable text with no pre-existing anchors raises BookingParseError (422)."""
    with pytest.raises(BookingParseError) as exc_info:
        await ticket_parser_node(
            {"booking_text": "I want a relaxing museum trip with good pasta."}
        )
    assert exc_info.value.status_code == 422
    assert len(exc_info.value.missing_fields) > 0


@pytest.mark.asyncio
async def test_ticket_parser_node_empty_text_passthrough():
    """Blank booking_text preserves existing booking_anchors without failing."""
    existing = {"hotel": {"name": "Existing Hotel", "city": "Rome"}}
    result = await ticket_parser_node(
        {"booking_text": "   ", "booking_anchors": existing}
    )
    assert result["booking_anchors"] == existing
