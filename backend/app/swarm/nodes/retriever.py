import logging
import os

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
    Retrieves POI context from the local pgvector database.
    """
    logger.info("--- [PHASE: RAG] Retrieving context from database ---")
    last_msg = state["messages"][-1].content
    logger.debug(f"User query for retrieval: {last_msg}")

    validated = state.get("validated_itinerary") or {}
    city = validated.get("destination_city")

    if not city or city.lower() == "unknown":
        logger.warning("No valid destination city found. Skipping context retrieval.")
        return {"retrieved_context": ""}

    retriever = get_retriever(city)
    if not retriever:
        logger.warning("No retriever available, skipping context retrieval.")
        return {"retrieved_context": ""}

    try:
        # Astream or ainvoke would be better if async was natively supported nicely
        # by the basic PGVector store in this setup, but invoke works for now.
        import asyncio

        docs = await asyncio.to_thread(retriever.invoke, last_msg)
        context = "\n\n".join([doc.page_content for doc in docs])
        logger.info(
            f"--- [PHASE: RAG] Successfully retrieved {len(docs)} documents ({len(context)} chars) ---"
        )
        return {"retrieved_context": context}
    except Exception as e:
        logger.error(f"Error during retrieval: {e}")
        return {"retrieved_context": ""}
