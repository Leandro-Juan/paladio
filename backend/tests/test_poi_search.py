from unittest.mock import AsyncMock, patch

import pytest
from app.db.models import AttractionModel, CityModel
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture(autouse=True)
async def seed_poi_test_data(db_session: AsyncSession):
    """Seeds test attractions and city for Madrid into the test database."""
    existing_city = await db_session.get(CityModel, "madrid_es")
    if not existing_city:
        city = CityModel(
            id="madrid_es",
            name="Madrid",
            country_code="ES",
            center_lat=40.4168,
            center_lon=-3.7038,
            bbox=[-3.8, 40.3, -3.6, 40.5],
            radius_km=15.0,
            timezone="Europe/Madrid",
            currency="EUR",
            aliases=["madrid", "Madrid"],
            profile={},
        )
        db_session.add(city)

    # 768-dimensional normalized test vectors
    vec_prado = [0.0] * 768
    vec_prado[0] = 1.0

    vec_palacio = [0.0] * 768
    vec_palacio[0] = 0.8
    vec_palacio[1] = 0.6

    vec_cafe = [0.0] * 768
    vec_cafe[2] = 1.0

    attractions = [
        AttractionModel(
            id="OSM-node-madrid-prado",
            city="Madrid",
            city_id="madrid_es",
            name="Museo del Prado",
            category="museum",
            embedding=vec_prado,
            location={"latitude": 40.4138, "longitude": -3.6922},
            scoring={"google_rating": 4.8},
            metadata_field={"source": "test"},
            duration_mins=120,
            cost_eur=15.0,
        ),
        AttractionModel(
            id="OSM-node-madrid-palacio-real",
            city="Madrid",
            city_id="madrid_es",
            name="Palacio Real de Madrid",
            category="museum",
            embedding=vec_palacio,
            location={"latitude": 40.418, "longitude": -3.7143},
            scoring={"google_rating": 4.7},
            metadata_field={"source": "test"},
            duration_mins=90,
            cost_eur=14.0,
        ),
        AttractionModel(
            id="OSM-node-madrid-cafe-central",
            city="Madrid",
            city_id="madrid_es",
            name="Café Central",
            category="cafe",
            embedding=vec_cafe,
            location={"latitude": 40.4131, "longitude": -3.7011},
            scoring={"google_rating": 4.6},
            metadata_field={"source": "test"},
            duration_mins=45,
            cost_eur=8.0,
        ),
    ]
    for a in attractions:
        await db_session.merge(a)
    await db_session.commit()


@pytest.mark.asyncio
async def test_poi_search_exact_match(async_client: AsyncClient):
    """Verifies that an exact/fuzzy POI name search returns exact match and similar items."""
    resp = await async_client.get(
        "/api/v1/pois/search", params={"city": "Madrid", "query": "el prado"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["city"] == "Madrid"
    assert data["exact_match_found"] is True
    assert data["exact_match"] is not None
    assert "Prado" in data["exact_match"]["name"]
    assert data["exact_match"]["similarity"] == 1.0
    assert isinstance(data["results"], list)
    assert len(data["results"]) >= 1
    for item in data["results"]:
        assert 0.0 <= item["similarity"] <= 1.0


@pytest.mark.asyncio
async def test_poi_search_natural_language(async_client: AsyncClient):
    """Verifies that a natural language descriptive query retrieves semantic RAG results."""
    mock_vec = [0.0] * 768
    mock_vec[2] = 1.0  # aligns closely with Café Central

    with patch(
        "app.api.v1.pois.OllamaEmbeddingProvider.embed_text",
        new=AsyncMock(return_value=mock_vec),
    ):
        resp = await async_client.get(
            "/api/v1/pois/search",
            params={"city": "Madrid", "query": "good and cozy cafes with charm"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["city"] == "Madrid"
        assert data["search_type"] == "semantic_rag"
        assert isinstance(data["results"], list)
        assert len(data["results"]) > 0
        assert data["results"][0]["name"] == "Café Central"
        sims = [r["similarity"] for r in data["results"]]
        assert sims == sorted(sims, reverse=True)
        for s in sims:
            assert 0.0 <= s <= 1.0


@pytest.mark.asyncio
async def test_poi_search_not_found(async_client: AsyncClient):
    """Verifies that querying a nonexistent POI name informs the user."""
    mock_vec = [0.0] * 768
    mock_vec[5] = 1.0

    with patch(
        "app.api.v1.pois.OllamaEmbeddingProvider.embed_text",
        new=AsyncMock(return_value=mock_vec),
    ):
        resp = await async_client.get(
            "/api/v1/pois/search",
            params={"city": "Madrid", "query": "Statue of Liberty"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["exact_match_found"] is False
        assert data["exact_match"] is None
        assert data["message"] is not None
        assert "Statue of Liberty" in data["message"]
