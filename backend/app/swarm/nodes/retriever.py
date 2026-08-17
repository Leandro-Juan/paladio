import os
from langchain_ollama import OllamaEmbeddings
from langchain_postgres.vectorstores import PGVector
from app.swarm.state import SwarmState

# Environment variables setup
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "paladio")
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Connection string
CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
COLLECTION_NAME = "madrid_pois"

# Initialize vector store
embeddings = OllamaEmbeddings(
    model="nomic-embed-text",
    base_url=OLLAMA_URL
)

try:
    vectorstore = PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=CONNECTION_STRING,
        use_jsonb=True,
    )
    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
except Exception as e:
    print(f"Warning: Could not connect to pgvector database: {e}")
    retriever = None

async def rag_node(state: SwarmState) -> dict:
    """
    Retrieves POI context from the local pgvector database.
    """
    last_msg = state["messages"][-1].content
    
    if not retriever:
        return {"retrieved_context": "No database connection available."}
        
    try:
        # Astream or ainvoke would be better if async was natively supported nicely 
        # by the basic PGVector store in this setup, but invoke works for now.
        docs = await retriever.ainvoke(last_msg)
        context = "\n\n".join([doc.page_content for doc in docs])
        return {"retrieved_context": context}
    except Exception as e:
        print(f"Error during retrieval: {e}")
        return {"retrieved_context": "Error retrieving context."}
