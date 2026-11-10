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
        res = await async_client.get("/api/pois/OSM-node-madrid-prado-test")
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
    res = await async_client.get("/api/pois/non-existent-poi-id-999")
    assert res.status_code == 404
    data = res.json()
    assert "not found" in data["detail"].lower()


@pytest.mark.asyncio
async def test_create_and_update_poi(async_client: AsyncClient):
    """Test creating a custom POI and editing it in place."""
    create_payload = {
        "name": "Custom Ramen Spot",
        "city": "Tokyo",
        "category": "restaurant",
        "lat": 35.6812,
        "lng": 139.7671,
        "duration_mins": 45,
        "cost_eur": 12.5,
        "description": "Authentic handmade ramen in Tokyo.",
        "website": "https://ramen-spot.example.com",
    }
    create_res = await async_client.post("/api/pois", json=create_payload)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["name"] == "Custom Ramen Spot"
    assert created["category"] == "restaurant"
    assert created["duration_mins"] == 45
    assert created["website"] == "https://ramen-spot.example.com"
    poi_id = created["id"]
    assert poi_id.startswith("custom-")

    # Create another custom POI with opening/closing windows and rating
    custom_detailed_payload = {
        "name": "Custom Matcha Teahouse",
        "city": "Tokyo",
        "category": "cafe",
        "lat": 35.6900,
        "lng": 139.7700,
        "duration_mins": 40,
        "cost_eur": 8.0,
        "description": "Artisanal matcha bar.",
        "opening_time": "10:00",
        "closing_time": "19:30",
        "rating": 4.8,
    }
    custom_res = await async_client.post("/api/pois", json=custom_detailed_payload)
    assert custom_res.status_code == 200
    custom_poi = custom_res.json()
    assert custom_poi["name"] == "Custom Matcha Teahouse"
    assert custom_poi["scoring"]["rating"] == 4.8
    assert custom_poi["hours_known"] is True
    assert custom_poi["osm_opening_hours"] == "10:00-19:30"
    assert len(custom_poi["daily_windows"]) == 7

    # Search with custom_only=true should retrieve this custom POI
    search_res = await async_client.get("/api/pois/search?city=Tokyo&custom_only=true")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["search_type"] == "custom"
    assert any(
        item["name"] == "Custom Matcha Teahouse" for item in search_data["results"]
    )

    # Update in place
    update_payload = {
        "name": "Custom Ramen Spot Deluxe",
        "category": "cafe",
        "duration_mins": 60,
        "cost_eur": 18.0,
        "description": "Upgraded ramen bar & tea lounge.",
        "website": "https://deluxe-ramen.example.com",
    }
    update_res = await async_client.put(f"/api/pois/{poi_id}", json=update_payload)
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["id"] == poi_id
    assert updated["name"] == "Custom Ramen Spot Deluxe"
    assert updated["category"] == "cafe"
    assert updated["duration_mins"] == 60
    assert updated["cost_eur"] == 18.0
    assert updated["website"] == "https://deluxe-ramen.example.com"


@pytest.mark.asyncio
async def test_get_poi_details_multilingual_resolution(async_client: AsyncClient):
    """Test retrieving POI details with lang=es receives native Spanish extract and localized name."""
    mock_photos = [
        {
            "url": "https://example.com/prado.jpg",
            "thumbnail_url": "https://example.com/prado_thumb.jpg",
            "caption": "Museo del Prado",
        }
    ]
    spanish_extract = "El Museo del Prado es uno de los más importantes del mundo."

    with patch(
        "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.resolve_photos",
        new=AsyncMock(return_value=(mock_photos, spanish_extract)),
    ) as mock_resolve:
        res = await async_client.get("/api/pois/OSM-node-madrid-prado-test?lang=es")
        assert res.status_code == 200
        data = res.json()
        assert data["description"] == spanish_extract
        # Verify target_lang was passed as 'es'
        mock_resolve.assert_called_once()
        assert mock_resolve.call_args.kwargs.get("target_lang") == "es"


