import httpx
import pytest
from app.services.osm_map_service import (
    GEOFABRIK_INDEX_URL,
    OSMMapService,
)

pytestmark = [pytest.mark.slow, pytest.mark.live_integration]


@pytest.mark.asyncio
async def test_geofabrik_index_url_is_live():
    """Verify that the Geofabrik Index API endpoint is online and returns valid GeoJSON features."""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(GEOFABRIK_INDEX_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert "features" in data
        assert len(data["features"]) > 50


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("city", "expected_substr"),
    [
        ("Madrid", "madrid-latest.osm.pbf"),
        ("Paris", "ile-de-france-latest.osm.pbf"),
        ("Barcelona", "cataluna-latest.osm.pbf"),
        ("London", "greater-london-latest.osm.pbf"),
        ("Berlin", "berlin-latest.osm.pbf"),
        ("Rome", "centro-latest.osm.pbf"),
        ("Tokyo", "kanto-latest.osm.pbf"),
        ("New York", "new-york-latest.osm.pbf"),
    ],
)
async def test_resolve_osm_pbf_url_returns_valid_live_link(
    city: str, expected_substr: str
):
    """Verify that resolve_osm_pbf_url resolves cities to live downloadable URLs."""
    url, filename = await OSMMapService.resolve_osm_pbf_url(city)
    assert expected_substr in filename
    assert url.startswith("https://download.geofabrik.de/")

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.head(url)
        assert resp.status_code == 200, f"URL {url} for city {city} is not reachable"
