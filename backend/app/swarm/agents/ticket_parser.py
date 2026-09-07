import logging
import os
import asyncio

from app.schemas.itinerary import BookingAnchors, FlightSegment, HotelAnchor
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)

_model_instance = None


def get_parser_model():
    global _model_instance
    if _model_instance is not None:
        return _model_instance

    ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435/v1")
    if not ollama_env_url.endswith("/v1"):
        ollama_env_url = f"{ollama_env_url.rstrip('/')}/v1"

    MODEL_NAME = os.getenv("VALIDATOR_MODEL", "ollama:qwen2.5")
    actual_model = (
        MODEL_NAME.replace("ollama:", "")
        if MODEL_NAME.startswith("ollama:")
        else MODEL_NAME
    )
    provider = OllamaProvider(base_url=ollama_env_url)
    _model_instance = OllamaModel(actual_model, provider=provider)
    return _model_instance


outbound_agent = Agent(
    name="outbound_parser",
    output_type=FlightSegment,
    retries=3,
    instructions="IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw JSON or text, only call the tool. Extract ONLY the outbound flight (from origin to destination). Identify IATA codes. Extract departure time. If no outbound flight is mentioned, output a flight with origin_iata='XXX', destination_iata='XXX', and departure_time='N/A'.",
)

return_agent = Agent(
    name="return_parser",
    output_type=FlightSegment,
    retries=3,
    instructions="IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw JSON or text, only call the tool. Extract ONLY the return flight (from destination back home). Identify IATA codes. Extract departure time. If no return flight is mentioned, output a flight with origin_iata='XXX', destination_iata='XXX', and departure_time='N/A'.",
)

hotel_agent = Agent(
    name="hotel_parser",
    output_type=HotelAnchor,
    retries=3,
    instructions="IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw JSON or text, only call the tool. Extract ONLY the hotel accommodation. 'name' and 'city' are REQUIRED. Example: if text says 'Booked at the Savoy hotel in London', name='Savoy', city='London'. If no hotel is mentioned, output a hotel with name='XXX', city='XXX'.",
)


async def ticket_parser_node(state: dict) -> dict:
    booking_text = state.get("booking_text")
    if not booking_text or not booking_text.strip():
        logger.info("No booking text provided. Bypassing ticket parser.")
        return {"booking_anchors": None}

    logger.debug("Calling Pydantic AI Ticket Parser Agents concurrently...")
    model = get_parser_model()

    async def extract_outbound():
        try:
            res = await outbound_agent.run(f"Text: {booking_text}", model=model)
            return res.output
        except Exception as e:
            logger.warning(f"Outbound parsing failed: {e}")
            return None

    async def extract_return():
        try:
            res = await return_agent.run(f"Text: {booking_text}", model=model)
            return res.output
        except Exception as e:
            logger.warning(f"Return parsing failed: {e}")
            return None

    async def extract_hotel():
        try:
            res = await hotel_agent.run(f"Text: {booking_text}", model=model)
            return res.output
        except Exception as e:
            logger.warning(f"Hotel parsing failed: {e}")
            return None

    # Run them in parallel using asyncio.gather
    outbound, return_fl, hotel = await asyncio.gather(
        extract_outbound(), extract_return(), extract_hotel()
    )

    # Filter out the dummy 'XXX' segments
    if outbound and outbound.origin_iata == "XXX":
        outbound = None
    if return_fl and return_fl.origin_iata == "XXX":
        return_fl = None
    if hotel and hotel.name == "XXX":
        hotel = None

    anchors = BookingAnchors(
        outbound_flight=outbound, return_flight=return_fl, hotel=hotel
    )

    logger.info("Successfully extracted booking anchors from text.")
    return {"booking_anchors": anchors.model_dump(mode="json")}
