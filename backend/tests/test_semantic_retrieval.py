import pytest
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)


@pytest.mark.asyncio
async def test_find_semantic_candidates(db_session):
    from app.schemas.scraper import (
        Attraction,
        AttractionFinancials,
        AttractionSchedule,
        Location,
        Metadata,
        Scoring,
    )

    provider = OllamaEmbeddingProvider()
    query_vec = await provider.embed_text(
        "scenic viewpoints and miradors with city panoramic views"
    )

    repo = SqlPoiRepository(db_session)
    existing = await repo.find_by_city("Lisbon")
    if not existing:
        poi1 = Attraction(
            id="lisbon-miradouro-1",
            type="attraction",
            category="landmark",
            name="Miradouro de Santa Luzia",
            location=Location(latitude=38.7115, longitude=-9.1306),
            schedule=AttractionSchedule(
                osm_opening_hours="Mo-Su 00:00-24:00", recommended_duration_minutes=30
            ),
            financials=AttractionFinancials(is_free=True, estimated_cost=0.0),
            scoring=Scoring(rating=4.8, reviews=1000),
            metadata=Metadata(source="osm"),
        )
        poi2 = Attraction(
            id="lisbon-miradouro-2",
            type="attraction",
            category="landmark",
            name="Miradouro da Senhora do Monte",
            location=Location(latitude=38.7191, longitude=-9.1328),
            schedule=AttractionSchedule(
                osm_opening_hours="Mo-Su 00:00-24:00", recommended_duration_minutes=30
            ),
            financials=AttractionFinancials(is_free=True, estimated_cost=0.0),
            scoring=Scoring(rating=4.9, reviews=1500),
            metadata=Metadata(source="osm"),
        )
        await repo.save_all_for_city("Lisbon", [poi1, poi2])
        await repo.update_poi_embeddings(
            [
                ("lisbon-miradouro-1", query_vec),
                ("lisbon-miradouro-2", [v * 0.9 for v in query_vec]),
            ]
        )

    results = await repo.find_semantic_candidates("Lisbon", query_vec, limit=10)

    assert len(results) > 0
    for poi, sim in results:
        assert poi.name
        assert isinstance(sim, float)
        assert 0.0 <= sim <= 1.0

    # Verify results are sorted descending by affinity
    scores = [sim for _, sim in results]
    assert scores == sorted(scores, reverse=True)
