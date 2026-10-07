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


def _point_in_polygon(x: float, y: float, poly: list) -> bool:
    inside = False
    n = len(poly)
    if n < 3:
        return False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def _point_in_geometry(x: float, y: float, geom: dict[str, Any]) -> bool:
    gtype = geom.get("type")
    coords = geom.get("coordinates", [])
    if gtype == "Polygon" and coords:
        return _point_in_polygon(x, y, coords[0])
    elif gtype == "MultiPolygon" and coords:
        return any(_point_in_polygon(x, y, poly[0]) for poly in coords if poly)
    return False


def _geom_approx_area(geom: dict[str, Any]) -> float:
    coords = geom.get("coordinates", [])
    all_pts = []
    if geom.get("type") == "Polygon" and coords:
        all_pts = coords[0]
    elif geom.get("type") == "MultiPolygon":
        for poly in coords:
            if poly:
                all_pts.extend(poly[0])
    if not all_pts:
        return 999999.0
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


_geofabrik_index_cache: dict[str, Any] | None = None


class OSMMapService:
    """
    Handles dynamic discovery, download, and incremental compilation
    of OpenStreetMap road networks into Valhalla for any city worldwide.
    """

    @classmethod
    async def resolve_osm_pbf_url(cls, city_name: str) -> tuple[str, str]:
        """
        Resolves any destination city dynamically to its authoritative Geofabrik download URL and filename.
        Returns: (download_url, filename)
        """
        city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

        # 1. Fetch Geofabrik dynamic index
        index_data = await cls._get_geofabrik_index()

        # 2. Check for exact name/id match in Geofabrik index
        if index_data and "features" in index_data:
            for feature in index_data["features"]:
                props = feature.get("properties", {})
                f_id = str(props.get("id", "")).lower()
                f_name = str(props.get("name", "")).lower()
                urls = props.get("urls", {})
                if (city_clean == f_id or city_clean == f_name) and "pbf" in urls:
                    pbf_url = urls["pbf"]
                    return pbf_url, pbf_url.split("/")[-1]

        # 3. Spatial resolution via city center coordinates
        center_lat: float | None = None
        center_lon: float | None = None

        try:
            from app.adapters.repositories.sql_city_repository import SqlCityRepository
            from app.db.session import async_session

            async with async_session() as s:
                c_repo = SqlCityRepository(s)
                c_ent = await c_repo.find_by_name_or_alias(city_clean)
                if c_ent:
                    center_lat, center_lon = c_ent.center_lat, c_ent.center_lon
        except Exception as exc:
            logger.debug(f"City repo lookup skipped for OSM PBF: {exc}")

        if center_lat is None or center_lon is None:
            try:
                from app.infrastructure.providers.osm_city_ingest import geocode_city

                geo = await geocode_city(city_clean)
                center_lat, center_lon = geo.lat, geo.lon
            except Exception as geo_exc:
                logger.debug(f"Geocoding skipped for OSM PBF: {geo_exc}")

        if (
            center_lat is not None
            and center_lon is not None
            and index_data
            and "features" in index_data
        ):
            matches: list[tuple[float, str, str]] = []
            for feature in index_data["features"]:
                urls = feature.get("properties", {}).get("urls", {})
                if "pbf" not in urls:
                    continue
                geom = feature.get("geometry", {})
                if _point_in_geometry(center_lon, center_lat, geom):
                    area = _geom_approx_area(geom)
                    pbf_url = urls["pbf"]
                    matches.append((area, feature["properties"].get("id", ""), pbf_url))

            if matches:
                # Pick the smallest enclosing administrative region
                matches.sort(key=lambda m: m[0])
                best_url = matches[0][2]
                filename = best_url.split("/")[-1]
                logger.info(
                    f"Spatially resolved Geofabrik extract for '{city_name}' -> {matches[0][1]} ({best_url})"
                )
                return best_url, filename

        # Fallback to direct name PBF if index is unreachable
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
