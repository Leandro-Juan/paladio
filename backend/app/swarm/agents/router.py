import os
import logging
from typing import Literal
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider
from app.swarm.state import SwarmState

logger = logging.getLogger(__name__)

# Same LLM configuration logic as validator
ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

if not ollama_env_url.endswith("/v1"):
    ollama_env_url = ollama_env_url.rstrip("/")
    if ollama_env_url.endswith("/api"):
        ollama_env_url = ollama_env_url[:-4]
    router_url = f"{ollama_env_url}/v1"
else:
    router_url = ollama_env_url

MODEL_NAME = os.getenv("ROUTER_MODEL", "ollama:llama3.1")
actual_model = MODEL_NAME.replace("ollama:", "") if MODEL_NAME.startswith("ollama:") else MODEL_NAME
provider = OllamaProvider(base_url=router_url)
model = OllamaModel(actual_model, provider=provider)

class RouterOutput(BaseModel):
    intent: Literal['REACTIVE_PLANNING', 'PROACTIVE_MONITORING']

router_agent = Agent(
    model,
    name='router_agent',
    output_type=RouterOutput,
    retries=3,
    system_prompt=(
        "You are the Intent Router Agent. Your job is to classify the user's natural language input "
        "into one of two specific categories:\n"
        "- 'REACTIVE_PLANNING': The user wants to generate, build, or plan an itinerary, or asks for travel advice/information.\n"
        "- 'PROACTIVE_MONITORING': The user wants to set an alert, monitor prices, or be notified when flights or hotels drop in price.\n"
        "Output ONLY the classified intent."
    )
)

async def router_node(state: SwarmState) -> dict:
    """
    LangGraph node wrapper for the Pydantic AI Router Agent.
    """
    logger.info("--- [PHASE: ROUTER] Classifying user intent ---")
    last_msg = state["messages"][-1].content
    
    logger.debug("Calling Pydantic AI Router Agent...")
    result = await router_agent.run(last_msg)
    
    intent = result.output.intent
    logger.info(f"--- [PHASE: ROUTER] Intent classified as: {intent} ---")
    return {"intent": intent}
