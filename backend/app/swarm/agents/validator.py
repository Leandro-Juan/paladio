import logging
import os

from app.schemas.itinerary import TravelConstraints
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)


_model_instance = None


def get_validator_model():
    global _model_instance
    if _model_instance is not None:
        return _model_instance

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
    _model_instance = OllamaModel(actual_model, provider=provider)
    return _model_instance


validator_agent = Agent(
    name="validator_agent",
    output_type=TravelConstraints,
    retries=5,
    instructions=(
        "You are the Guardrail Validator Agent. Your job is to extract travel constraints "
        "from the user's natural language input and use the provided tool to output the structured data. "
        "IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw JSON or text, only call the tool.\n"
        "CRITICAL INSTRUCTIONS:\n"
        "1.  **Extract Budget:** You MUST explicitly output the `budget_usd` field. If the user states a budget (e.g., '3000 USD', '2500 dollars'), set `budget_usd` to that EXACT numeric value (e.g. 3000.0, 2500.0). NEVER hallucinate or invent a budget. If the user does not specify a budget, you MUST set `budget_usd` to 0.0.\n"
        "2.  **Identify Mandatory Nodes:** Extract specific POIs the user wants to visit into the `nodes` list.\n"
        "3.  **Calculate Limits:** Convert vague statements into strict structured data."
    ),
)


async def validator_node(state: dict) -> dict:
    """
    LangGraph node wrapper for the Pydantic AI Validator Agent.
    """
    last_msg = state["messages"][-1].content if state.get("messages") else ""
    prompt = f"User Request: {last_msg}"
    logger.debug("Calling Pydantic AI Validator Agent...")

    try:
        model = get_validator_model()
        result = await validator_agent.run(prompt, model=model)
    except Exception as e:
        logger.error(f"Validator agent failed: {e}")
        raise RuntimeError(f"Validator agent failed: {e}")

    if state.get("booking_anchors"):
        from app.schemas.itinerary import BookingAnchors

        try:
            booking = BookingAnchors(**state["booking_anchors"])
            result.output.booking_anchors = booking

            from app.utils.iata_mapping import get_city_from_iata

            if booking.outbound_flight:
                o_iata = (
                    booking.outbound_flight.origin_iata.upper()
                    if booking.outbound_flight.origin_iata
                    else ""
                )
                d_iata = (
                    booking.outbound_flight.destination_iata.upper()
                    if booking.outbound_flight.destination_iata
                    else ""
                )
                result.output.origin_city = (
                    get_city_from_iata(o_iata) if o_iata else "Unknown"
                )
                result.output.destination_city = (
                    get_city_from_iata(d_iata) if d_iata else "Unknown"
                )
                from datetime import datetime

                if booking.outbound_flight and booking.outbound_flight.departure_time:
                    result.output.start_date = datetime.fromisoformat(
                        booking.outbound_flight.departure_time.replace("Z", "+00:00")
                    ).date()

            if booking.return_flight:
                from datetime import datetime

                if booking.return_flight.departure_time:
                    result.output.end_date = datetime.fromisoformat(
                        booking.return_flight.departure_time.replace("Z", "+00:00")
                    ).date()

            if booking.hotel:
                result.output.destination_city = booking.hotel.city
                from datetime import datetime

                if booking.hotel.check_in_date:
                    result.output.start_date = datetime.fromisoformat(
                        booking.hotel.check_in_date
                    ).date()
                if booking.hotel.check_out_date:
                    result.output.end_date = datetime.fromisoformat(
                        booking.hotel.check_out_date
                    ).date()

        except Exception as e:
            logger.warning(f"Failed to parse injected booking anchors: {e}")

    logger.info(
        f"--- [PHASE: VALIDATOR] Successfully extracted {len(result.output.nodes)} POIs and {len(result.output.meals)} meals ---"
    )
    return {"validated_itinerary": result.output.model_dump(mode="json")}
