import logging
import os

from app.schemas.itinerary import TravelConstraints
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)


def get_validator_model():
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


validator_agent = Agent(
    name="validator_agent",
    output_type=TravelConstraints,
    retries=3,
    instructions=(
        "You are the Guardrail Validator Agent. Your job is to extract travel constraints "
        "from the user's natural language input and use the provided tool to output the structured data. "
        "1.  **Extract Budget:** If the user states a budget, you MUST extract that number into `budget_usd` (e.g., 'My budget is 2500 USD' -> 2500.0). If no budget is specified, leave it as 0.\n"
        "2.  **Identify Mandatory Nodes:** Extract specific POIs the user wants to visit into the `nodes` list.\n"
        "3.  **Calculate Limits:** Convert vague statements into rigid JSON structures. OUTPUT RAW JSON ONLY. Do not use markdown blocks like ```json."
    ),
)


async def validator_node(state: dict) -> dict:
    """
    LangGraph node wrapper for the Pydantic AI Validator Agent.
    """
    last_msg = state["messages"][-1].content if state.get("messages") else ""
    retrieved_context = state.get("retrieved_context", "")

    prompt = f"Context: {retrieved_context}\n\nUser Request: {last_msg}"
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

            if booking.outbound_flight:
                result.output.origin_city = booking.outbound_flight.origin_iata
                result.output.destination_city = (
                    booking.outbound_flight.destination_iata
                )
                from datetime import datetime

                try:
                    dep_time = booking.outbound_flight.departure_time
                    dep_date_str = (
                        dep_time.split("T")[0]
                        if "T" in dep_time
                        else dep_time.split(" ")[0]
                    )
                    result.output.start_date = datetime.strptime(
                        dep_date_str, "%Y-%m-%d"
                    ).date()
                except Exception:
                    pass

            if booking.return_flight:
                from datetime import datetime

                try:
                    dep_time = booking.return_flight.departure_time
                    dep_date_str = (
                        dep_time.split("T")[0]
                        if "T" in dep_time
                        else dep_time.split(" ")[0]
                    )
                    result.output.end_date = datetime.strptime(
                        dep_date_str, "%Y-%m-%d"
                    ).date()
                except Exception:
                    pass

            if booking.hotel:
                result.output.destination_city = booking.hotel.city
                if booking.hotel.check_in_date:
                    from datetime import datetime

                    try:
                        result.output.start_date = datetime.strptime(
                            booking.hotel.check_in_date, "%Y-%m-%d"
                        ).date()
                    except Exception:
                        pass
                if booking.hotel.check_out_date:
                    from datetime import datetime

                    try:
                        result.output.end_date = datetime.strptime(
                            booking.hotel.check_out_date, "%Y-%m-%d"
                        ).date()
                    except Exception:
                        pass

        except Exception as e:
            logger.warning(f"Failed to parse injected booking anchors: {e}")

    logger.info(
        f"--- [PHASE: VALIDATOR] Successfully extracted {len(result.output.nodes)} POIs and {len(result.output.meals)} meals ---"
    )
    return {"validated_itinerary": result.output.model_dump(mode="json")}
