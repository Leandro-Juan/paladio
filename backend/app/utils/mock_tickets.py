import datetime
import logging
from typing import Any

from app.schemas.itinerary import BookingAnchors, FlightSegment, HotelAnchor
from app.utils.iata_mapping import get_iata_code

logger = logging.getLogger(__name__)

REAL_CITY_HOTELS: dict[str, dict[str, str]] = {
    "paris": {
        "name": "InterContinental Paris Le Grand",
        "address": "Rue Scribe, Paris",
    },
    "madrid": {
        "name": "The Westin Palace Madrid",
        "address": "Plaza de las Cortes 7, Madrid",
    },
    "london": {
        "name": "The Savoy London",
        "address": "Strand, London",
    },
    "rome": {
        "name": "Hotel de Russie Rome",
        "address": "Via del Babuino 9, Rome",
    },
    "berlin": {
        "name": "Hotel Adlon Kempinski",
        "address": "Unter den Linden 77, Berlin",
    },
    "barcelona": {
        "name": "Hotel Arts Barcelona",
        "address": "Marina 19-21, Barcelona",
    },
    "tokyo": {
        "name": "Park Hyatt Tokyo",
        "address": "3-7-1-2 Nishi-Shinjuku, Shinjuku, Tokyo",
    },
    "new york": {
        "name": "The Plaza Hotel",
        "address": "768 5th Ave, New York",
    },
    "amsterdam": {
        "name": "Grand Hotel Amrâth Amsterdam",
        "address": "Prins Hendrikkade 108, Amsterdam",
    },
    "vienna": {
        "name": "Hotel Sacher Wien",
        "address": "Philharmoniker Str. 4, Vienna",
    },
    "zurich": {
        "name": "Baur au Lac Zurich",
        "address": "Talstrasse 1, Zurich",
    },
}


def get_real_hotel_for_city(city: str) -> dict[str, str]:
    clean_city = city.lower().strip()
    for known_city, info in REAL_CITY_HOTELS.items():
        if known_city in clean_city or clean_city in known_city:
            return info
    return {
        "name": f"Grand Central Hotel {city.title()}",
        "address": f"Central District, {city.title()}",
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
    )

    return_flight = FlightSegment(
        origin_iata=dest_iata,
        destination_iata=orig_iata,
        departure_time=return_dep,
        arrival_time=return_arr,
        flight_duration_minutes=180,
        flight_number="PL-102",
        airline="Paladio Airways",
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
        f"Flight outbound {orig_iata} to {dest_iata} on {outbound_date.isoformat()} 10:00 (duration 180m). "
        f"Flight return {dest_iata} to {orig_iata} on {return_date.isoformat()} 14:00 (duration 180m). "
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
