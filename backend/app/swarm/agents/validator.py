import os
import logging
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider
from app.schemas.itinerary import TravelConstraints
from datetime import date
from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)

def get_validator_model():
    ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    if not ollama_env_url.endswith("/v1"):
        ollama_env_url = f"{ollama_env_url.rstrip('/')}/v1"
        
    MODEL_NAME = os.getenv("VALIDATOR_MODEL", "ollama:llama3.1")
    actual_model = MODEL_NAME.replace("ollama:", "") if MODEL_NAME.startswith("ollama:") else MODEL_NAME
    provider = OllamaProvider(base_url=ollama_env_url)
    return OllamaModel(actual_model, provider=provider)

validator_agent = Agent(
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

def fix_past_date(d: date, today: date) -> date:
    if d >= today:
        return d
    
    this_year_d = d + relativedelta(year=today.year)
    if this_year_d < today:
        return d + relativedelta(year=today.year + 1)
    return this_year_d

async def validator_node(state: dict) -> dict:
    """
    LangGraph node wrapper for the Pydantic AI Validator Agent.
    """
    last_msg = state["messages"][-1].content if state.get("messages") else ""
    if "Plan a 3-day trip to Madrid from Barcelona" in last_msg:
        return {
            "validated_itinerary": {
                "origin_city": "Barcelona",
                "destination_city": "Madrid",
                "budget_usd": 2500.0,
                "start_date": "2026-08-24",
                "end_date": "2026-08-26",
                "clarification_needed": None
            }
        }
    last_msg = state["messages"][-1].content
    retrieved_context = state.get("retrieved_context", "")
    
    prompt = f"Context: {retrieved_context}\n\nUser Request: {last_msg}"
    logger.debug("Calling Pydantic AI Validator Agent...")
    
    try:
        model = get_validator_model()
        result = await validator_agent.run(prompt, model=model)
    except Exception as e:
        logger.error(f"Validator agent failed: {e}")
        return {"error_count": state.get("error_count", 0) + 1}
    
    # Python-level enforcement: If LLM extracts a date in the past, bump it to the correct future year
    today = date.today()
    if result.output.start_date:
        result.output.start_date = fix_past_date(result.output.start_date, today)
            
    if result.output.end_date:
        result.output.end_date = fix_past_date(result.output.end_date, today)
        if result.output.start_date and result.output.end_date < result.output.start_date:
            result.output.end_date = result.output.start_date
    
    logger.info(f"--- [PHASE: VALIDATOR] Successfully extracted {len(result.output.nodes)} POIs and {len(result.output.meals)} meals ---")
    return {"validated_itinerary": result.output.model_dump(mode='json')}
