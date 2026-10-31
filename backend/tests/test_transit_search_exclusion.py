from unittest.mock import AsyncMock, patch
import pytest
from app.db.models import AttractionModel, CityModel
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture(autouse=True)
async def seed_transit_search_data(db_session: AsyncSession):
    """Seeds test attractions including transit stations into the test database."""
    existing_city = await db_session.get(CityModel, "tokyo_jp")
    if not existing_city:
        city = CityModel(
            id="tokyo_jp",
            name="Tokyo",
            country_code="JP",
            center_lat=35.6762,
            center_lon=139.6503,
            bbox=[139.5, 35.5, 139.8, 35.8],
            radius_km=20.0,
            timezone="Asia/Tokyo",
            currency="JPY",
            aliases=["tokyo", "Tokyo"],
            profile={},
        )
        db_session.add(city)

    vec_sample = [0.0] * 768
    vec_sample[0] = 1.0

    attractions = [
        AttractionModel(
            id="OSM-node-tokyo-sensoji",
            city="Tokyo",
            city_id="tokyo_jp",
            name="Senso-ji Temple",
            category="attraction",
            location={"latitude": 35.7148, "longitude": 139.7967},
            scoring={"rating": 4.8, "reviews": 5000, "iconicity_score": 0.98},
            tier=1,
            iconicity_score=0.98,
            duration_mins=90,
            cost_eur=0.0,
            embedding=vec_sample,
            metadata_field={},
            description="Famous historic temple in Asakusa",
        ),
        AttractionModel(
            id="OSM-transit-metro-asakusa",
            city="Tokyo",
            city_id="tokyo_jp",
            name="Asakusa Station",
            category="transit",
            location={"latitude": 35.7120, "longitude": 139.7980},
            scoring={"rating": 4.0, "reviews": 100, "iconicity_score": 0.85},
            tier=2,
            iconicity_score=0.85,
            duration_mins=10,
            cost_eur=1.80,
            embedding=vec_sample,
            metadata_field={
                "transit_info": {"type": "metro", "lines": ["Asakusa Line"]}
            },
            description="Public transit metro station serving Asakusa Line",
        ),
        AttractionModel(
            id="OSM-transit-train-ueno",
            city="Tokyo",
            city_id="tokyo_jp",
            name="Ueno Station",
            category="train",
            location={"latitude": 35.7141, "longitude": 139.7774},
            scoring={"rating": 4.0, "reviews": 200, "iconicity_score": 0.80},
            tier=2,
            iconicity_score=0.80,
            duration_mins=10,
            cost_eur=1.80,
            embedding=vec_sample,
            metadata_field={
                "transit_info": {"type": "train", "lines": ["Yamanote Line"]}
            },
            description="Major railway hub station",
        ),
    ]

    for a in attractions:
        existing = await db_session.get(AttractionModel, a.id)
        if not existing:
            db_session.add(a)

    await db_session.commit()


@pytest.mark.asyncio
async def test_search_all_excludes_transit(async_client: AsyncClient):
    """Ensures general recommendation search excludes all transit POIs."""
    resp = await async_client.get(
        "/api/pois/search", params={"city": "Tokyo", "category": "all"}
    )
    assert resp.status_code == 200
    data = resp.json()
    items = data["results"]
    for item in items:
        assert item["category"].lower() != "transit"
        assert not item["id"].startswith("OSM-transit-")
        assert "Station" not in item["name"]


@pytest.mark.asyncio
async def test_search_category_transit_returns_empty(async_client: AsyncClient):
    """Requesting the transit category from POI Search returns empty (transit moved to dedicated tab)."""
    resp = await async_client.get(
        "/api/pois/search", params={"city": "Tokyo", "category": "transit"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_search_free_text_excludes_transit(async_client: AsyncClient):
    """Free text search for a station name should not return transit rows."""
    with patch(
        "app.api.pois.OllamaEmbeddingProvider.embed_text",
        new=AsyncMock(return_value=[0.0] * 768),
    ):
        resp = await async_client.get(
            "/api/pois/search", params={"city": "Tokyo", "query": "Asakusa Station"}
        )
        assert resp.status_code == 200
        data = resp.json()
        for item in data["results"]:
            assert item["category"].lower() != "transit"
            assert not item["id"].startswith("OSM-transit-")
