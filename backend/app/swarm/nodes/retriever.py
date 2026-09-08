import asyncio
import logging
import os

from app.schemas.itinerary import NodeConstraint, TravelConstraints
from app.schemas.rag_schema import RAGPromptAnalysis
from app.swarm.state import SwarmState
from langchain_ollama import OllamaEmbeddings
from langchain_postgres.vectorstores import PGVector
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)

# Environment variables setup
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "paladio")
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435")

# Connection string
CONNECTION_STRING = (
    f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# Initialize vector store
embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=OLLAMA_URL)

_retrievers = {}
_rag_model_instance = None


def get_rag_model():
    global _rag_model_instance
    if _rag_model_instance is not None:
        return _rag_model_instance

    ollama_env_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435/v1")
    if not ollama_env_url.endswith("/v1"):
        ollama_env_url = f"{ollama_env_url.rstrip('/')}/v1"

    MODEL_NAME = os.getenv("RAG_MODEL", os.getenv("VALIDATOR_MODEL", "ollama:qwen2.5"))
    actual_model = (
        MODEL_NAME.replace("ollama:", "")
        if MODEL_NAME.startswith("ollama:")
        else MODEL_NAME
    )
    provider = OllamaProvider(base_url=ollama_env_url)
    _rag_model_instance = OllamaModel(actual_model, provider=provider)
    return _rag_model_instance


rag_analysis_agent = Agent(
    name="rag_analyzer",
    output_type=RAGPromptAnalysis,
    retries=2,
    instructions=(
        "You analyze user travel requests to extract mandatory POIs, preferred cuisines, travel tastes, and tag affinities. "
        "IMPORTANT: You MUST use the `final_result` tool to return your answer. Do not output raw text. "
        "Extract: "
        "- `mandatory_pois`: Specific landmarks, museums, or places the user explicitly says they MUST or NEED to visit (e.g. 'El Prado', 'Louvre'). "
        "- `preferred_cuisines`: Cuisines or food types mentioned (e.g. 'indian', 'italian', 'tapas'). "
        "- `travel_tastes`: Desired atmospheres, trip styles, or activities (e.g. 'bar', 'relaxed', 'cultural', 'art'). "
        "- `tag_affinities`: Dictionary with estimated affinity weights (0.0 to 1.0) for any relevant standard tags from: "
        "['art_culture', 'history_heritage', 'nature_outdoors', 'architecture', 'food_culinary', 'nightlife', 'shopping', 'scenic_views']. "
        "E.g., if user loves art and museums, set 'art_culture': 0.9. If user loves bars, set 'nightlife': 0.85. "
        "- `cuisine_target_frequency`: 1 or 2 meal slots for requested preferred cuisine across the trip."
    ),
)


def get_retriever(city: str):
    global _retrievers
    if not city:
        return None
    city_key = city.lower().strip()
    if city_key in _retrievers:
        return _retrievers[city_key]

    collection_name = f"{city_key}_pois"
    try:
        vectorstore = PGVector(
            embeddings=embeddings,
            collection_name=collection_name,
            connection=CONNECTION_STRING,
            use_jsonb=True,
        )
        _retrievers[city_key] = vectorstore.as_retriever(search_kwargs={"k": 5})
        return _retrievers[city_key]
    except Exception as e:
        logger.warning(
            f"Warning: Could not connect to pgvector database for {collection_name}: {e}"
        )
    return None


async def rag_node(state: SwarmState) -> dict:
    """
    LLM-powered RAG node:
    1. Analyzes human prompt using qwen2.5 (Pydantic AI agent) to extract mandatory POIs and tastes.
    2. Queries pgvector database for matching POIs in the destination city.
    3. Updates validated_itinerary with mandatory POI nodes & travel tastes.
    """
    logger.info("--- [PHASE: RAG] Analyzing user prompt & retrieving context ---")

    # 1. Collect all human messages
    user_messages = []
    messages = state.get("messages") or []
    for msg in messages:
        if hasattr(msg, "content") and msg.content:
            user_messages.append(msg.content)
        elif isinstance(msg, dict) and "content" in msg:
            user_messages.append(msg["content"])

    full_prompt = "\n".join(user_messages) if user_messages else ""
    logger.debug(f"Combined prompt for RAG analysis: {full_prompt}")

    validated = state.get("validated_itinerary") or {}

    # 2. Run LLM Analysis (qwen2.5) on the prompt
    analysis = RAGPromptAnalysis()
    if full_prompt.strip():
        model = get_rag_model()
        try:
            res = await rag_analysis_agent.run(full_prompt, model=model)
            analysis = res.output
            logger.info(
                f"LLM RAG Analysis result: mandatory_pois={analysis.mandatory_pois}, "
                f"preferred_cuisines={analysis.preferred_cuisines}, travel_tastes={analysis.travel_tastes}, "
                f"tag_affinities={analysis.tag_affinities}"
            )
        except Exception as e:
            logger.warning(
                f"RAG LLM prompt analysis failed, proceeding with defaults: {e}"
            )

    # 3. Update validated_itinerary constraints with extracted mandatory POIs and tastes
    constraints_dict = dict(validated)

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

    city = updated_validated.get("destination_city")

    if not city or city.lower() == "unknown":
        logger.warning("No valid destination city found. Skipping context retrieval.")
        return {
            "retrieved_context": "",
            "validated_itinerary": updated_validated,
        }

    # 4. Perform vector retrieval using LLM analysis terms
    retriever = get_retriever(city)
    if not retriever:
        logger.warning("No retriever available, skipping context retrieval.")
        return {
            "retrieved_context": "",
            "validated_itinerary": updated_validated,
        }

    search_query = full_prompt
    if analysis.mandatory_pois or analysis.preferred_cuisines or analysis.travel_tastes:
        search_query = " ".join(
            analysis.mandatory_pois
            + analysis.preferred_cuisines
            + analysis.travel_tastes
        )

    try:
        docs = await asyncio.to_thread(retriever.invoke, search_query)
        context = "\n\n".join([doc.page_content for doc in docs])
        logger.info(
            f"--- [PHASE: RAG] Successfully retrieved {len(docs)} documents ({len(context)} chars) ---"
        )
        return {
            "retrieved_context": context,
            "validated_itinerary": updated_validated,
        }
    except Exception as e:
        logger.error(f"Error during retrieval: {e}")
        return {
            "retrieved_context": "",
            "validated_itinerary": updated_validated,
        }
