from unittest.mock import AsyncMock, patch

import pytest
from app.db.models import AttractionModel, CityModel
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture(autouse=True)
async def seed_poi_details_data(db_session: AsyncSession):
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

    existing_poi = await db_session.get(AttractionModel, "OSM-node-madrid-prado-test")
    if not existing_poi:
        poi = AttractionModel(
            id="OSM-node-madrid-prado-test",
            city="Madrid",
            city_id="madrid_es",
            name="Museo del Prado Test",
            category="museum",
            cost_eur=15.0,
            cost_is_estimated=False,
            cost_source="verified_catalog",
            duration_mins=120,
            open_time_mins_by_day=[600] * 7,
            close_time_mins_by_day=[1200] * 7,
            location={"latitude": 40.4138, "longitude": -3.6922},
            scoring={"rating": 4.8, "reviews": 1250},
            metadata_field={
                "source": "osm",
                "tags": {
                    "website": "https://www.museodelprado.es",
                    "opening_hours": "Mo-Sa 10:00-20:00; Su 10:00-19:00",
                },
            },
            wikipedia_title="es:Museo del Prado",
            wikidata_id="Q160112",
            neighborhood="Jerónimos",
            doc_quality="A",
            hours_known=True,
        )
        db_session.add(poi)
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_poi_details_success(async_client: AsyncClient):
    """Test retrieving existing POI details returns full model and resolved photos."""
    mock_photos = [
        {
            "url": "https://upload.wikimedia.org/wikipedia/commons/test_full.jpg",
            "thumbnail_url": "https://upload.wikimedia.org/wikipedia/commons/test_thumb.jpg",
            "caption": "Museo del Prado Main Facade",
            "author": "Wikimedia Contributor",
            "license_name": "CC BY-SA 4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        }
    ]

    with patch(
        "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.resolve_photos",
        new=AsyncMock(
            return_value=(mock_photos, "Authoritative test extract from Wikipedia.")
        ),
    ):
        res = await async_client.get("/api/v1/pois/OSM-node-madrid-prado-test/details")
        assert res.status_code == 200
        data = res.json()

        assert data["id"] == "OSM-node-madrid-prado-test"
        assert data["name"] == "Museo del Prado Test"
        assert data["category"] == "museum"
        assert data["cost_eur"] == 15.0
        assert data["duration_mins"] == 120
        assert data["scoring"]["rating"] == 4.8
        assert data["neighborhood"] == "Jerónimos"
        assert data["website"] == "https://www.museodelprado.es"
        assert len(data["photos"]) == 1
        assert data["photos"][0]["url"] == mock_photos[0]["url"]
        assert data["photos"][0]["license_name"] == "CC BY-SA 4.0"
        assert data["description"] == "Authoritative test extract from Wikipedia."


@pytest.mark.asyncio
async def test_get_poi_details_not_found(async_client: AsyncClient):
    """Test 404 response for non-existent POI ID."""
    res = await async_client.get("/api/v1/pois/non-existent-poi-id-999/details")
    assert res.status_code == 404
    data = res.json()
    assert "not found" in data["detail"].lower()
