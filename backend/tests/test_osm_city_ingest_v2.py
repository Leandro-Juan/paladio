"""Unit tests for osm_city_ingest 6-stream queries and overpass_provider shim."""

import pytest
from unittest.mock import AsyncMock, patch

from app.infrastructure.providers.osm_city_ingest import (
    CityGeo,
    build_stream_overpass_query,
)
from app.infrastructure.providers.overpass_provider import OverpassProviderAdapter


def test_build_stream_overpass_queries():
    # Stream 1 query with wikidata area
    q1 = build_stream_overpass_query(
        1, 40.4168, -3.7038, 5000, city_qid="Q2807", limit=2000
    )
    assert 'area["wikidata"="Q2807"]->.searchArea;' in q1
    assert "area.searchArea" in q1
    assert "tourism" in q1
    assert "historic" in q1

    # Stream 3 dining query with around radius
    q3 = build_stream_overpass_query(
        3, 40.4168, -3.7038, 5000, city_qid=None, limit=4000
    )
    assert "(around:5000,40.4168,-3.7038)" in q3
    assert "restaurant" in q3

    # Stream 5 nightlife query
    q5 = build_stream_overpass_query(5, 40.4168, -3.7038, 3000, city_qid=None)
    assert "bar" in q5
    assert "nightclub" in q5
    assert "theatre" in q5


@pytest.mark.asyncio
async def test_overpass_provider_adapter_shim():
    adapter = OverpassProviderAdapter()

    fake_records = [
        {
            "id": "OSM-node-100",
            "name": "Restaurante Botanico",
            "category": "restaurant",
            "stream": 3,
            "location": {"latitude": 40.41, "longitude": -3.70},
            "duration_mins": 75,
            "cost_eur": 25.0,
            "cost_is_estimated": False,
            "cost_source": "menu",
            "osm_opening_hours": "12:00-23:00",
            "scoring": {"rating": 4.5, "reviews": 120},
            "metadata": {"cuisine": "mediterranean", "tags": {}},
        },
        {
            "id": "OSM-node-200",
            "name": "Museo Thyssen",
            "category": "museum",
            "stream": 1,
            "location": {"latitude": 40.416, "longitude": -3.694},
            "duration_mins": 120,
            "cost_eur": 13.0,
            "cost_is_estimated": False,
            "cost_source": "official",
            "osm_opening_hours": "10:00-19:00",
            "scoring": {"rating": 4.8, "reviews": 5000},
            "metadata": {"tags": {"wikidata": "Q160112"}},
        },
    ]

    with patch(
        "app.infrastructure.providers.overpass_provider.geocode_city",
        new_callable=AsyncMock,
    ) as mock_geo, patch(
        "app.infrastructure.providers.overpass_provider.fetch_city_records",
        new_callable=AsyncMock,
    ) as mock_fetch:
        mock_geo.return_value = CityGeo(
            "Madrid", "Madrid, Spain", 40.4168, -3.7038, 5.0, "ES"
        )
        mock_fetch.return_value = fake_records

        restaurants = await adapter.fetch_restaurants("Madrid", limit=10)
        assert len(restaurants) == 1
        assert restaurants[0].name == "Restaurante Botanico"
        assert restaurants[0].category == "restaurant"
        assert restaurants[0].financials.estimated_cost == 25.0

        attractions = await adapter.fetch_attractions("Madrid", limit=10)
        assert len(attractions) == 1
        assert attractions[0].name == "Museo Thyssen"
        assert attractions[0].category == "museum"
        assert attractions[0].financials.estimated_cost == 13.0
