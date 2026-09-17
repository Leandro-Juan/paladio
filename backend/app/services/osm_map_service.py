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
    "london": "europe/great-britain/england/greater-london-latest.osm.pbf",
    "berlin": "europe/germany/berlin-latest.osm.pbf",
    "amsterdam": "europe/netherlands-latest.osm.pbf",
    "vienna": "europe/austria-latest.osm.pbf",
    "prague": "europe/czech-republic-latest.osm.pbf",
    "lisbon": "europe/portugal-latest.osm.pbf",
    "tokyo": "asia/japan/kanto-latest.osm.pbf",
    "new york": "north-america/us/new-york-latest.osm.pbf",
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

        # Fallback to standard convention
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
