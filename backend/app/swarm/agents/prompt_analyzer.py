import logging
import os

from app.schemas.itinerary import NodeConstraint, TravelConstraints
from app.schemas.rag_schema import RAGPromptAnalysis
from app.swarm.state import SwarmState
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)

_model_instance = None


def get_prompt_model():
    global _model_instance
    if _model_instance is not None:
        return _model_instance

    ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435/v1")
    if not ollama_env_url.endswith("/v1"):
        ollama_env_url = f"{ollama_env_url.rstrip('/')}/v1"

    MODEL_NAME = os.getenv(
        "PROMPT_ANALYSIS_MODEL",
        os.getenv("RAG_MODEL", os.getenv("VALIDATOR_MODEL", "ollama:qwen2.5")),
    )
    actual_model = (
        MODEL_NAME.replace("ollama:", "")
        if MODEL_NAME.startswith("ollama:")
        else MODEL_NAME
    )
    provider = OllamaProvider(base_url=ollama_env_url)
    _model_instance = OllamaModel(actual_model, provider=provider)
    return _model_instance


prompt_analysis_agent = Agent(
    name="prompt_analyzer",
    output_type=RAGPromptAnalysis,
    retries=2,
    instructions=(
        "You analyze user travel requests to extract mandatory POIs, preferred cuisines, travel tastes, and tag affinities. "
        "IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw text. "
        "Extract: "
        "- `mandatory_pois`: Specific landmarks, museums, or places the user EXPLICITLY named in their request that they MUST or NEED to visit located in the Destination City. "
        "CRITICAL RULES FOR MANDATORY POIS: "
        "1. NEVER invent or infer specific attractions from general interests (e.g. 'we love modern art' does NOT mean 'MoMA' or any other specific museum; it only sets 'art_culture' affinity). "
        "2. NEVER extract famous international attractions located outside the destination city (e.g. do NOT extract MoMA or Louvre unless the trip destination is explicitly New York or Paris). "
        "3. If no specific real attraction name in the destination city was explicitly requested by the user, return an empty list [] for mandatory_pois. "
        "- `preferred_cuisines`: Cuisines or food types mentioned (e.g. 'indian', 'italian', 'tapas'). "
        "- `travel_tastes`: Desired atmospheres, trip styles, or activities (e.g. 'bar', 'relaxed', 'cultural', 'art'). "
        "- `tag_affinities`: Dictionary with estimated affinity weights (0.0 to 1.0) for any relevant standard tags from: "
        "['art_culture', 'history_heritage', 'nature_outdoors', 'architecture', 'food_culinary', 'nightlife', 'shopping', 'scenic_views']. "
        "E.g., if user loves art and museums, set 'art_culture': 0.9. If user loves bars, set 'nightlife': 0.85. "
        "- `cuisine_target_frequency`: 1 or 2 meal slots for requested preferred cuisine across the trip."
    ),
)


