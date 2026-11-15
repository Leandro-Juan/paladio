import logging

from app.engine.nlp.intent_extractor import PromptIntentExtractor
from app.schemas.itinerary import NodeConstraint, TravelConstraints
from app.schemas.rag_schema import RAGPromptAnalysis
from app.swarm.state import SwarmState

logger = logging.getLogger(__name__)


async def prompt_analyzer_node(state: SwarmState) -> dict:
    """
    Deterministic prompt analyzer node (LLM-free):
    1. Collects human messages from state.
    2. Runs PromptIntentExtractor (ONNX 768D anchor projection + DB POI fuzzy matching + rule rewriter).
    3. Updates validated_itinerary constraints with extracted values.
    4. Emits prompt_analysis and updated validated_itinerary to state.
    """
    logger.info("--- [PHASE: PROMPT_ANALYSIS] Analyzing user prompt & preferences ---")

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
    user_lang = state.get("user_language")

    analysis = RAGPromptAnalysis()
    if full_prompt.strip():
        try:
            analysis = await PromptIntentExtractor.extract(
                prompt=full_prompt,
                destination_city=dest_city,
                user_language=user_lang,
                state=state,
            )
            logger.info(
                f"Deterministic Prompt Analysis result: mandatory_pois={analysis.mandatory_pois}, "
                f"preferred_cuisines={analysis.preferred_cuisines}, travel_tastes={analysis.travel_tastes}, "
                f"tag_affinities={analysis.tag_affinities}"
            )
        except Exception as e:
            logger.warning(
                f"Deterministic prompt analysis failed, proceeding with defaults: {e}"
            )

    constraints_dict = dict(validated)
    if full_prompt.strip():
        constraints_dict["prompt"] = full_prompt.strip()
    elif state_prompt:
        constraints_dict["prompt"] = state_prompt

    existing_nodes = constraints_dict.get("nodes") or []
    node_map = {}
    for n in existing_nodes:
        if isinstance(n, dict) and "poi_id" in n:
            node_map[n["poi_id"].lower()] = n
        elif isinstance(n, NodeConstraint):
            node_map[n.poi_id.lower()] = n.model_dump(mode="json")

    for m_poi in analysis.mandatory_pois:
        m_key = m_poi.lower().strip()
        if m_key not in node_map:
            node_map[m_key] = NodeConstraint(poi_id=m_poi, mandatory=True).model_dump(
                mode="json"
            )
        else:
            node_map[m_key]["mandatory"] = True

    constraints_dict["nodes"] = list(node_map.values())

    existing_cuisines = constraints_dict.get("preferred_cuisines") or []
    combined_cuisines = list(
        dict.fromkeys(existing_cuisines + analysis.preferred_cuisines)
    )
    constraints_dict["preferred_cuisines"] = combined_cuisines

    existing_tastes = constraints_dict.get("travel_tastes") or []
    combined_tastes = list(dict.fromkeys(existing_tastes + analysis.travel_tastes))
    constraints_dict["travel_tastes"] = combined_tastes

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
