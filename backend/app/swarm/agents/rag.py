from app.swarm.state import SwarmState


async def rag_node(state: SwarmState) -> dict:
    """
    Queries pgvector knowledge base for localized destination constraints.
    """
    # Stub: Mock retrieved context
    return {
        "retrieved_context": "Museums are generally closed on Mondays. Avoid scheduling museums then."
    }
