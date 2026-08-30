import logging
import os

from app.schemas.itinerary import BookingAnchors
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)


def get_parser_model():
    ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435/v1")
    if not ollama_env_url.endswith("/v1"):
        ollama_env_url = f"{ollama_env_url.rstrip('/')}/v1"

    MODEL_NAME = os.getenv("VALIDATOR_MODEL", "ollama:llama3.1")
    actual_model = (
        MODEL_NAME.replace("ollama:", "")
        if MODEL_NAME.startswith("ollama:")
        else MODEL_NAME
    )
    provider = OllamaProvider(base_url=ollama_env_url)
    return OllamaModel(actual_model, provider=provider)


ticket_parser_agent = Agent(
    name="ticket_parser_agent",
    output_type=BookingAnchors,
    retries=3,
    instructions=(
        "You are an expert ticket parsing agent. Extract the outbound flight, return flight, "
        "and hotel details from the provided unstructured booking text.\n"
        "1. Identify the origin and destination IATA airport codes.\n"
        "2. Extract departure and arrival dates/times in YYYY-MM-DD HH:MM format.\n"
        "3. Extract the hotel name, city, address, and check-in times.\n"
        "If some information is missing, leave the optional fields as null. "
        "Do not make up any information. If a full segment (like a return flight or hotel) is completely missing, return null for that anchor."
    ),
)


async def ticket_parser_node(state: dict) -> dict:
    booking_text = state.get("booking_text")
    if not booking_text or not booking_text.strip():
        logger.info("No booking text provided. Bypassing ticket parser.")
        return {"booking_anchors": None}

    logger.debug("Calling Pydantic AI Ticket Parser Agent...")
    try:
        model = get_parser_model()
        result = await ticket_parser_agent.run(booking_text, model=model)
        logger.info("Successfully extracted booking anchors from text.")
        return {"booking_anchors": result.output.model_dump(mode="json")}
    except Exception as e:
        logger.error(f"Ticket parser agent failed: {e}")
        raise RuntimeError(f"Ticket parser agent failed: {e}")
