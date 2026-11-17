from unittest.mock import AsyncMock, MagicMock, patch

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

    vec_bar = [0.0] * 768
    vec_bar[3] = 1.0

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
            tier=1,
            iconicity_score=0.99,
            duration_mins=120,
            cost_eur=15.0,
        ),
        AttractionModel(
            id="OSM-node-madrid-bar-prado",
            city="Madrid",
            city_id="madrid_es",
            name="El Prado",
            category="bar",
            embedding=vec_bar,
            location={"latitude": 40.4120, "longitude": -3.6980},
            scoring={"google_rating": 3.9},
            metadata_field={"source": "test"},
            tier=4,
            iconicity_score=0.10,
            duration_mins=45,
            cost_eur=5.0,
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
            tier=1,
            iconicity_score=0.95,
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
            tier=3,
            iconicity_score=0.30,
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
        "/api/pois/search", params={"city": "Madrid", "query": "el prado"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["city"] == "Madrid"
    assert data["exact_match_found"] is True
    assert data["exact_match"] is not None
    # Must disambiguate to Tier 1 museum rather than the local Tier 4 bar
    assert data["exact_match"]["name"] == "Museo del Prado"
    assert data["exact_match"]["category"] == "museum"
    assert data["exact_match"]["similarity"] == 1.0
    assert isinstance(data["results"], list)
    assert len(data["results"]) >= 1
    # Similar places should have positive, non-zero cosine similarity
    assert data["results"][0]["similarity"] > 0.5
    for item in data["results"]:
        assert 0.0 <= item["similarity"] <= 1.0


@pytest.mark.asyncio
async def test_poi_search_natural_language(async_client: AsyncClient):
    """Verifies that a natural language descriptive query retrieves semantic RAG results."""
    mock_vec = [0.0] * 768
    mock_vec[2] = 1.0  # aligns closely with Café Central

    with patch(
        "app.api.pois.OnnxEmbeddingProvider.embed_text",
        new=AsyncMock(return_value=mock_vec),
    ):
        resp = await async_client.get(
            "/api/pois/search",
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
        "app.api.pois.OnnxEmbeddingProvider.embed_text",
        new=AsyncMock(return_value=mock_vec),
    ):
        resp = await async_client.get(
            "/api/pois/search",
            params={"city": "Madrid", "query": "Statue of Liberty"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["exact_match_found"] is False
        assert data["exact_match"] is None
        assert data["message"] is not None
        assert "Statue of Liberty" in data["message"]


@pytest.mark.asyncio
async def test_poi_search_hotel_and_airport_anchors(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verifies that querying 'hotel' or 'airport' returns trip-specific anchors."""
    import uuid
    from app.db.models import TripModel

    trip_id = f"test-trip-anchors-{uuid.uuid4()}"
    trip = TripModel(
        id=trip_id,
        destination="Madrid",
        start_date="2026-11-01",
        end_date="2026-11-05",
        itinerary_data={
            "hotel": {
                "name": "Gran Hotel Madrid Anchor",
                "lat": 40.4180,
                "lng": -3.7030,
            },
            "airport": {
                "name": "Barajas Airport Terminal 4",
                "lat": 40.4900,
                "lng": -3.5700,
            },
            "days": [],
        },
    )
    db_session.add(trip)
    await db_session.commit()

    # Search for hotel with trip_id
    resp_hotel = await async_client.get(
        "/api/pois/search",
        params={"city": "Madrid", "query": "hotel", "trip_id": trip.id},
    )
    assert resp_hotel.status_code == 200
    hotel_data = resp_hotel.json()
    assert hotel_data["exact_match_found"] is True
    assert hotel_data["exact_match"]["name"] == "Gran Hotel Madrid Anchor"
    assert hotel_data["exact_match"]["category"].upper() == "HOTEL"

    # Search for airport with trip_id
    resp_airport = await async_client.get(
        "/api/pois/search",
        params={"city": "Madrid", "query": "airport", "trip_id": trip.id},
    )
    assert resp_airport.status_code == 200
    airport_data = resp_airport.json()
    assert airport_data["exact_match_found"] is True
    assert airport_data["exact_match"]["name"] == "Barajas Airport Terminal 4"
    assert airport_data["exact_match"]["category"].upper() == "AIRPORT"


@pytest.mark.asyncio
async def test_category_browse_empty_query(async_client: AsyncClient):
    """Verifies that an empty query with category filter browses POIs of that category."""
    resp = await async_client.get(
        "/api/pois/search",
        params={"city": "Madrid", "query": "", "category": "museum", "limit": 10},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["search_type"] == "category_browse"
    assert len(data["results"]) > 0
    for item in data["results"]:
        assert item["category"].lower() in ("museum", "gallery", "exhibition")


@pytest.mark.asyncio
async def test_poi_search_circle_radius_filter(async_client: AsyncClient):
    """Verifies that circle_lat, circle_lng, and circle_radius filter POIs within geographic radius."""
    # 1. Search with center near Museo del Prado (40.4138, -3.6922) with 500m radius
    resp_near = await async_client.get(
        "/api/pois/search",
        params={
            "city": "Madrid",
            "query": "Prado",
            "circle_lat": 40.4138,
            "circle_lng": -3.6922,
            "circle_radius": 500.0,
        },
    )
    assert resp_near.status_code == 200
    data_near = resp_near.json()
    assert data_near["exact_match_found"] is True
    assert data_near["exact_match"] is not None
    assert "Prado" in data_near["exact_match"]["name"]

    # 2. Category browse within 500m radius around Prado
    resp_browse = await async_client.get(
        "/api/pois/search",
        params={
            "city": "Madrid",
            "query": "",
            "category": "museum",
            "circle_lat": 40.4138,
            "circle_lng": -3.6922,
            "circle_radius": 500.0,
        },
    )
    assert resp_browse.status_code == 200
    data_browse = resp_browse.json()
    assert len(data_browse["results"]) > 0
    assert any("Prado" in r["name"] for r in data_browse["results"])

    # 3. Search with center far away (Barajas area: 40.5000, -3.5000) with 500m radius
    resp_far = await async_client.get(
        "/api/pois/search",
        params={
            "city": "Madrid",
            "query": "Prado",
            "circle_lat": 40.5000,
            "circle_lng": -3.5000,
            "circle_radius": 500.0,
        },
    )
    assert resp_far.status_code == 200
    data_far = resp_far.json()
    # Prado is ~18km away, so exact match and results must be empty
    assert data_far.get("exact_match") is None
    assert not any("Prado" in r["name"] for r in data_far.get("results", []))


@pytest.mark.asyncio
async def test_poi_search_prioritizes_richer_info(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verifies that POIs with richer metadata are slightly prioritized over sparse POIs."""
    vec_gallery = [0.0] * 768
    vec_gallery[6] = 1.0

    sparse_gallery = AttractionModel(
        id="OSM-node-madrid-sparse-gallery",
        city="Madrid",
        city_id="madrid_es",
        name="Galería Minimal",
        category="gallery",
        embedding=vec_gallery,
        location={"latitude": 40.4400, "longitude": -3.6800},
        scoring={"google_rating": 4.2},
        metadata_field={"source": "test"},
        tier=2,
        iconicity_score=0.50,
        doc_quality="C",
        description=None,
        neighborhood=None,
        hours_known=False,
        duration_mins=45,
        cost_eur=0.0,
    )
    rich_gallery = AttractionModel(
        id="OSM-node-madrid-rich-gallery",
        city="Madrid",
        city_id="madrid_es",
        name="Galería Completa",
        category="gallery",
        embedding=vec_gallery,
        location={"latitude": 40.4210, "longitude": -3.7010},
        scoring={"google_rating": 4.2},
        metadata_field={"source": "test"},
        tier=2,
        iconicity_score=0.50,
        doc_quality="A",
        description=(
            "Contemporary art gallery in central Madrid featuring rotating exhibitions "
            "from Iberian and international artists across three historic floors."
        ),
        neighborhood="Justicia",
        hours_known=True,
        wikidata_id="Q999999",
        facets={"indoor_outdoor": "indoor", "rain_friendly": True},
        duration_mins=60,
        cost_eur=10.0,
    )
    await db_session.merge(sparse_gallery)
    await db_session.merge(rich_gallery)
    await db_session.commit()

    # 1. Category browse (equal tier & iconicity): rich POI should rank ahead of sparse POI
    resp_browse = await async_client.get(
        "/api/pois/search",
        params={"city": "Madrid", "query": "", "category": "gallery", "limit": 10},
    )
    assert resp_browse.status_code == 200
    browse_names = [r["name"] for r in resp_browse.json()["results"]]
    assert "Galería Completa" in browse_names
    assert "Galería Minimal" in browse_names
    assert browse_names.index("Galería Completa") < browse_names.index(
        "Galería Minimal"
    )

    # 2. Semantic RAG (equal vector similarity): rich POI should rank ahead of sparse POI
    with patch(
        "app.api.pois.OnnxEmbeddingProvider.embed_text",
        new=AsyncMock(return_value=vec_gallery),
    ):
        resp_rag = await async_client.get(
            "/api/pois/search",
            params={
                "city": "Madrid",
                "query": "contemporary art gallery exhibitions",
                "category": "gallery",
                "limit": 10,
            },
        )
        assert resp_rag.status_code == 200
        rag_results = resp_rag.json()["results"]
        rag_names = [r["name"] for r in rag_results]
        assert "Galería Completa" in rag_names
        assert "Galería Minimal" in rag_names
        assert rag_names.index("Galería Completa") < rag_names.index("Galería Minimal")


@pytest.mark.asyncio
async def test_poi_search_erased_city_and_download_flow(async_client: AsyncClient):
    """Verifies that an erased city database returns city_total_pois == 0, and that download/status endpoints work."""
    import os
    import redis

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = redis.from_url(redis_url)
    r.delete("paladio:city_hydration_active:atlantisghostcity")
    r.delete("paladio:lock:hydrate_city:atlantisghostcity")

    try:
        # 1. Search an erased / empty city
        resp = await async_client.get(
            "/api/pois/search",
            params={"city": "AtlantisGhostCity", "query": ""},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["city_total_pois"] == 0
        assert data["is_hydrating"] is False
        assert len(data["results"]) == 0

        # 2. Check city status
        resp_status = await async_client.get("/api/pois/city/AtlantisGhostCity/status")
        assert resp_status.status_code == 200
        status_data = resp_status.json()
        assert status_data["city"] == "AtlantisGhostCity"
        assert status_data["poi_count"] == 0
        assert status_data["is_hydrating"] is False

        # 3. Trigger POI download for city
        with patch("app.tasks.hydrate_city_pipeline_task.delay") as mock_celery:
            mock_task = MagicMock()
            mock_task.id = "mock-task-12345"
            mock_celery.return_value = mock_task

            resp_dl = await async_client.post(
                "/api/pois/city/AtlantisGhostCity/download"
            )
            assert resp_dl.status_code == 200
            dl_data = resp_dl.json()
            assert dl_data["status"] == "initiated"
            assert dl_data["task_id"] == "mock-task-12345"
            assert "AtlantisGhostCity" in dl_data["message"]

        # 4. Check status during active hydration
        resp_hydrating = await async_client.get(
            "/api/pois/city/AtlantisGhostCity/status"
        )
        assert resp_hydrating.status_code == 200
        assert resp_hydrating.json()["is_hydrating"] is True
    finally:
        r.delete("paladio:city_hydration_active:atlantisghostcity")
        r.delete("paladio:lock:hydrate_city:atlantisghostcity")