async def prompt_analyzer_node(state: SwarmState) -> dict:
    """
    LLM-powered prompt analyzer node:
    1. Collects human messages from state.
    2. Runs LLM prompt analysis (qwen2.5) to extract mandatory POIs, tastes, and tag affinities.
    3. Updates validated_itinerary constraints with extracted values.
    4. Emits prompt_analysis and updated validated_itinerary to state.
    """
    logger.info("--- [PHASE: PROMPT_ANALYSIS] Analyzing user prompt & preferences ---")

    # 1. Collect all human messages
    user_messages = []
    messages = state.get("messages") or []
    for msg in messages:
        if hasattr(msg, "content") and msg.content:
            user_messages.append(msg.content)
        elif isinstance(msg, dict) and "content" in msg:
            user_messages.append(msg["content"])

    validated = state.get("validated_itinerary") or {}
    state_prompt = state.get("prompt") or validated.get("prompt") or ""
    if state_prompt and state_prompt not in user_messages:
        user_messages.append(state_prompt)

    full_prompt = "\n".join(user_messages) if user_messages else ""
    logger.debug(f"Combined prompt for analysis: {full_prompt}")

    dest_city = (
        validated.get("destination_city") or state.get("destination_city") or "Unknown"
    )
    agent_input = (
        f"Destination City: {dest_city}\nUser Request: {full_prompt}"
        if dest_city != "Unknown"
        else full_prompt
    )

    # 2. Run LLM Analysis on the prompt
    analysis = RAGPromptAnalysis()
    if full_prompt.strip():
        model = get_prompt_model()
        try:
            res = await prompt_analysis_agent.run(agent_input, model=model)
            analysis = res.output

            # Filter out obvious cross-city hallucinations when destination is known
            known_cross_city = {
                "moma": "new york",
                "museum of modern art": "new york",
                "louvre": "paris",
                "louvre museum": "paris",
                "eiffel tower": "paris",
                "colosseum": "rome",
                "sagrada familia": "barcelona",
                "statue of liberty": "new york",
                "british museum": "london",
                "tower of london": "london",
            }
            if dest_city.lower() != "unknown":
                clean_mand = []
                for p_name in analysis.mandatory_pois:
                    norm = p_name.lower().strip()
                    exp_city = known_cross_city.get(norm)
                    if exp_city and exp_city != dest_city.lower():
                        logger.warning(
                            f"Filtered out cross-city hallucinated POI '{p_name}' (exclusive to {exp_city.title()}) for destination '{dest_city}'."
                        )
                        continue
                    clean_mand.append(p_name)
                analysis.mandatory_pois = clean_mand

            logger.info(
                f"LLM Prompt Analysis result: mandatory_pois={analysis.mandatory_pois}, "
                f"preferred_cuisines={analysis.preferred_cuisines}, travel_tastes={analysis.travel_tastes}, "
                f"tag_affinities={analysis.tag_affinities}"
            )
        except Exception as e:
            logger.warning(f"LLM prompt analysis failed, proceeding with defaults: {e}")

    # 3. Update validated_itinerary constraints with extracted mandatory POIs and tastes
    constraints_dict = dict(validated)
    if full_prompt.strip():
        constraints_dict["prompt"] = full_prompt.strip()
    elif state_prompt:
        constraints_dict["prompt"] = state_prompt

    # Existing nodes
    existing_nodes = constraints_dict.get("nodes") or []
    node_map = {}
    for n in existing_nodes:
        if isinstance(n, dict) and "poi_id" in n:
            node_map[n["poi_id"].lower()] = n
        elif isinstance(n, NodeConstraint):
            node_map[n.poi_id.lower()] = n.model_dump(mode="json")

    # Inject LLM-extracted mandatory POIs
    for m_poi in analysis.mandatory_pois:
        m_key = m_poi.lower().strip()
        if m_key not in node_map:
            node_map[m_key] = NodeConstraint(poi_id=m_poi, mandatory=True).model_dump(
                mode="json"
            )
        else:
            node_map[m_key]["mandatory"] = True

    constraints_dict["nodes"] = list(node_map.values())

    # Add preferred_cuisines and travel_tastes
    existing_cuisines = constraints_dict.get("preferred_cuisines") or []
    combined_cuisines = list(
        dict.fromkeys(existing_cuisines + analysis.preferred_cuisines)
    )
    constraints_dict["preferred_cuisines"] = combined_cuisines

    existing_tastes = constraints_dict.get("travel_tastes") or []
    combined_tastes = list(dict.fromkeys(existing_tastes + analysis.travel_tastes))
    constraints_dict["travel_tastes"] = combined_tastes

    # Add tag_affinities from prompt analysis
    existing_tag_affinities = dict(constraints_dict.get("tag_affinities") or {})
    if analysis.tag_affinities:
        existing_tag_affinities.update(analysis.tag_affinities)
    constraints_dict["tag_affinities"] = existing_tag_affinities

    constraints_dict["cuisine_target_frequency"] = max(
        1, analysis.cuisine_target_frequency
    )

    try:
        constraints = TravelConstraints(**constraints_dict)
        updated_validated = constraints.model_dump(mode="json")
    except Exception as val_e:
        logger.warning(f"Failed to re-validate constraints dict: {val_e}")
        updated_validated = constraints_dict

    return {
        "validated_itinerary": updated_validated,
        "prompt_analysis": analysis.model_dump(mode="json"),
    }
