"""Unit tests for ensure_city_ready and distributed city lock."""

import pytest
from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.domain.entities.city import City
from app.engine.city_readiness import ensure_city_ready


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
            "embedding": [0.05 + 0.001 * (j % 50) for j in range(768)],
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


@pytest.mark.asyncio
async def test_ensure_city_ready_hydrates_missing_tier12_without_reingest(
    db_session, monkeypatch
):
    from app.infrastructure.providers.onnx_embedding_provider import (
        OnnxEmbeddingProvider,
    )

    city_repo = SqlCityRepository(db_session)
    poi_repo = SqlPoiRepository(db_session)

    valletta = City(
        id="valletta_mt",
        name="Valletta",
        country_code="MT",
        center_lat=35.8989,
        center_lon=14.5146,
        bbox=[35.85, 14.48, 35.92, 14.55],
        timezone="Europe/Malta",
        currency="EUR",
    )
    await city_repo.save_city(valletta)

    records = [
        {
            "id": f"osm_node_{100 + i}",
            "city_id": "valletta_mt",
            "name": f"Valletta Monument {i}",
            "category": "MONUMENT",
            "location": {"latitude": 35.898 + i * 0.001, "longitude": 14.514},
            "open_time_mins_by_day": [540] * 7,
            "close_time_mins_by_day": [1080] * 7,
            "duration_mins": 60,
            "cost_eur": 10.0,
            "tier": 1 if i < 4 else 2,
            "tier_confidence": "high",
            "tier_source": "wikidata",
            "iconicity_score": 80.0 - i,
            "taxonomy_category": "history_heritage",
            "category_id": 2,
            "visit_mode": "full",
            "embedding": None,
        }
        for i in range(12)
    ]
    records.extend(
        [
            {
                "id": f"osm_dining_{i}",
                "city_id": "valletta_mt",
                "name": f"Valletta Cafe {i}",
                "category": "CAFE" if i < 2 else "RESTAURANT",
                "location": {"latitude": 35.899, "longitude": 14.515 + i * 0.001},
                "open_time_mins_by_day": [450] * 7,
                "close_time_mins_by_day": [1320] * 7,
                "duration_mins": 60,
                "cost_eur": 15.0,
                "tier": 3,
                "tier_confidence": "medium",
                "tier_source": "osm",
                "iconicity_score": 40.0,
                "taxonomy_category": "food_dining",
                "category_id": 6,
                "visit_mode": "dining",
                "embedding": None,
            }
            for i in range(6)
        ]
    )
    await poi_repo.save_tiered_for_city("Valletta", records)
    await db_session.flush()

    async def fail_fetch(*_args, **_kwargs):
        raise AssertionError("fetch_city_records must not be called when DB populated")

    async def fake_embed_batch(
        self, texts, input_type="document", batch_size=32, max_concurrency=4
    ):
        assert input_type == "document"
        return [
            [0.2 if j == idx % 768 else 0.01 for j in range(768)]
            for idx, _ in enumerate(texts)
        ]

    monkeypatch.setattr("app.engine.city_readiness.fetch_city_records", fail_fetch)
    monkeypatch.setattr(OnnxEmbeddingProvider, "embed_batch", fake_embed_batch)

    readiness = await ensure_city_ready("Valletta", poi_repo)
    assert readiness.ingested is False
    assert readiness.tier1 + readiness.tier2 >= 12
    assert readiness.dining >= 6
    assert readiness.embedded_tier12_ratio >= 0.95