@pytest.mark.asyncio
async def test_get_poi_details_fallback_other_language_when_user_lang_missing(
    async_client: AsyncClient,
):
    """Test that when description in user language (ja) is missing, it falls back to English/other without translation."""
    mock_photos = [
        {
            "url": "https://example.com/prado.jpg",
            "thumbnail_url": "https://example.com/prado_thumb.jpg",
            "caption": "Museo del Prado",
        }
    ]
    english_extract = "The Prado Museum is the main Spanish national art museum."

    # Mock resolver returning English extract even though target_lang was 'ja' (native Wikipedia in ja did not exist)
    with patch(
        "app.services.wikimedia_photo_resolver.WikimediaPhotoResolver.resolve_photos",
        new=AsyncMock(return_value=(mock_photos, english_extract)),
    ) as mock_resolve:
        res = await async_client.get("/api/pois/OSM-node-madrid-prado-test?lang=ja")
        assert res.status_code == 200
        data = res.json()
        # Cleanly falls back to the available English description directly
        assert data["description"] == english_extract
        assert mock_resolve.call_args.kwargs.get("target_lang") == "ja"


def test_generate_poi_overview_localized():
    """Test localized structural overview generation for different languages."""
    from app.api.pois import _generate_poi_overview

    es_overview = _generate_poi_overview(
        name="Museo Reina Sofía",
        category="museum",
        city="Madrid",
        cost_eur=12.0,
        duration_mins=90,
        target_lang="es",
    )
    assert "es un museo destacado en Madrid" in es_overview
    assert "€12.00" in es_overview

    ja_overview = _generate_poi_overview(
        name="東京タワー",
        category="landmark",
        city="東京",
        cost_eur=0.0,
        duration_mins=45,
        target_lang="ja",
    )
    assert "東京タワーは東京にある注目のlandmarkスポットです" in ja_overview
    assert "入場料は無料です" in ja_overview

    hotel_overview = _generate_poi_overview(
        name="Hotel Gracery Shinjuku",
        category="hotel",
        city="Tokyo",
        cost_eur=0.0,
        duration_mins=60,
        target_lang="en",
    )
    assert (
        "provides hospitality accommodations and base camp lodging in Tokyo"
        in hotel_overview
    )
    assert "entry is free of charge" not in hotel_overview
    assert "Recommended visit duration" not in hotel_overview

    airport_overview = _generate_poi_overview(
        name="Haneda International Airport",
        category="airport",
        city="Tokyo",
        cost_eur=0.0,
        duration_mins=60,
        target_lang="en",
    )
    assert (
        "is an aviation gateway and flight transport hub in Tokyo" in airport_overview
    )
    assert "entry is free of charge" not in airport_overview
    assert "Recommended visit duration" not in airport_overview


@pytest.mark.asyncio
async def test_delete_custom_poi(async_client: AsyncClient, db_session: AsyncSession):
    create_payload = {
        "name": "My Custom Cafe",
        "category": "cafe",
        "city": "Madrid",
        "lat": 40.415,
        "lng": -3.702,
        "duration_mins": 45,
        "cost_eur": 5.0,
    }
    create_res = await async_client.post("/api/pois", json=create_payload)
    assert create_res.status_code == 200
    poi_id = create_res.json()["id"]
    assert poi_id.startswith("custom-")

    del_res = await async_client.delete(f"/api/pois/{poi_id}")
    assert del_res.status_code == 204

    get_res = await async_client.get(f"/api/pois/{poi_id}")
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_delete_non_custom_poi_forbidden(async_client: AsyncClient):
    del_res = await async_client.delete("/api/pois/OSM-node-madrid-prado-test")
    assert del_res.status_code == 403
    assert (
        "Only manually created custom POIs can be deleted" in del_res.json()["detail"]
    )


@pytest.mark.asyncio
async def test_delete_nonexistent_poi_not_found(async_client: AsyncClient):
    del_res = await async_client.delete("/api/pois/custom-nonexistent-1234")
    assert del_res.status_code == 404
