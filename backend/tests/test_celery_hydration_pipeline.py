from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.engine.hydration.document_builder import PoiDocumentBuilder
from app.infrastructure.providers.osm_city_ingest import CityGeo
from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)
from app.services.poi_service import get_attractions_for_city
from app.tasks import (
    _publish_city_hydration_event,
    _run_enrich_long_tail_city_pois,
    _run_enrich_tier12_city_pois,
    _run_ingest_city_pois,
    hydrate_city_pipeline_task,
)


@pytest.mark.asyncio
async def test_publish_city_hydration_event():
    with patch("redis.from_url") as mock_redis_from_url:
        mock_r = MagicMock()
        mock_redis_from_url.return_value = mock_r

        _publish_city_hydration_event(
            event_name="HYDRATION_PROGRESS",
            city_id="madrid_es",
            city_name="Madrid",
            stage="INGESTING",
            progress=0.25,
            extra_field="test",
        )

        assert mock_r.publish.call_count == 2
        calls = [c[0] for c in mock_r.publish.call_args_list]
        channels = [call[0] for call in calls]
        assert "paladio:city_hydration:madrid_es" in channels
        assert "paladio:events" in channels


@pytest.mark.asyncio
async def test_run_ingest_city_pois():
    fake_geo = CityGeo(
        name="Madrid",
        display_name="Madrid, Spain",
        lat=40.4168,
        lon=-3.7038,
        radius_km=7.5,
        country_code="ES",
        bbox=[40.3, -3.8, 40.5, -3.6],
    )
    fake_records = [
        {
            "id": "osm:node:100",
            "name": "Museo del Prado",
            "category": "museum",
            "latitude": 40.4138,
            "longitude": -3.6921,
            "tags": {"tourism": "museum"},
            "score": 0.95,
        },
        {
            "id": "osm:node:200",
            "name": "El Rastro",
            "category": "market",
            "latitude": 40.4100,
            "longitude": -3.7070,
            "tags": {"amenity": "marketplace"},
            "score": 0.80,
        },
    ]

    mock_session = AsyncMock()
    mock_session_maker = MagicMock(return_value=mock_session)
    mock_session.__aenter__.return_value = mock_session
    mock_engine = AsyncMock()

    with (
        patch(
            "app.tasks._get_task_session_maker",
            return_value=(mock_session_maker, mock_engine),
        ),
        patch(
            "app.infrastructure.providers.osm_city_ingest.geocode_city",
            new_callable=AsyncMock,
            return_value=fake_geo,
        ),
        patch(
            "app.infrastructure.providers.osm_city_ingest.fetch_city_records",
            new_callable=AsyncMock,
            return_value=fake_records,
        ),
        patch(
            "app.infrastructure.providers.neighborhood_resolver.NeighborhoodResolver.create_for_city",
            new_callable=AsyncMock,
        ) as mock_nr,
        patch(
            "app.engine.v2.tiering.tier_city_attractions",
            side_effect=lambda recs, c: recs,
        ),
        patch(
            "app.adapters.repositories.sql_city_repository.SqlCityRepository.save_city",
            new_callable=AsyncMock,
        ) as mock_save_city,
        patch(
            "app.adapters.repositories.sql_poi_repository.SqlPoiRepository.save_tiered_for_city",
            new_callable=AsyncMock,
        ) as mock_save_pois,
        patch("app.tasks._publish_city_hydration_event") as mock_pub,
    ):
        mock_resolver = MagicMock()
        mock_resolver.resolve_neighborhood.return_value = "Retiro"
        mock_nr.return_value = mock_resolver

        result = await _run_ingest_city_pois("Madrid")

        assert result["city_name"] == "Madrid"
        assert result["city_id"] == "madrid_es"
        assert result["raw_count"] == 2
        mock_save_city.assert_awaited_once()
        mock_save_pois.assert_awaited_once()
        assert mock_pub.call_count >= 2


