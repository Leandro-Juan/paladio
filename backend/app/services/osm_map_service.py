import asyncio
import logging
import os
import re
import urllib.request
from collections.abc import Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GEOFABRIK_INDEX_URL = "https://download.geofabrik.de/index-v1.json"

# Fast-path lookup for popular destination cities
KNOWN_GEOFABRIK_MAP: dict[str, str] = {
    "madrid": "europe/spain/madrid-latest.osm.pbf",
    "paris": "europe/france/ile-de-france-latest.osm.pbf",
    "barcelona": "europe/spain/cataluna-latest.osm.pbf",
    "porto": "europe/portugal-latest.osm.pbf",
    "oporto": "europe/portugal-latest.osm.pbf",
    "rome": "europe/italy/centro-latest.osm.pbf",
    "roma": "europe/italy/centro-latest.osm.pbf",
    "milan": "europe/italy/nord-ovest-latest.osm.pbf",
    "london": "europe/united-kingdom/england/greater-london-latest.osm.pbf",
    "berlin": "europe/germany/berlin-latest.osm.pbf",
    "amsterdam": "europe/netherlands-latest.osm.pbf",
    "vienna": "europe/austria-latest.osm.pbf",
    "prague": "europe/czech-republic-latest.osm.pbf",
    "lisbon": "europe/portugal-latest.osm.pbf",
    "tokyo": "asia/japan/kanto-latest.osm.pbf",
    "newyork": "north-america/us/new-york-latest.osm.pbf",
    "new_york": "north-america/us/new-york-latest.osm.pbf",
    "new york": "north-america/us/new-york-latest.osm.pbf",
}

# Regional aliases for unhardcoded world destination cities whose extracts reside under their parent state or province
CITY_REGION_ALIASES: dict[str, str] = {
    # Spain
    "sevilla": "europe/spain/andalucia-latest.osm.pbf",
    "seville": "europe/spain/andalucia-latest.osm.pbf",
    "malaga": "europe/spain/andalucia-latest.osm.pbf",
    "granada": "europe/spain/andalucia-latest.osm.pbf",
    "bilbao": "europe/spain/pais-vasco-latest.osm.pbf",
    "sansebastian": "europe/spain/pais-vasco-latest.osm.pbf",
    "zaragoza": "europe/spain/aragon-latest.osm.pbf",
    "santiagodecompostela": "europe/spain/galicia-latest.osm.pbf",
    "palma": "europe/spain/islas-baleares-latest.osm.pbf",
    "mallorca": "europe/spain/islas-baleares-latest.osm.pbf",
    "ibiza": "europe/spain/islas-baleares-latest.osm.pbf",
    # Germany
    "munich": "europe/germany/bayern-latest.osm.pbf",
    "muenchen": "europe/germany/bayern-latest.osm.pbf",
    "münchen": "europe/germany/bayern-latest.osm.pbf",
    "frankfurt": "europe/germany/hessen-latest.osm.pbf",
    "cologne": "europe/germany/nordrhein-westfalen-latest.osm.pbf",
    "koln": "europe/germany/nordrhein-westfalen-latest.osm.pbf",
    "dusseldorf": "europe/germany/nordrhein-westfalen-latest.osm.pbf",
    "stuttgart": "europe/germany/baden-wuerttemberg-latest.osm.pbf",
    "dresden": "europe/germany/sachsen-latest.osm.pbf",
    "leipzig": "europe/germany/sachsen-latest.osm.pbf",
    # Italy
    "florence": "europe/italy/centro-latest.osm.pbf",
    "firenze": "europe/italy/centro-latest.osm.pbf",
    "pisa": "europe/italy/centro-latest.osm.pbf",
    "venice": "europe/italy/nord-est-latest.osm.pbf",
    "venezia": "europe/italy/nord-est-latest.osm.pbf",
    "verona": "europe/italy/nord-est-latest.osm.pbf",
    "naples": "europe/italy/sud-latest.osm.pbf",
    "napoli": "europe/italy/sud-latest.osm.pbf",
    "palermo": "europe/italy/isole-latest.osm.pbf",
    # France
    "marseille": "europe/france/provence-alpes-cote-d-azur-latest.osm.pbf",
    "nice": "europe/france/provence-alpes-cote-d-azur-latest.osm.pbf",
    "cannes": "europe/france/provence-alpes-cote-d-azur-latest.osm.pbf",
    "lyon": "europe/france/rhone-alpes-latest.osm.pbf",
    "bordeaux": "europe/france/aquitaine-latest.osm.pbf",
    "strasbourg": "europe/france/alsace-latest.osm.pbf",
    "toulouse": "europe/france/midi-pyrenees-latest.osm.pbf",
    # United Kingdom & Ireland
    "edinburgh": "europe/united-kingdom/scotland-latest.osm.pbf",
    "glasgow": "europe/united-kingdom/scotland-latest.osm.pbf",
    "cardiff": "europe/united-kingdom/wales-latest.osm.pbf",
    "belfast": "europe/ireland-and-northern-ireland-latest.osm.pbf",
    "dublin": "europe/ireland-and-northern-ireland-latest.osm.pbf",
    # Japan
    "kyoto": "asia/japan/kansai-latest.osm.pbf",
    "osaka": "asia/japan/kansai-latest.osm.pbf",
    "kobe": "asia/japan/kansai-latest.osm.pbf",
    "nara": "asia/japan/kansai-latest.osm.pbf",
    "sapporo": "asia/japan/hokkaido-latest.osm.pbf",
    "fukuoka": "asia/japan/kyushu-latest.osm.pbf",
    "nagoya": "asia/japan/chubu-latest.osm.pbf",
    # North America
    "losangeles": "north-america/us/california-latest.osm.pbf",
    "sanfrancisco": "north-america/us/california-latest.osm.pbf",
    "sandiego": "north-america/us/california-latest.osm.pbf",
    "chicago": "north-america/us/illinois-latest.osm.pbf",
    "miami": "north-america/us/florida-latest.osm.pbf",
    "orlando": "north-america/us/florida-latest.osm.pbf",
    "seattle": "north-america/us/washington-latest.osm.pbf",
    "boston": "north-america/us/massachusetts-latest.osm.pbf",
    "houston": "north-america/us/texas-latest.osm.pbf",
    "dallas": "north-america/us/texas-latest.osm.pbf",
    "austin": "north-america/us/texas-latest.osm.pbf",
    "denver": "north-america/us/colorado-latest.osm.pbf",
    "lasvegas": "north-america/us/nevada-latest.osm.pbf",
    "toronto": "north-america/canada/ontario-latest.osm.pbf",
    "montreal": "north-america/canada/quebec-latest.osm.pbf",
    "vancouver": "north-america/canada/british-columbia-latest.osm.pbf",
    # Australia
    "sydney": "australia-oceania/australia/new-south-wales-latest.osm.pbf",
    "melbourne": "australia-oceania/australia/victoria-latest.osm.pbf",
    "brisbane": "australia-oceania/australia/queensland-latest.osm.pbf",
    "perth": "australia-oceania/australia/western-australia-latest.osm.pbf",
}

