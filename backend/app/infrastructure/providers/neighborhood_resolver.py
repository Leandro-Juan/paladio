"""Spatial Neighborhood / Barrio Resolver.

Resolves neighborhood names (barrios/districts) for POIs using point-in-polygon
with administrative/suburb boundaries, nearest centroid fallback within 1.2 km,
and OSM address tag fallbacks.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

import httpx
from app.infrastructure.providers.osm_city_ingest import CityGeo
from app.infrastructure.providers.osm_http_client import execute_overpass_query
from app.services.osm_map_service import _point_in_geometry

logger = logging.getLogger(__name__)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


@dataclass
class Neighborhood:
    name: str
    centroid_lat: float
    centroid_lon: float
    geometry: dict[str, Any] | None = None


async def fetch_city_neighborhoods(
    geo: CityGeo,
    client: httpx.AsyncClient | None = None,
) -> list[Neighborhood]:
    """Queries Overpass for all suburbs, quarters, and administrative level 9/10 boundaries."""
    radius_m = int(geo.radius_km * 1000)
    query = f"""
    [out:json][timeout:30];
    (
      node["place"~"^(suburb|quarter|neighbourhood)$"]["name"](around:{radius_m},{geo.lat},{geo.lon});
      way["place"~"^(suburb|quarter|neighbourhood)$"]["name"](around:{radius_m},{geo.lat},{geo.lon});
      relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"](around:{radius_m},{geo.lat},{geo.lon});
    );
    out center tags;
    """
    try:
        elements = await execute_overpass_query(query, client=client, max_retries=2)
    except Exception as exc:
        logger.warning(f"Could not fetch neighborhoods for {geo.name}: {exc}")
        return []

    neighborhoods: list[Neighborhood] = []
    seen_names: set[str] = set()

    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name:en") or tags.get("name")
        if not name:
            continue
        name_clean = name.strip()
        if name_clean.lower() in seen_names:
            continue

        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue

        seen_names.add(name_clean.lower())
        geom = el.get("geometry")
        neighborhoods.append(
            Neighborhood(
                name=name_clean,
                centroid_lat=float(lat),
                centroid_lon=float(lon),
                geometry=geom if isinstance(geom, dict) else None,
            )
        )

    logger.info(f"Discovered {len(neighborhoods)} neighborhoods for {geo.name}")
    return neighborhoods


class NeighborhoodResolver:
    """Assigns neighborhood to POIs via geometry containment or proximity."""

    def __init__(
        self, neighborhoods: list[Neighborhood] | list[dict[str, Any]]
    ) -> None:
        self.neighborhoods: list[Neighborhood] = []
        for n in neighborhoods:
            if isinstance(n, Neighborhood):
                self.neighborhoods.append(n)
            elif (
                isinstance(n, dict)
                and "name" in n
                and "centroid_lat" in n
                and "centroid_lon" in n
            ):
                self.neighborhoods.append(
                    Neighborhood(
                        name=n["name"],
                        centroid_lat=float(n["centroid_lat"]),
                        centroid_lon=float(n["centroid_lon"]),
                        geometry=n.get("geometry"),
                    )
                )

    def resolve(
        self,
        lat: float,
        lon: float,
        tags: dict[str, str] | None = None,
        max_centroid_dist_m: float = 1200.0,
    ) -> str | None:
        """Finds the best matching neighborhood for coordinates (lat, lon)."""
        tags = tags or {}

        # 1. Point-in-polygon check for neighborhoods with polygon geometry
        for n in self.neighborhoods:
            if n.geometry:
                try:
                    if _point_in_geometry(lon, lat, n.geometry):
                        return n.name
                except Exception:
                    continue

        # 2. Nearest centroid within max_centroid_dist_m
        best_name: str | None = None
        best_dist = float("inf")
        for n in self.neighborhoods:
            d = _haversine_m(lat, lon, n.centroid_lat, n.centroid_lon)
            if d < best_dist and d <= max_centroid_dist_m:
                best_dist = d
                best_name = n.name

        if best_name is not None:
            return best_name

        # 3. Fallback to OSM address tags
        addr_fallback = (
            tags.get("addr:suburb")
            or tags.get("addr:quarter")
            or tags.get("addr:district")
            or tags.get("addr:neighbourhood")
            or tags.get("suburb")
        )
        if addr_fallback:
            return addr_fallback.strip()

        return None

    def resolve_neighborhood(
        self,
        lat: float,
        lon: float,
        tags: dict[str, str] | None = None,
    ) -> str | None:
        """Convenience alias for resolve."""
        return self.resolve(lat, lon, tags=tags)

    @classmethod
    async def create_for_city(
        cls,
        city_name_or_geo: str | CityGeo,
        client: httpx.AsyncClient | None = None,
    ) -> NeighborhoodResolver:
        """Convenience factory: geocodes city if needed, fetches neighborhoods and returns resolver."""
        from app.infrastructure.providers.osm_city_ingest import geocode_city

        if isinstance(city_name_or_geo, CityGeo):
            geo = city_name_or_geo
        else:
            geo = await geocode_city(city_name_or_geo)

        neighborhoods = await fetch_city_neighborhoods(geo, client=client)
        return cls(neighborhoods)