@pytest.mark.asyncio
async def test_run_enrich_tier12_city_pois():
    fake_model = MagicMock()
    fake_model.id = "madrid:prado"
    fake_model.name = "Museo del Prado"
    fake_model.city = "Madrid"
    fake_model.category = "museum"
    fake_model.tier = 1
    fake_model.location = {"latitude": 40.4138, "longitude": -3.6921}
    fake_model.metadata_field = {"tags": {"fee": "yes", "charge": "15 EUR"}}
    fake_model.opening_hours_raw = "Mo-Sa 10:00-20:00; Su 10:00-19:00"
    fake_model.admission_fee = 15.0
    fake_model.cost_eur = 15.0
    fake_model.cost_is_estimated = False
    fake_model.cost_source = "osm_charge"
    fake_model.wikidata_id = "Q160112"
    fake_model.wikipedia_title = "Prado Museum"
    fake_model.sitelinks_count = 120
    fake_model.pageviews_30d = 50000
    fake_model.description = "Spanish national art museum"
    fake_model.duration_mins = 150
    fake_model.embedding = None
    fake_model.embedding_text_hash = None
    fake_model.embedding_version = 0

    mock_session = AsyncMock()
    mock_session_maker = MagicMock(return_value=mock_session)
    mock_session.__aenter__.return_value = mock_session
    mock_engine = AsyncMock()

    mock_result_t12 = MagicMock()
    mock_result_t12.scalars.return_value.all.return_value = [fake_model]
    mock_result_dining = MagicMock()
    mock_result_dining.scalars.return_value.all.return_value = []

    mock_session.execute = AsyncMock(
        side_effect=[mock_result_t12, mock_result_dining, MagicMock()]
    )

    fake_vector = [0.1] * 768

    with (
        patch(
            "app.tasks._get_task_session_maker",
            return_value=(mock_session_maker, mock_engine),
        ),
        patch(
            "app.services.poi_pricing_service.PoiPricingService.load_catalog_from_db",
            new_callable=AsyncMock,
        ),
        patch(
            "app.infrastructure.providers.wikimedia_enrichment_provider.WikimediaEnrichmentProvider.fetch_wikivoyage_listings",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.infrastructure.providers.wikimedia_enrichment_provider.WikimediaEnrichmentProvider.resolve_wikidata_batch",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.infrastructure.providers.wikimedia_enrichment_provider.WikimediaEnrichmentProvider.fetch_wikipedia_extracts",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.infrastructure.providers.ollama_embedding_provider.OllamaEmbeddingProvider.embed_batch",
            new_callable=AsyncMock,
            return_value=[fake_vector],
        ),
        patch("app.tasks._publish_city_hydration_event") as mock_pub,
    ):
        result = await _run_enrich_tier12_city_pois("Madrid", city_id="madrid_es")

        assert result["city_id"] == "madrid_es"
        assert result["tier12_count"] == 1
        assert result["embedded_count"] == 1
        assert fake_model.hydration_status == "EMBEDDED"
        assert fake_model.embedding_version == PoiDocumentBuilder.VERSION
        assert fake_model.embedding == fake_vector
        mock_session.commit.assert_awaited()
        assert mock_pub.call_count >= 2


@pytest.mark.asyncio
async def test_run_enrich_long_tail_city_pois():
    fake_model = MagicMock()
    fake_model.id = "madrid:cafe_central"
    fake_model.name = "Café Central"
    fake_model.city = "Madrid"
    fake_model.category = "cafe"
    fake_model.tier = 3
    fake_model.location = {"latitude": 40.4130, "longitude": -3.7020}
    fake_model.metadata_field = {"tags": {}}
    fake_model.opening_hours_raw = "12:00-02:00"
    fake_model.admission_fee = 0.0
    fake_model.cost_eur = 0.0
    fake_model.cost_is_estimated = True
    fake_model.cost_source = "default"
    fake_model.wikidata_id = None
    fake_model.wikipedia_title = None
    fake_model.sitelinks_count = 0
    fake_model.pageviews_30d = 0
    fake_model.description = None
    fake_model.duration_mins = 45
    fake_model.embedding = None
    fake_model.embedding_text_hash = None
    fake_model.embedding_version = 0

    mock_session = AsyncMock()
    mock_session_maker = MagicMock(return_value=mock_session)
    mock_session.__aenter__.return_value = mock_session
    mock_engine = AsyncMock()

    res_ids = MagicMock()
    res_ids.scalars.return_value.all.return_value = ["madrid:cafe_central"]
    res_models = MagicMock()
    res_models.scalars.return_value.all.return_value = [fake_model]

    mock_session.execute = AsyncMock(side_effect=[res_ids, res_models, MagicMock()])

    fake_vector = [0.2] * 768

    with (
        patch(
            "app.tasks._get_task_session_maker",
            return_value=(mock_session_maker, mock_engine),
        ),
        patch(
            "app.infrastructure.providers.ollama_embedding_provider.OllamaEmbeddingProvider.embed_batch",
            new_callable=AsyncMock,
            return_value=[fake_vector],
        ),
        patch("app.tasks._publish_city_hydration_event") as mock_pub,
    ):
        result = await _run_enrich_long_tail_city_pois("Madrid", city_id="madrid_es")

        assert result["city_id"] == "madrid_es"
        assert result["total_enriched"] == 1
        assert fake_model.hydration_status == "EMBEDDED"
        assert fake_model.embedding_version == PoiDocumentBuilder.VERSION
        assert fake_model.embedding == fake_vector
        mock_session.commit.assert_awaited()
        assert mock_pub.call_count >= 2


