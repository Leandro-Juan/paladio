import datetime
import logging
from typing import Any

from app.schemas.itinerary import BookingAnchors, FlightSegment, HotelAnchor
from app.utils.iata_mapping import get_iata_code

logger = logging.getLogger(__name__)


def get_real_hotel_for_city(city: str) -> dict[str, str]:
    """Generates standard hotel anchor info for destination city without hardcoded city tables."""
    clean_city = city.strip().title()
    return {
        "name": f"Hotel {clean_city} Center",
        "address": f"Center District, {clean_city}",
    }


def generate_mock_tickets(
    origin_city: str,
    destination_city: str,
    duration_days: int = 5,
    start_date: datetime.date | None = None,
) -> dict[str, Any]:
    """
    Generates mock tickets for a trip between origin and destination cities:
    - Resolves real airport IATA codes via iata_mapping.py
    - Defaults departure date to 7 days ahead (next week) relative to today's date
    - Returns round-trip flight segments and hotel accommodation anchor
    - Generates natural confirmation text matching parser expectations
    """
    if start_date is None:
        today = datetime.datetime.now(datetime.timezone.utc).date()
        outbound_date = today + datetime.timedelta(days=7)
    else:
        outbound_date = start_date

    return_date = outbound_date + datetime.timedelta(days=duration_days)

    orig_iata = get_iata_code(origin_city)
    dest_iata = get_iata_code(destination_city)

    hotel_info = get_real_hotel_for_city(destination_city)
    hotel_name = hotel_info["name"]
    hotel_address = hotel_info["address"]

    outbound_dep = f"{outbound_date.isoformat()} 10:00"
    outbound_arr = f"{outbound_date.isoformat()} 13:00"

    return_dep = f"{return_date.isoformat()} 14:00"
    return_arr = f"{return_date.isoformat()} 17:00"

    outbound_flight = FlightSegment(
        origin_iata=orig_iata,
        destination_iata=dest_iata,
        departure_time=outbound_dep,
        arrival_time=outbound_arr,
        flight_duration_minutes=180,
        flight_number="PL-101",
        airline="Paladio Airways",
        direction="arrival",
    )

    return_flight = FlightSegment(
        origin_iata=dest_iata,
        destination_iata=orig_iata,
        departure_time=return_dep,
        arrival_time=return_arr,
        flight_duration_minutes=180,
        flight_number="PL-102",
        airline="Paladio Airways",
        direction="departure",
    )

    hotel = HotelAnchor(
        name=hotel_name,
        address=hotel_address,
        city=destination_city.title(),
        check_in_date=outbound_date.isoformat(),
        check_in_time="15:00",
        check_out_date=return_date.isoformat(),
    )

    booking_anchors = BookingAnchors(
        outbound_flight=outbound_flight,
        return_flight=return_flight,
        hotel=hotel,
    )

    booking_text = (
        f"Flight outbound {orig_iata} to {dest_iata} on {outbound_date.isoformat()} 10:00 arriving at {outbound_arr} (duration 180m). "
        f"Flight return {dest_iata} to {orig_iata} on {return_date.isoformat()} 14:00 arriving at {return_arr} (duration 180m). "
        f"{hotel_name} booked in {destination_city.title()} from {outbound_date.isoformat()} to {return_date.isoformat()}."
    )

    logger.info(
        f"Generated mock tickets: {origin_city} ({orig_iata}) ➔ {destination_city} ({dest_iata}) "
        f"from {outbound_date} to {return_date}"
    )

    return {
        "booking_text": booking_text,
        "booking_anchors": booking_anchors,
        "start_date": outbound_date.isoformat(),
        "end_date": return_date.isoformat(),
        "origin_city": origin_city.title(),
        "destination_city": destination_city.title(),
        "origin_iata": orig_iata,
        "destination_iata": dest_iata,
        "hotel_name": hotel_name,
        "hotel_address": hotel_address,
    }
