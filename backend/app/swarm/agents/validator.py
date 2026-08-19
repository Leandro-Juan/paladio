import os
import logging
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from app.schemas.itinerary import TravelConstraints
from datetime import date

from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)

# According to ROADMAP.md, we use a local LLM via Ollama or vLLM on port 11434
ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Pydantic AI's OllamaProvider uses the OpenAI client under the hood, so it requires the /v1 endpoint
if not ollama_env_url.endswith("/v1"):
    ollama_env_url = ollama_env_url.rstrip("/")
    if ollama_env_url.endswith("/api"):
        ollama_env_url = ollama_env_url[:-4]
    validator_url = f"{ollama_env_url}/v1"
else:
    validator_url = ollama_env_url

MODEL_NAME = os.getenv("VALIDATOR_MODEL", "ollama:llama3.1")

# Extract the actual model name if it's prefixed
actual_model = MODEL_NAME.replace("ollama:", "") if MODEL_NAME.startswith("ollama:") else MODEL_NAME
provider = OllamaProvider(base_url=validator_url)
model = OllamaModel(actual_model, provider=provider)

validator_agent = Agent(
    model,
    name='validator_agent',
    output_type=TravelConstraints,
    retries=3,
    instructions=(
        "You are the Guardrail Validator Agent. Your job is to extract travel constraints "
        "from the user's natural language input and use the provided tool to output the structured data. "
        "Ensure all constraints such as budget, dates, nodes, and meal requirements are accurately captured. "
        "IMPORTANT FORMATTING RULES:\n"
        "- Dates MUST be strictly formatted as YYYY-MM-DD strings (e.g. '2026-08-18').\n"
        "- Times MUST be strictly formatted as HH:MM strings (e.g. '13:00').\n"
        "If a specific budget is not mentioned, make a reasonable estimate based on the destination and trip length. "
        "Do not invent points of interest that are not mentioned or implied by the user."
    )
)

@validator_agent.system_prompt
def add_date_context() -> str:
    return f"Today's date is {date.today()}. If no specific dates are mentioned in the request, assume the trip starts tomorrow and calculate the end date based on the trip length."

async def validator_node(state: dict) -> dict:
    """
    LangGraph node wrapper for the Pydantic AI Validator Agent.
    """
    logger.info("--- [PHASE: VALIDATOR] Extracting travel constraints via LLM ---")
    last_msg = state["messages"][-1].content
    retrieved_context = state.get("retrieved_context", "")
    
    prompt = f"Context: {retrieved_context}\n\nUser Request: {last_msg}"
    logger.debug("Calling Pydantic AI Validator Agent...")
    
    result = await validator_agent.run(prompt)
    
    logger.info(f"--- [PHASE: VALIDATOR] Successfully extracted {len(result.output.nodes)} POIs and {len(result.output.meals)} meals ---")
    return {"validated_itinerary": result.output}
