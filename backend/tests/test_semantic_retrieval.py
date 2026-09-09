import pytest
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.db.session import async_session
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)


@pytest.mark.asyncio
async def test_find_semantic_candidates():
    provider = OllamaEmbeddingProvider()
    query_vec = await provider.embed_text(
        "scenic viewpoints and miradors with city panoramic views"
    )

    async with async_session() as session:
        repo = SqlPoiRepository(session)
        results = await repo.find_semantic_candidates("Lisbon", query_vec, limit=10)

        assert len(results) > 0
        for poi, sim in results:
            assert poi.name
            assert isinstance(sim, float)
            assert 0.0 <= sim <= 1.0

        # Verify results are sorted descending by affinity
        scores = [sim for _, sim in results]
        assert scores == sorted(scores, reverse=True)
