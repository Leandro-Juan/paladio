import re

import httpx
import pytest
from app.services.osm_map_service import (
    CITY_REGION_ALIASES,
    KNOWN_GEOFABRIK_MAP,
    OSMMapService,
)

DYNAMIC_INDEX_CITIES: list[str] = [
    "Valencia",
    "Hamburg",
    "Bremen",
    "Luxembourg",
    "Iceland",
    "Andorra",
    "Cyprus",
]

REGIONAL_UNHARDCODED_CITIES: list[tuple[str, str]] = [
    # Spain
    ("Sevilla", "andalucia-latest.osm.pbf"),
    ("Bilbao", "pais-vasco-latest.osm.pbf"),
    ("Zaragoza", "aragon-latest.osm.pbf"),
    ("Malaga", "andalucia-latest.osm.pbf"),
    ("Palma", "islas-baleares-latest.osm.pbf"),
    # Germany
    ("Munich", "bayern-latest.osm.pbf"),
    ("Frankfurt", "hessen-latest.osm.pbf"),
    ("Cologne", "nordrhein-westfalen-latest.osm.pbf"),
    ("Stuttgart", "baden-wuerttemberg-latest.osm.pbf"),
    ("Dresden", "sachsen-latest.osm.pbf"),
    # Italy
    ("Florence", "centro-latest.osm.pbf"),
    ("Venice", "nord-est-latest.osm.pbf"),
    ("Naples", "sud-latest.osm.pbf"),
    ("Palermo", "isole-latest.osm.pbf"),
    # France
    ("Marseille", "provence-alpes-cote-d-azur-latest.osm.pbf"),
    ("Lyon", "rhone-alpes-latest.osm.pbf"),
    ("Nice", "provence-alpes-cote-d-azur-latest.osm.pbf"),
    ("Bordeaux", "aquitaine-latest.osm.pbf"),
    # UK & Ireland
    ("Edinburgh", "scotland-latest.osm.pbf"),
    ("Dublin", "ireland-and-northern-ireland-latest.osm.pbf"),
    # Japan
    ("Kyoto", "kansai-latest.osm.pbf"),
    ("Osaka", "kansai-latest.osm.pbf"),
    ("Sapporo", "hokkaido-latest.osm.pbf"),
    ("Fukuoka", "kyushu-latest.osm.pbf"),
    # North America
    ("Chicago", "illinois-latest.osm.pbf"),
    ("Miami", "florida-latest.osm.pbf"),
    ("San Francisco", "california-latest.osm.pbf"),
    ("Boston", "massachusetts-latest.osm.pbf"),
    ("Toronto", "ontario-latest.osm.pbf"),
    ("Vancouver", "british-columbia-latest.osm.pbf"),
    # Australia
    ("Sydney", "new-south-wales-latest.osm.pbf"),
    ("Melbourne", "victoria-latest.osm.pbf"),
    ("Brisbane", "queensland-latest.osm.pbf"),
]


def _clean_city_key(name: str) -> str:
    return re.sub(r"[^a-z0-9_-]", "", name.strip().lower())


@pytest.mark.asyncio
async def test_all_unhardcoded_cities_absent_from_known_geofabrik_map():
    """
    Verify that none of the tested cities exist in KNOWN_GEOFABRIK_MAP.
    This guarantees that we are genuinely exercising dynamic and alias resolution pathways.
    """
    all_cities = DYNAMIC_INDEX_CITIES + [c[0] for c in REGIONAL_UNHARDCODED_CITIES]
    for city in all_cities:
        key = _clean_city_key(city)
        assert (
            key not in KNOWN_GEOFABRIK_MAP
        ), f"City '{city}' (key '{key}') is already in KNOWN_GEOFABRIK_MAP"


@pytest.mark.slow
@pytest.mark.live_integration
@pytest.mark.asyncio
@pytest.mark.parametrize("city", DYNAMIC_INDEX_CITIES)
async def test_dynamic_index_cities_resolve_without_aliases(city: str):
    """
    Verify cities that are neither in KNOWN_GEOFABRIK_MAP nor in CITY_REGION_ALIASES
    resolve dynamically via the official Geofabrik GeoJSON index.
    """
    key = _clean_city_key(city)
    assert (
        key not in KNOWN_GEOFABRIK_MAP
    ), f"City '{city}' unexpectedly found in KNOWN_GEOFABRIK_MAP"
    assert (
        key not in CITY_REGION_ALIASES
    ), f"City '{city}' unexpectedly found in CITY_REGION_ALIASES"

    url, filename = await OSMMapService.resolve_osm_pbf_url(city)
    assert url.startswith("https://download.geofabrik.de/")
    assert filename.endswith(".osm.pbf")
    assert key in filename.lower()

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.head(url)
        assert (
            resp.status_code == 200
        ), f"Download URL {url} for city '{city}' returned status {resp.status_code}"
        assert (
            "html" not in resp.headers.get("Content-Type", "").lower()
        ), f"Download URL {url} for city '{city}' returned HTML error page instead of binary PBF"
        size = int(resp.headers.get("Content-Length", 0))
        assert (
            size > 1_000_000
        ), f"PBF file for '{city}' is suspiciously small ({size} bytes)"


@pytest.mark.slow
@pytest.mark.live_integration
@pytest.mark.asyncio
@pytest.mark.parametrize(("city", "expected_filename"), REGIONAL_UNHARDCODED_CITIES)
async def test_regional_unhardcoded_cities_resolve_and_are_live(
    city: str, expected_filename: str
):
    """
    Verify destination cities outside KNOWN_GEOFABRIK_MAP correctly resolve
    to their regional Geofabrik extracts and are live, downloadable binary PBF files.
    """
    url, filename = await OSMMapService.resolve_osm_pbf_url(city)
    assert (
        filename == expected_filename
    ), f"City '{city}' resolved to '{filename}', expected '{expected_filename}'"
    assert url.startswith("https://download.geofabrik.de/")

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.head(url)
        assert (
            resp.status_code == 200
        ), f"Download URL {url} for city '{city}' returned status {resp.status_code}"
        assert (
            "html" not in resp.headers.get("Content-Type", "").lower()
        ), f"Download URL {url} for city '{city}' returned HTML instead of binary PBF"
        size = int(resp.headers.get("Content-Length", 0))
        assert (
            size > 10_000_000
        ), f"PBF file for '{city}' is unexpectedly small ({size} bytes)"
