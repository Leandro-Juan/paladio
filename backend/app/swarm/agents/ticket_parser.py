import logging
import os
import re

from app.schemas.itinerary import BookingAnchors
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)


def get_parser_model():
    ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435/v1")
    if not ollama_env_url.endswith("/v1"):
        ollama_env_url = f"{ollama_env_url.rstrip('/')}/v1"

    MODEL_NAME = os.getenv(
        "TICKET_PARSER_MODEL", os.getenv("VALIDATOR_MODEL", "ollama:qwen2.5:3b")
    )
    actual_model = (
        MODEL_NAME.replace("ollama:", "")
        if MODEL_NAME.startswith("ollama:")
        else MODEL_NAME
    )
    provider = OllamaProvider(base_url=ollama_env_url)
    return OllamaModel(actual_model, provider=provider)


ticket_parser_agent = Agent(
    name="ticket_parser",
    output_type=BookingAnchors,
    retries=3,
    instructions="IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw JSON or text, only call the tool. Extract the outbound flight, return flight, and hotel accommodation. If any of these are not mentioned, omit them or leave them as null. Identify IATA codes. Extract departure times, arrival times, and flight durations in minutes. Hotel 'name' and 'city' are REQUIRED if a hotel is mentioned.",
)


def _deterministic_parse_booking_text(text: str) -> BookingAnchors | None:
    if not text:
        return None
    from app.schemas.itinerary import FlightSegment, HotelAnchor

    outbound_m = re.search(
        r"Flight outbound ([A-Z]{3}) to ([A-Z]{3}) on ([0-9-]+ [0-9:]+) arriving at ([0-9-]+ [0-9:]+)",
        text,
        re.I,
    )
    return_m = re.search(
        r"Flight return ([A-Z]{3}) to ([A-Z]{3}) on ([0-9-]+ [0-9:]+) arriving at ([0-9-]+ [0-9:]+)",
        text,
        re.I,
    )
    hotel_m = re.search(
        r"([A-Za-z0-9\s]+) booked in ([A-Za-z\s]+) from ([0-9-]+) to ([0-9-]+)",
        text,
        re.I,
    )

    outbound = None
    if outbound_m:
        outbound = FlightSegment(
            origin_iata=outbound_m.group(1).upper(),
            destination_iata=outbound_m.group(2).upper(),
            departure_time=outbound_m.group(3),
            arrival_time=outbound_m.group(4),
            direction="arrival",
        )

    ret_flight = None
    if return_m:
        ret_flight = FlightSegment(
            origin_iata=return_m.group(1).upper(),
            destination_iata=return_m.group(2).upper(),
            departure_time=return_m.group(3),
            arrival_time=return_m.group(4),
            direction="departure",
        )

    hotel = None
    if hotel_m:
        hotel = HotelAnchor(
            name=hotel_m.group(1).strip(),
            city=hotel_m.group(2).strip().title(),
            check_in_date=hotel_m.group(3),
            check_out_date=hotel_m.group(4),
        )

    if outbound or ret_flight or hotel:
        return BookingAnchors(
            outbound_flight=outbound,
            return_flight=ret_flight,
            hotel=hotel,
        )
    return None


async def ticket_parser_node(state: dict) -> dict:
    booking_text = state.get("booking_text")
    if not booking_text or not booking_text.strip():
        logger.info("No booking text provided. Bypassing ticket parser.")
        return {"booking_anchors": state.get("booking_anchors")}

    logger.debug("Calling Pydantic AI Ticket Parser Agent...")
    model = get_parser_model()
    raw_existing = state.get("booking_anchors")

    try:
        res = await ticket_parser_agent.run(f"Text: {booking_text}", model=model)
        anchors = res.output
    except Exception as e:
        logger.warning(f"Ticket parsing failed: {e}")
        if raw_existing:
            return {"booking_anchors": raw_existing}
        deterministic = _deterministic_parse_booking_text(booking_text)
        if deterministic:
            return {"booking_anchors": deterministic.model_dump(mode="json")}
        anchors = BookingAnchors()

    # Filter out the dummy 'XXX' segments if model hallucinates them
    if anchors.outbound_flight and anchors.outbound_flight.origin_iata == "XXX":
        anchors.outbound_flight = None
    if anchors.return_flight and anchors.return_flight.origin_iata == "XXX":
        anchors.return_flight = None
    if anchors.hotel and anchors.hotel.name == "XXX":
        anchors.hotel = None

    # If LLM returned empty anchors but booking_text or raw_existing had valid data, fallback
    if not anchors.outbound_flight and not anchors.return_flight and not anchors.hotel:
        if raw_existing:
            logger.info(
                "Ticket parser extracted empty anchors; using existing anchors."
            )
            return {"booking_anchors": raw_existing}
        deterministic = _deterministic_parse_booking_text(booking_text)
        if deterministic:
            logger.info(
                "Ticket parser extracted empty anchors; resolved via deterministic parser."
            )
            return {"booking_anchors": deterministic.model_dump(mode="json")}

    # Tag unambiguous direction on parsed anchors
    if anchors.outbound_flight:
        anchors.outbound_flight.direction = "arrival"
    if anchors.return_flight:
        anchors.return_flight.direction = "departure"

    logger.info("Successfully extracted booking anchors from text.")
    return {"booking_anchors": anchors.model_dump(mode="json")}
