"""Unit tests for ensure_city_ready and distributed city lock."""

import pytest

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.domain.entities.city import City
from app.engine.v2.city_readiness import ensure_city_ready


@pytest.mark.asyncio
async def test_ensure_city_ready_existing_city(db_session):
    poi_repo = SqlPoiRepository(db_session)
    city_repo = SqlCityRepository(db_session)

    # Pre-seed test city
    madrid = City(
        id="madrid_es",
        name="Madrid",
        aliases=["madrid", "Madrid"],
        country_code="ES",
        center_lat=40.4168,
        center_lon=-3.7038,
        bbox=[40.35, -3.75, 40.48, -3.65],
        radius_km=7.5,
        timezone="Europe/Madrid",
        currency="EUR",
        profile={"source": "test"},
    )
    await city_repo.save_city(madrid)

    # Seed sights and dining for Madrid
    sights = [
        {
            "id": f"test-madrid-{i}",
            "city": "Madrid",
            "name": f"Madrid Sight {i}",
            "category": "museum",
            "location": {"latitude": 40.4168, "longitude": -3.7038},
            "open_time_mins_by_day": [540] * 7,
            "close_time_mins_by_day": [1200] * 7,
            "duration_mins": 90,
            "cost_eur": 12.0,
            "tier": 1 if i < 3 else 2,
            "tier_confidence": "high",
            "tier_source": "test",
            "iconicity_score": 0.95,
            "taxonomy_category": "art_culture",
            "category_id": 0,
            "visit_mode": "full",
        }
        for i in range(10)
    ]
    dining = [
        {
            "id": f"test-dining-{i}",
            "city": "Madrid",
            "name": f"Madrid Restaurant {i}",
            "category": "restaurant",
            "location": {"latitude": 40.4168, "longitude": -3.7038},
            "open_time_mins_by_day": [720] * 7,
            "close_time_mins_by_day": [1400] * 7,
            "duration_mins": 60,
            "cost_eur": 25.0,
            "tier": 3,
            "tier_confidence": "high",
            "tier_source": "test",
            "iconicity_score": 0.5,
            "taxonomy_category": "food_culinary",
            "category_id": 4,
            "visit_mode": "full",
        }
        for i in range(8)
    ]
    await poi_repo.save_tiered_for_city("Madrid", sights + dining)

    # Now verify ensure_city_ready recognizes city as already ready without re-ingesting
    readiness = await ensure_city_ready("Madrid", poi_repo)
    assert readiness.ingested is False
    assert readiness.city == "Madrid"
    assert readiness.city_id == "madrid_es"
    assert readiness.city_entity is not None
    assert readiness.city_entity.timezone == "Europe/Madrid"
    assert readiness.tier1 >= 2
    assert readiness.tier2 >= 6
    assert readiness.dining >= 6
