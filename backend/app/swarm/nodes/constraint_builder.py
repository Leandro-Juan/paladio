import logging
from datetime import datetime, date
from typing import Any

from app.schemas.itinerary import (
    BookingAnchors,
    MealRequirement,
    NodeConstraint,
    TravelConstraints,
)
from app.swarm.state import SwarmState
from app.utils.iata_mapping import get_city_from_iata

logger = logging.getLogger(__name__)


def _parse_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            clean_str = val.replace("Z", "+00:00")
            if "T" in clean_str or " " in clean_str:
                return datetime.fromisoformat(clean_str).date()
            return date.fromisoformat(clean_str)
        except Exception:
            return None
    return None


async def assemble_constraints_node(state: SwarmState) -> dict:
    """
    Deterministic constraint builder node replacing the LLM validator.

    Sourcing strategy:
    - Tickets (booking_anchors):
        - Destination City: strictly the hotel city (hotel.city)
        - Origin City: outbound flight origin (get_city_from_iata)
        - Calendar Dates & Duration: flight departures and hotel check-in/check-out
        - Booking Anchors: outbound_flight, return_flight, hotel
    - Manual user input (manual_constraints):
        - Strict financial budget ($ USD)
        - Meal requirements (lunch/dinner windows)
        - Specific POI nodes (optional)
    """
    logger.info("--- [PHASE: CONSTRAINTS] Assembling constraints deterministically ---")

    manual = state.get("manual_constraints") or {}

    # 1. Parse booking anchors from tickets
    raw_anchors = state.get("booking_anchors")
    booking: BookingAnchors | None = None
    if isinstance(raw_anchors, dict):
        try:
            booking = BookingAnchors(**raw_anchors)
        except Exception as e:
            logger.warning(f"Could not parse booking anchors dict: {e}")
    elif isinstance(raw_anchors, BookingAnchors):
        booking = raw_anchors

    origin_city = "Unknown"
    destination_city = "Unknown"
    start_date: date | None = None
    end_date: date | None = None

    # Derive from tickets if present
    if booking:
        # Destination city is strictly where the hotel is located
        if booking.hotel and booking.hotel.city:
            destination_city = booking.hotel.city

        # Origin city from outbound flight origin IATA
        if booking.outbound_flight and booking.outbound_flight.origin_iata:
            o_city = get_city_from_iata(booking.outbound_flight.origin_iata)
            if o_city and o_city != "Unknown":
                origin_city = o_city

        # Dates from outbound flight departure
        if booking.outbound_flight and booking.outbound_flight.departure_time:
            start_date = _parse_date(booking.outbound_flight.departure_time)

        # Dates from return flight departure
        if booking.return_flight and booking.return_flight.departure_time:
            end_date = _parse_date(booking.return_flight.departure_time)

        # Fallback dates from hotel check-in / check-out
        if booking.hotel:
            if not start_date and booking.hotel.check_in_date:
                start_date = _parse_date(booking.hotel.check_in_date)
            if not end_date and booking.hotel.check_out_date:
                end_date = _parse_date(booking.hotel.check_out_date)

    # 2. Integrate manual constraints (budget and meals are always entered manually)
    raw_budget = manual.get("budget_usd", 0.0)
    try:
        budget_usd = float(raw_budget)
    except (ValueError, TypeError):
        budget_usd = 0.0

    raw_meals = manual.get("meals") or []
    meals: list[MealRequirement] = []
    if isinstance(raw_meals, list):
        for m in raw_meals:
            if isinstance(m, dict):
                try:
                    meals.append(MealRequirement(**m))
                except Exception as e:
                    logger.warning(f"Could not parse meal requirement: {e}")
            elif isinstance(m, MealRequirement):
                meals.append(m)

    raw_nodes = manual.get("nodes") or []
    nodes: list[NodeConstraint] = []
    if isinstance(raw_nodes, list):
        for n in raw_nodes:
            if isinstance(n, dict):
                try:
                    nodes.append(NodeConstraint(**n))
                except Exception:
                    pass
            elif isinstance(n, NodeConstraint):
                nodes.append(n)

    # If manual constraints specify overrides for cities or dates, respect them
    if manual.get("origin_city") and manual["origin_city"] != "Unknown":
        origin_city = manual["origin_city"]
    if manual.get("destination_city") and manual["destination_city"] != "Unknown":
        destination_city = manual["destination_city"]
    if manual.get("start_date"):
        parsed_s = _parse_date(manual["start_date"])
        if parsed_s:
            start_date = parsed_s
    if manual.get("end_date"):
        parsed_e = _parse_date(manual["end_date"])
        if parsed_e:
            end_date = parsed_e

    constraints = TravelConstraints(
        origin_city=origin_city,
        destination_city=destination_city,
        budget_usd=budget_usd,
        start_date=start_date,
        end_date=end_date,
        booking_anchors=booking,
        meals=meals,
        nodes=nodes,
    )

    logger.info(
        f"--- [PHASE: CONSTRAINTS] Assembled: Origin='{origin_city}', Destination='{destination_city}', "
        f"Dates={start_date} to {end_date}, Budget=${budget_usd}, Meals={len(meals)} ---"
    )

    return {"validated_itinerary": constraints.model_dump(mode="json")}
