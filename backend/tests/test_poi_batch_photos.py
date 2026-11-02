from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttractionModel, CityModel


@pytest.fixture(autouse=True)
async def seed_batch_photo_data(db_session: AsyncSession):
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

    existing_poi = await db_session.get(AttractionModel, "OSM-node-batch-prado")
    if not existing_poi:
        poi = AttractionModel(
            id="OSM-node-batch-prado",
            city="Madrid",
            city_id="madrid_es",
            name="Museo del Prado Batch",
            category="museum",
            cost_eur=15.0,
            cost_is_estimated=False,
            cost_source="verified_catalog",
            duration_mins=120,
            open_time_mins_by_day=[600] * 7,
            close_time_mins_by_day=[1200] * 7,
            location={"latitude": 40.4138, "longitude": -3.6922},
            scoring={"rating": 4.8, "reviews": 1250},
            metadata_field={"source": "osm", "tags": {}},
            wikipedia_title="es:Museo del Prado",
            wikidata_id="Q160112",
            neighborhood="Jerónimos",
            doc_quality="A",
            hours_known=True,
        )
        db_session.add(poi)
    await db_session.commit()


@pytest.mark.asyncio
async def test_batch_photos_endpoint_success(async_client: AsyncClient):
    """Test resolving photos in batch via POST /api/pois/batch-photos."""
    fake_photos = [
        {
            "url": "https://upload.wikimedia.org/prado_full.jpg",
            "thumbnail_url": "https://upload.wikimedia.org/prado_thumb.jpg",
            "caption": "Museo del Prado",
            "author": "Wikimedia Commons",
            "license_name": "CC BY-SA",
            "license_url": "https://creativecommons.org",
        }
    ]

    with patch(
        "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.resolve_photos",
        new_callable=AsyncMock,
        return_value=(fake_photos, "Great museum"),
    ):
        res = await async_client.post(
            "/api/pois/batch-photos",
            json={
                "pois": [
                    {
                        "id": "OSM-node-batch-prado",
                        "name": "Museo del Prado Batch",
                        "city": "Madrid",
                    },
                    {"name": "Hotel Westin", "city": "Madrid"},
                ]
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "photos" in data
        assert "OSM-node-batch-prado" in data["photos"]
        assert (
            data["photos"]["OSM-node-batch-prado"]["thumbnail_url"]
            == "https://upload.wikimedia.org/prado_thumb.jpg"
        )


@pytest.mark.asyncio
async def test_get_poi_details_with_name_fallback(async_client: AsyncClient):
    """Test get_poi_details falls back to dynamic resolution when POI id is not in database."""
    fake_photos = [
        {
            "url": "https://upload.wikimedia.org/hotel.jpg",
            "thumbnail_url": "https://upload.wikimedia.org/hotel_thumb.jpg",
            "caption": "Hotel",
            "author": "Wikimedia",
            "license_name": "CC",
            "license_url": "https://creativecommons.org",
        }
    ]

    with patch(
        "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.resolve_photos",
        new_callable=AsyncMock,
        return_value=(fake_photos, "Luxury hotel in Madrid"),
    ):
        res = await async_client.get(
            "/api/pois/custom-hotel-id?name=Hotel%20Westin&city=Madrid"
        )
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Hotel Westin"
        assert len(data["photos"]) == 1
        assert (
            data["photos"][0]["thumbnail_url"]
            == "https://upload.wikimedia.org/hotel_thumb.jpg"
        )
