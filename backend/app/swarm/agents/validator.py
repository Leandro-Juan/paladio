import os
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from app.schemas.itinerary import TravelConstraints

# According to ROADMAP.md, we use a local LLM via Ollama or vLLM on port 11434
# Ensure OLLAMA_BASE_URL is set so the agent can initialize
if "OLLAMA_BASE_URL" not in os.environ:
    os.environ["OLLAMA_BASE_URL"] = "http://localhost:11434/api"

MODEL_NAME = os.getenv("VALIDATOR_MODEL", "ollama:llama3.1")

validator_agent = Agent(
    MODEL_NAME,
    name='validator_agent',
    output_type=TravelConstraints,
    retries=3,
    instructions=(
        "You are the Guardrail Validator Agent. Your job is to extract travel constraints "
        "from the user's natural language input and output a strict JSON matching the required schema. "
        "Ensure all constraints such as budget, dates, nodes, and meal requirements are accurately captured. "
        "If a specific budget is not mentioned, make a reasonable estimate based on the destination and trip length. "
        "Do not invent points of interest that are not mentioned or implied by the user."
    )
)

async def validator_node(state: dict) -> dict:
    """
    LangGraph node wrapper for the Pydantic AI Validator Agent.
    """
    last_msg = state["messages"][-1].content
    retrieved_context = state.get("retrieved_context", "")
    
    prompt = f"Context: {retrieved_context}\n\nUser Request: {last_msg}"
    
    result = await validator_agent.run(prompt)
    
    return {"constraints": result.output}
