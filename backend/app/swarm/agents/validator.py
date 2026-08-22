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
        "Ensure all constraints such as the destination_city, budget, dates, nodes, and meal requirements are accurately captured. "
        "IMPORTANT FORMATTING RULES:\n"
        "- The current year is 2026. ALL relative dates and implied dates MUST resolve to the year 2026 or later. If a month and day are provided without a year, and that date has already passed in the current year, you MUST resolve it to the NEXT year (e.g. 2027).\n"
        "- Dates MUST be strictly formatted as YYYY-MM-DD strings (e.g. '2026-08-18').\n"
        "- Times MUST be strictly formatted as HH:MM strings (e.g. '13:00').\n"
        "Extract only the parameters that the user explicitly mentions. Do NOT make up, assume, or estimate any missing information. If a parameter is completely missing from the user's prompt, you must leave it as null, 0, or Unknown.\n"
        "Do not invent points of interest that are not mentioned or implied by the user. "
        "1.  **Extract the origin_city and destination_city:** Parse the user's intended starting point and destination.\n"
        "2.  **Extract Date & Budget:** Identify `start_date`, `end_date`, and `budget_usd` (convert currencies if needed).\n"
        "3.  **Identify Mandatory Nodes:** Extract specific POIs the user wants to visit into the `nodes` list.\n"
        "4.  **Extract Meal Constraints:** Extract any requested meal preferences into the `meals` list. If the user wants 'breakfast, lunch, and dinner each day', explicitly add these 3 meals to the constraints with appropriate time windows (e.g. Breakfast 08:00-10:30, Lunch 13:00-15:30, Dinner 19:30-22:00).\n"
        "5.  **Calculate Limits:** Convert vague statements into rigid JSON structures."
    )
)

@validator_agent.system_prompt
def add_date_context() -> str:
    return f"Today's date is {date.today()}."

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
    
    # Python-level enforcement: If LLM extracts a date in the past, bump it to next year
    today = date.today()
    if result.output.start_date and result.output.start_date < today:
        try:
            result.output.start_date = result.output.start_date.replace(year=result.output.start_date.year + 1)
        except ValueError:
            # Handle leap year Feb 29 edge case
            result.output.start_date = result.output.start_date.replace(year=result.output.start_date.year + 1, day=28)
            
        if result.output.end_date and result.output.end_date < today:
            try:
                result.output.end_date = result.output.end_date.replace(year=result.output.end_date.year + 1)
            except ValueError:
                result.output.end_date = result.output.end_date.replace(year=result.output.end_date.year + 1, day=28)
    
    logger.info(f"--- [PHASE: VALIDATOR] Successfully extracted {len(result.output.nodes)} POIs and {len(result.output.meals)} meals ---")
    return {"validated_itinerary": result.output.model_dump(mode='json')}