def test_hydrate_city_pipeline_task_orchestration():
    mock_self = MagicMock()
    mock_self.request.id = "celery-task-12345"

    with (
        patch("redis.from_url") as mock_redis_from_url,
        patch("app.tasks._run_async") as mock_run_async,
        patch("app.tasks._publish_city_hydration_event") as mock_pub,
    ):
        mock_r = MagicMock()
        mock_lock = MagicMock()
        mock_lock.acquire.return_value = True
        mock_r.lock.return_value = mock_lock
        mock_redis_from_url.return_value = mock_r

        mock_run_async.side_effect = [
            {"city_name": "Madrid", "city_id": "madrid_es", "raw_count": 10500},
            {"city_name": "Madrid", "city_id": "madrid_es", "tier12_count": 450},
            {
                "city_name": "Madrid",
                "city_id": "madrid_es",
                "total_enriched": 10050,
                "status": "completed",
            },
        ]

        result = hydrate_city_pipeline_task("Madrid", force=True)

        assert result["status"] == "success"
        assert mock_pub.called
        assert result["city"] == "Madrid"
        assert result["city_id"] == "madrid_es"
        assert mock_run_async.call_count == 3
        mock_lock.acquire.assert_called_once()
        mock_lock.release.assert_called_once()


@pytest.mark.asyncio
async def test_poi_service_staleness_triggers_hydration_task():
    old_ingested_at = datetime.now(timezone.utc) - timedelta(days=200)

    mock_repo = AsyncMock()
    mock_repo.check_city_staleness = AsyncMock(return_value=(old_ingested_at, False))

    dummy_poi = Attraction(
        id="OSM-node-1",
        category="attraction",
        name="Test",
        location=Location(latitude=0.0, longitude=0.0),
        schedule=AttractionSchedule(
            osm_opening_hours=None, recommended_duration_minutes=60
        ),
        financials=AttractionFinancials(
            is_free=True, estimated_cost=0.0, currency="EUR"
        ),
        scoring=Scoring(rating=0.0, reviews=0),
        metadata=Metadata(scraped_at=datetime.now(timezone.utc), source="test"),
    )
    mock_repo.find_by_city.return_value = [dummy_poi]
    mock_provider = AsyncMock()

    with patch("app.services.poi_service.refresh_city_pois_task") as mock_task:
        result = await get_attractions_for_city(
            "Madrid", poi_repo=mock_repo, poi_provider=mock_provider
        )

        assert len(result) == 1
        mock_task.delay.assert_called_once_with("Madrid")


@pytest.mark.asyncio
async def test_poi_service_version_bump_triggers_hydration_task():
    recent_ingested_at = datetime.now(timezone.utc) - timedelta(days=2)

    mock_repo = AsyncMock()
    mock_repo.check_city_staleness = AsyncMock(return_value=(recent_ingested_at, True))

    dummy_poi = Attraction(
        id="OSM-node-1",
        category="attraction",
        name="Test",
        location=Location(latitude=0.0, longitude=0.0),
        schedule=AttractionSchedule(
            osm_opening_hours=None, recommended_duration_minutes=60
        ),
        financials=AttractionFinancials(
            is_free=True, estimated_cost=0.0, currency="EUR"
        ),
        scoring=Scoring(rating=0.0, reviews=0),
        metadata=Metadata(scraped_at=datetime.now(timezone.utc), source="test"),
    )
    mock_repo.find_by_city.return_value = [dummy_poi]
    mock_provider = AsyncMock()

    with patch("app.services.poi_service.refresh_city_pois_task") as mock_task:
        result = await get_attractions_for_city(
            "Madrid", poi_repo=mock_repo, poi_provider=mock_provider
        )

        assert len(result) == 1
        mock_task.delay.assert_called_once_with("Madrid")
