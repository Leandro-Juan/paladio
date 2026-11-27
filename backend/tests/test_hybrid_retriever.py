import pytest
from app.engine.retrieval.query_rewriter import QueryRewriter
from app.engine.retrieval.hybrid_retriever import (
    HybridRetriever,
    _effective_facets,
    compute_facet_match_score,
    compute_doc_quality_bonus,
    compute_info_richness_score,
    apply_spatial_semantic_mmr,
)
from sqlalchemy.ext.asyncio import AsyncSession


def test_query_rewriter_multilingual_expansion():
    # Test Madrid expansion to Spanish terms
    sq_madrid = QueryRewriter.rewrite_query(
        "quiet church and historic art museum", "Madrid"
    )
    assert sq_madrid.clean_query == "quiet church and historic art museum"
    assert len(sq_madrid.semantic_subqueries) >= 2
    # Should include spanish terms
    sub_text = " ".join(sq_madrid.semantic_subqueries).lower()
    assert "iglesia" in sub_text or "madrid" in sub_text

    # Test rain friendly extraction
    sq_rain = QueryRewriter.rewrite_query("indoor museums for a rainy day", "Paris")
    assert sq_rain.require_rain_friendly is True
    assert sq_rain.required_facets.get("rain_friendly") is True
    assert sq_rain.required_facets.get("indoor_outdoor") == "indoor"

    # Test free budget extraction
    sq_free = QueryRewriter.rewrite_query("free scenic viewpoints", "Rome")
    assert sq_free.max_cost_eur == 0.0

    # Test top tier extraction
    sq_top = QueryRewriter.rewrite_query("must-see famous landmarks", "Lisbon")
    assert sq_top.max_tier == 1

    # Test category and lexical keyword extraction for natural-language queries
    sq_cafes = QueryRewriter.rewrite_query("cozy cafes with charm", "Tokyo")
    assert "cafe" in sq_cafes.target_categories
    assert "cafe" in sq_cafes.lexical_keywords
    assert "with" not in sq_cafes.lexical_keywords
    assert "cozy" in sq_cafes.lexical_keywords
    assert "charm" in sq_cafes.lexical_keywords


def test_facet_match_and_doc_quality():
    poi_facets = {
        "rain_friendly": True,
        "indoor_outdoor": "indoor",
        "themes": ["art", "history"],
        "vibes": ["quiet"],
    }
    req_facets = {
        "rain_friendly": True,
        "indoor_outdoor": "indoor",
        "themes": ["art"],
    }
    score = compute_facet_match_score(poi_facets, req_facets)
    assert score == 1.0

    # Doc quality bonus
    assert compute_doc_quality_bonus("A") == 1.0
    assert compute_doc_quality_bonus("B") == 0.6
    assert compute_doc_quality_bonus("C") == 0.0

    # Info richness score
    rich_poi = {
        "doc_quality": "A",
        "description": "A" * 100,
        "neighborhood": "Centro",
        "hours_known": True,
        "facets": {"indoor_outdoor": "indoor"},
        "wikidata_id": "Q160112",
    }
    medium_poi = {
        "doc_quality": "B",
        "description": "Short summary",
        "neighborhood": "Centro",
        "hours_known": False,
    }
    sparse_poi = {
        "doc_quality": "C",
    }
    assert compute_info_richness_score(rich_poi) == 1.0
    assert 0.4 < compute_info_richness_score(medium_poi) < 0.6
    assert compute_info_richness_score(sparse_poi) == 0.0


def test_effective_facets_fallback_when_unenriched():
    # Populated facets take precedence
    explicit = {"rain_friendly": False, "indoor_outdoor": "outdoor"}
    assert _effective_facets({"category": "museum", "facets": explicit}) == explicit

    # Empty facets infer indoor/rain_friendly for indoor categories
    museum_eff = _effective_facets({"category": "museum", "facets": {}})
    assert museum_eff == {"indoor_outdoor": "indoor", "rain_friendly": True}
    assert (
        compute_facet_match_score(
            museum_eff, {"rain_friendly": True, "indoor_outdoor": "indoor"}
        )
        == 1.0
    )

    # Empty facets infer outdoor/non-rain_friendly for outdoor categories
    park_eff = _effective_facets({"category": "park", "facets": None})
    assert park_eff == {"indoor_outdoor": "outdoor", "rain_friendly": False}
    assert (
        compute_facet_match_score(
            park_eff, {"rain_friendly": True, "indoor_outdoor": "indoor"}
        )
        == 0.0
    )


def test_spatial_semantic_mmr_diversification():
    # Candidate 1: Plaza Mayor Sight A
    # Candidate 2: Plaza Mayor Sight B (same category 'church', 50m away from Sight A, high cosine similarity)
    # Candidate 3: Distant Park C (different category 'park', 3km away, low cosine similarity)
    vec1 = [1.0, 0.0, 0.0]
    vec2 = [0.99, 0.01, 0.0]
    vec3 = [0.0, 1.0, 0.0]

    cands = [
        {
            "id": "1",
            "name": "Cathedral A",
            "category": "church",
            "taxonomy_category": "religion_spirituality",
            "location": {"latitude": 40.4150, "longitude": -3.7050},
            "embedding": vec1,
            "composite_score": 0.95,
        },
        {
            "id": "2",
            "name": "Church B",
            "category": "church",
            "taxonomy_category": "religion_spirituality",
            "location": {"latitude": 40.4153, "longitude": -3.7052},  # ~40m away
            "embedding": vec2,
            "composite_score": 0.90,
        },
        {
            "id": "3",
            "name": "Distant Park C",
            "category": "park",
            "taxonomy_category": "nature_outdoors",
            "location": {"latitude": 40.4350, "longitude": -3.6800},  # ~3km away
            "embedding": vec3,
            "composite_score": 0.85,
        },
    ]

    # Select top 2 with MMR (lambda=0.6)
    diversified = apply_spatial_semantic_mmr(cands, limit=2, mmr_lambda=0.6)
    selected_ids = [d["id"] for d in diversified]

    # Cathedral A was highest score so selected first.
    # Distant Park C should be selected over Church B because Church B is penalised by spatial proximity + same category + high cosine similarity!
    assert selected_ids[0] == "1"
    assert selected_ids[1] == "3"


@pytest.mark.asyncio
async def test_hybrid_retriever_sql_cte(db_session: AsyncSession):
    # Verify SQL CTE execution against test database
    vec = [0.0] * 768
    vec[0] = 1.0

    results = await HybridRetriever.search_hybrid(
        session=db_session,
        city="Madrid",
        query_vec=vec,
        clean_query="prado museum",
        limit=5,
        w_vec=0.5,
        w_fts=0.3,
        w_trgm=0.2,
        apply_mmr=True,
    )
    assert isinstance(results, list)
    if results:
        top = results[0]
        assert "composite_score" in top
        assert "norm_rrf" in top
        assert "rrf_score" in top