_geofabrik_index_cache: dict[str, Any] | None = None


class OSMMapService:
    """
    Handles dynamic discovery, download, and incremental compilation
    of OpenStreetMap road networks into Valhalla.
    """

    @classmethod
    async def resolve_osm_pbf_url(cls, city_name: str) -> tuple[str, str]:
        """
        Resolves a city name to its authoritative Geofabrik download URL and filename.
        Returns: (download_url, filename)
        """
        city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

        if city_clean in KNOWN_GEOFABRIK_MAP:
            subpath = KNOWN_GEOFABRIK_MAP[city_clean]
            url = f"https://download.geofabrik.de/{subpath}"
            filename = subpath.split("/")[-1]
            return url, filename

        if city_clean in CITY_REGION_ALIASES:
            subpath = CITY_REGION_ALIASES[city_clean]
            url = f"https://download.geofabrik.de/{subpath}"
            filename = subpath.split("/")[-1]
            return url, filename

        # Query Geofabrik index
        try:
            index_data = await cls._get_geofabrik_index()
            if index_data and "features" in index_data:
                for feature in index_data["features"]:
                    props = feature.get("properties", {})
                    f_id = str(props.get("id", "")).lower()
                    f_name = str(props.get("name", "")).lower()
                    urls = props.get("urls", {})

                    if (city_clean in f_id or city_clean in f_name) and "pbf" in urls:
                        pbf_url = urls["pbf"]
                        filename = pbf_url.split("/")[-1]
                        logger.info(
                            f"Discovered Geofabrik extract for '{city_name}': {pbf_url}"
                        )
                        return pbf_url, filename
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.warning(f"Error querying Geofabrik index for '{city_name}': {exc}")

        filename = f"{city_clean}-latest.osm.pbf"
        url = f"https://download.geofabrik.de/europe/{filename}"
        return url, filename

    @classmethod
    async def _get_geofabrik_index(cls) -> dict[str, Any] | None:
        global _geofabrik_index_cache
        if _geofabrik_index_cache is not None:
            return _geofabrik_index_cache

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(GEOFABRIK_INDEX_URL)
                resp.raise_for_status()
                _geofabrik_index_cache = resp.json()
                return _geofabrik_index_cache
        except (httpx.HTTPError, ValueError) as e:
            logger.warning(f"Could not load Geofabrik index: {e}")
            return None

    @classmethod
    async def get_city_extract_bounds(cls, city_name: str) -> dict[str, float] | None:
        """
        Dynamically extracts the geographic bounding box (min_lat, max_lat, min_lon, max_lon)
        for any city's road network extract from Geofabrik's authoritative index metadata.
        Completely eliminates the need for hardcoded city boundary maps.
        """
        try:
            _, pbf_filename = await cls.resolve_osm_pbf_url(city_name)
            index_data = await cls._get_geofabrik_index()
            if not index_data or "features" not in index_data:
                return None

            for feature in index_data["features"]:
                urls = feature.get("properties", {}).get("urls", {})
                if pbf_filename in urls.get("pbf", ""):
                    geom = feature.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    all_lons: list[float] = []
                    all_lats: list[float] = []

                    def _extract(c: Any) -> None:
                        if isinstance(c, (list, tuple)):
                            if (
                                len(c) == 2
                                and isinstance(c[0], (float, int))
                                and isinstance(c[1], (float, int))
                            ):
                                all_lons.append(float(c[0]))
                                all_lats.append(float(c[1]))
                            else:
                                for sub in c:
                                    _extract(sub)

                    _extract(coords)
                    if all_lons and all_lats:
                        return {
                            "min_lat": min(all_lats),
                            "max_lat": max(all_lats),
                            "min_lon": min(all_lons),
                            "max_lon": max(all_lons),
                        }
        except Exception as exc:
            logger.warning(
                f"Could not dynamically determine bounds for {city_name}: {exc}"
            )
        return None

    @classmethod
    async def download_osm_pbf(
        cls,
        url: str,
        dest_path: str,
        progress_callback: Callable[[str], None] | None = None,
    ) -> bool:
        """
        Downloads the OSM .pbf file if not already present or zero-sized.
        Reports progress via progress_callback.
        """
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
            logger.info(f"OSM file already present at {dest_path}")
            if progress_callback:
                progress_callback(
                    f"Road network extract {os.path.basename(dest_path)} already cached."
                )
            return True

        filename = os.path.basename(dest_path)
        if progress_callback:
            progress_callback(
                f"Downloading road network for {filename} from Geofabrik..."
            )

        try:
            os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
            tmp_dest = f"{dest_path}.tmp"

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, urllib.request.urlretrieve, url, tmp_dest)

            if os.path.exists(tmp_dest) and os.path.getsize(tmp_dest) > 0:
                os.replace(tmp_dest, dest_path)
                logger.info(f"Successfully downloaded {filename} to {dest_path}")
                if progress_callback:
                    size_mb = round(os.path.getsize(dest_path) / (1024 * 1024), 1)
                    progress_callback(
                        f"Road network download complete ({size_mb} MB). Preparing compilation..."
                    )
                return True
            return False
        except (urllib.error.URLError, OSError, ValueError) as exc:
            logger.error(f"Failed to download OSM pbf from {url}: {exc}")
            if os.path.exists(f"{dest_path}.tmp"):
                try:
                    os.remove(f"{dest_path}.tmp")
                except OSError:
                    pass
            return False

    @classmethod
    async def trigger_valhalla_build(
        cls,
        pbf_files: list[str],
        progress_callback: Callable[[str], None] | None = None,
        valhalla_sidecar_url: str = "http://valhalla:8003",
    ) -> bool:
        """
        Triggers Valhalla road tile compilation for given PBF files without osmium merge.
        Uses the Valhalla sidecar HTTP endpoint on port 8003.
        """
        if progress_callback:
            progress_callback("Compiling multi-city Valhalla road navigation tiles...")

        payload = {"pbf_files": pbf_files, "build_transit": False}
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.post(
                    f"{valhalla_sidecar_url}/build-tiles", json=payload
                )
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Valhalla build response: {data}")
                if progress_callback:
                    progress_callback("Road navigation tiles compilation complete.")
                return True
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning(
                f"Valhalla sidecar build request failed ({exc}). Verifying direct fallback."
            )
            return False
