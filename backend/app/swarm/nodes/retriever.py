import asyncio
import logging
import os

from app.swarm.agents.prompt_analyzer import (
    get_prompt_model,
    get_prompt_model as get_rag_model,
    prompt_analysis_agent,
    prompt_analysis_agent as rag_analysis_agent,
    prompt_analyzer_node,
)
from app.swarm.state import SwarmState
from langchain_ollama import OllamaEmbeddings
from langchain_postgres.vectorstores import PGVector

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
    RAG retrieval node:
    1. Reads destination city and extracted search preferences from state.
    2. Queries pgvector database for matching POIs in the destination city.
    3. Emits retrieved_context to state.
    """
    logger.info("--- [PHASE: RAG] Retrieving context from vector store ---")

    validated = state.get("validated_itinerary") or {}
    city = validated.get("destination_city")

    if not city or city.lower() == "unknown":
        logger.warning("No valid destination city found. Skipping context retrieval.")
        return {"retrieved_context": ""}

    retriever = get_retriever(city)
    if not retriever:
        logger.warning("No retriever available, skipping context retrieval.")
        return {"retrieved_context": ""}

    # 1. Build search query from prompt analysis or validated itinerary
    terms = []
    analysis = state.get("prompt_analysis")
    if isinstance(analysis, dict):
        terms.extend(analysis.get("mandatory_pois") or [])
        terms.extend(analysis.get("preferred_cuisines") or [])
        terms.extend(analysis.get("travel_tastes") or [])

    if not terms:
        # Fallback to validated_itinerary fields
        nodes = validated.get("nodes") or []
        for n in nodes:
            if isinstance(n, dict) and n.get("poi_id"):
                terms.append(n["poi_id"])
        terms.extend(validated.get("preferred_cuisines") or [])
        terms.extend(validated.get("travel_tastes") or [])

    if terms:
        search_query = " ".join(dict.fromkeys(terms))
    else:
        # Fallback to user message content
        user_messages = []
        messages = state.get("messages") or []
        for msg in messages:
            if hasattr(msg, "content") and msg.content:
                user_messages.append(msg.content)
            elif isinstance(msg, dict) and "content" in msg:
                user_messages.append(msg["content"])
        search_query = "\n".join(user_messages) if user_messages else city

    try:
        docs = await asyncio.to_thread(retriever.invoke, search_query)
        context = "\n\n".join([doc.page_content for doc in docs])
        logger.info(
            f"--- [PHASE: RAG] Successfully retrieved {len(docs)} documents ({len(context)} chars) ---"
        )
        return {"retrieved_context": context}
    except Exception as e:
        logger.error(f"Error during retrieval: {e}")
        return {"retrieved_context": ""}


__all__ = [
    "embeddings",
    "get_retriever",
    "rag_node",
    "get_prompt_model",
    "get_rag_model",
    "prompt_analysis_agent",
    "rag_analysis_agent",
    "prompt_analyzer_node",
    "_retrievers",
]
