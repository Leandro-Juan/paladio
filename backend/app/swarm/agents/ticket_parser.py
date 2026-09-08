import logging
import os

from app.schemas.itinerary import BookingAnchors
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

    MODEL_NAME = os.getenv(
        "TICKET_PARSER_MODEL", os.getenv("VALIDATOR_MODEL", "ollama:qwen2.5")
    )
    actual_model = (
        MODEL_NAME.replace("ollama:", "")
        if MODEL_NAME.startswith("ollama:")
        else MODEL_NAME
    )
    provider = OllamaProvider(base_url=ollama_env_url)
    _model_instance = OllamaModel(actual_model, provider=provider)
    return _model_instance


ticket_parser_agent = Agent(
    name="ticket_parser",
    output_type=BookingAnchors,
    retries=3,
    instructions="IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw JSON or text, only call the tool. Extract the outbound flight, return flight, and hotel accommodation. If any of these are not mentioned, omit them or leave them as null. Identify IATA codes. Extract departure times. Hotel 'name' and 'city' are REQUIRED if a hotel is mentioned.",
)


async def ticket_parser_node(state: dict) -> dict:
    booking_text = state.get("booking_text")
    if not booking_text or not booking_text.strip():
        logger.info("No booking text provided. Bypassing ticket parser.")
        return {"booking_anchors": state.get("booking_anchors")}

    logger.debug("Calling Pydantic AI Ticket Parser Agent...")
    model = get_parser_model()

    try:
        res = await ticket_parser_agent.run(f"Text: {booking_text}", model=model)
        anchors = res.output
    except Exception as e:
        logger.warning(f"Ticket parsing failed: {e}")
        anchors = BookingAnchors()

    # Filter out the dummy 'XXX' segments if model hallucinates them
    if anchors.outbound_flight and anchors.outbound_flight.origin_iata == "XXX":
        anchors.outbound_flight = None
    if anchors.return_flight and anchors.return_flight.origin_iata == "XXX":
        anchors.return_flight = None
    if anchors.hotel and anchors.hotel.name == "XXX":
        anchors.hotel = None

    logger.info("Successfully extracted booking anchors from text.")
    return {"booking_anchors": anchors.model_dump(mode="json")}
