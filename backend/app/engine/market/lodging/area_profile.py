"""
Derives geospatial area tag profiles for lodging properties from nearby attractions and POIs.
Zero mock data: aggregates authentic POI data from database with in-memory memoization.
"""

from __future__ import annotations

import logging
import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttractionModel, CityModel
from app.engine.scoring.features import CATEGORY_TO_TAG, TAG_KEYS

logger = logging.getLogger(__name__)

# Cache keyed by (destination_code, round(lat, 3), round(lon, 3))
_AREA_PROFILE_CACHE: dict[tuple[str, float, float], dict[str, float]] = {}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


async def get_hotel_area_tag_profile(
    session: AsyncSession,
    destination_code: str,
    latitude: float | None,
    longitude: float | None,
    radius_km: float = 1.2,
) -> dict[str, float]:
    """
    Computes an 8D normalized tag profile for a hotel location based on POIs
    within radius_km. Returns dict mapping TAG_KEYS to weights in [0.0, 1.0].
    """
    if latitude is None or longitude is None:
        return {k: 0.125 for k in TAG_KEYS}

    cache_key = (destination_code.upper(), round(latitude, 3), round(longitude, 3))
    if cache_key in _AREA_PROFILE_CACHE:
        return _AREA_PROFILE_CACHE[cache_key]

    dest_norm = destination_code.strip().upper()

    # Find matching city in cities table
    city_stmt = (
        select(CityModel)
        .where(
            (CityModel.id == dest_norm)
            | (CityModel.country_code == dest_norm)
            | (CityModel.name.ilike(f"%{dest_norm}%"))
        )
        .limit(1)
    )
    city_res = await session.execute(city_stmt)
    city = city_res.scalar_one_or_none()
    city_id = city.id if city else None

    # Lat/Lon bounding box for ~1.5 km (~0.015 degrees)
    delta_deg = radius_km / 111.0
    lat_min, lat_max = latitude - delta_deg, latitude + delta_deg
    lon_min, lon_max = longitude - delta_deg, longitude + delta_deg

    poi_stmt = select(
        AttractionModel.category,
        AttractionModel.location,
    )
    if city_id:
        poi_stmt = poi_stmt.where(AttractionModel.city_id == city_id)
    else:
        poi_stmt = poi_stmt.where(AttractionModel.city.ilike(f"%{dest_norm}%"))

    poi_rows = (await session.execute(poi_stmt.limit(200))).all()

    tag_counts: dict[str, float] = {
        k: 0.1 for k in TAG_KEYS
    }  # Dirichlet smoothing prior

    for cat, loc in poi_rows:
        if not loc or not isinstance(loc, dict):
            continue
        p_lat = loc.get("lat") or loc.get("latitude")
        p_lon = loc.get("lng") or loc.get("lon") or loc.get("longitude")
        if p_lat is None or p_lon is None:
            continue

        try:
            p_lat_f, p_lon_f = float(p_lat), float(p_lon)
        except (ValueError, TypeError):
            continue

        if not (lat_min <= p_lat_f <= lat_max and lon_min <= p_lon_f <= lon_max):
            continue

        dist = _haversine_km(latitude, longitude, p_lat_f, p_lon_f)
        if dist > radius_km:
            continue

        # Inverse distance weighting
        weight = 1.0 / max(dist, 0.1)
        norm_cat = str(cat).upper()
        matched_tags = CATEGORY_TO_TAG.get(norm_cat, ["art_culture"])
        for tag in matched_tags:
            if tag in tag_counts:
                tag_counts[tag] += weight

    # Normalize to sum = 1.0
    total = sum(tag_counts.values()) or 1.0
    profile = {k: round(v / total, 4) for k, v in tag_counts.items()}
    _AREA_PROFILE_CACHE[cache_key] = profile
    return profile
