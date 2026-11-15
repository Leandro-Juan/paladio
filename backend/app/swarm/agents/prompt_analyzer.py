import logging
from typing import Any

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

    merged_taste_dict: dict[str, Any] | None = state.get("taste_profile")
    user_id = state.get("user_id")
    participants = state.get("participants") or validated.get("participants")
    trip_id = state.get("trip_id") or validated.get("trip_id") or validated.get("id")

    if merged_taste_dict is None and (user_id or trip_id or participants):
        try:
            from app.application.taste.taste_service import TasteService
            from app.db.session import async_session

            if TasteService.is_personalization_enabled():
                async with async_session() as db_sess:
                    merged_prof = await TasteService.get_merged_trip_profile(
                        session=db_sess,
                        organizer_user_id=user_id,
                        trip_id=trip_id,
                        participant_specs=participants,
                    )
                    merged_taste_dict = merged_prof.model_dump(mode="json")
        except Exception as exc:
            logger.debug("Could not load merged trip taste profile: %s", exc)

    extract_state = dict(state)
    if merged_taste_dict is not None:
        extract_state["taste_profile"] = merged_taste_dict

    analysis = RAGPromptAnalysis()
    if full_prompt.strip():
        try:
            analysis = await PromptIntentExtractor.extract(
                prompt=full_prompt,
                destination_city=dest_city,
                user_language=user_lang,
                state=extract_state,
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
    manual_constraints = state.get("manual_constraints") or {}
    if not manual_constraints.get("pace") and analysis.pace:
        constraints_dict["pace"] = analysis.pace
    if analysis.prefers_offbeat:
        constraints_dict["prefers_offbeat"] = True
    if trip_id is not None:
        constraints_dict["trip_id"] = trip_id
    if merged_taste_dict is not None:
        constraints_dict["taste_profile"] = merged_taste_dict
    if participants is not None:
        constraints_dict["participants"] = participants

    if full_prompt.strip() and user_id and user_id != "default_user":
        try:
            from app.application.taste.taste_service import TasteService
            from app.db.session import async_session

            if TasteService.is_personalization_enabled():
                async with async_session() as db_sess:
                    await TasteService.on_prompt_analyzed(
                        session=db_sess,
                        user_id=user_id,
                        prompt_text=full_prompt,
                        analysis_dict=analysis.model_dump(mode="json"),
                        trip_id=trip_id,
                    )
        except Exception as exc:
            logger.debug("Could not persist prompt taste signal: %s", exc)

    try:
        constraints = TravelConstraints(**constraints_dict)
        updated_validated = constraints.model_dump(mode="json")
    except Exception as val_e:
        logger.warning(f"Failed to re-validate constraints dict: {val_e}")
        updated_validated = constraints_dict

    out_state: dict[str, Any] = {
        "validated_itinerary": updated_validated,
        "prompt_analysis": analysis.model_dump(mode="json"),
    }
    if merged_taste_dict is not None:
        out_state["taste_profile"] = merged_taste_dict
    return out_state
