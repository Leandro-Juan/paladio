"""POI Search and Retrieval API (Phase 4).

Powered by HybridRetriever:
- Single-roundtrip SQL CTE combining Dense Vector + Full-Text Search + Trigram RRF
- Composite reranking (RRF + Iconicity + Facet Match + Doc Quality Bonus)
- Spatial-Semantic MMR diversification
- Exposes description, neighborhood, facets, doc_quality, and hours_known
"""

import asyncio
import json
import logging
import re
import unicodedata
from typing import Any

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_optional_user
from app.db.models import AttractionModel, TripModel, UserModel
from app.db.session import get_db
from app.engine.retrieval.hybrid_retriever import HybridRetriever
from app.engine.retrieval.query_rewriter import QueryRewriter
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)
from app.services.wikimedia_photo_resolver import WikimediaPhotoResolver
from app.utils.opening_hours_parser import parse_osm_opening_hours
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Float, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


class PoiSearchItem(BaseModel):
    id: str
    name: str
    category: str
    lat: float
    lng: float
    duration_mins: int = 60
    cost_eur: float = 0.0
    similarity: float = 1.0
    match_type: str | None = None
    description: str | None = None
    neighborhood: str | None = None
    facets: dict[str, Any] = Field(default_factory=dict)
    doc_quality: str = "C"
    hours_known: bool = False
    rating: float | None = None
    iconicity_score: float = 0.0
    scoring: dict[str, Any] = Field(default_factory=dict)
    photo_url: str | None = None
    thumbnail_url: str | None = None
    transit_info: dict[str, Any] | None = None


class PoiSearchResponse(BaseModel):
    city: str
    query: str
    search_type: str  # "exact_match", "fuzzy_match", "semantic_rag"
    exact_match_found: bool
    message: str | None = None
    exact_match: PoiSearchItem | None = None
    results: list[PoiSearchItem] = []
    total: int | None = None


class PoiPhotoItem(BaseModel):
    url: str
    thumbnail_url: str
    caption: str | None = None
    author: str | None = None
    license_name: str | None = None
    license_url: str | None = None


class BatchPhotoRequestItem(BaseModel):
    id: str | None = None
    name: str
    city: str = ""


class BatchPhotoRequest(BaseModel):
    pois: list[BatchPhotoRequestItem]


class BatchPhotoResponse(BaseModel):
    photos: dict[str, PoiPhotoItem | None]


class PoiDetailResponse(BaseModel):
    id: str
    name: str
    category: str
    city: str
    lat: float
    lng: float
    duration_mins: int = 60
    cost_eur: float = 0.0
    cost_is_estimated: bool = True
    cost_source: str | None = None
    scoring: dict[str, Any] = Field(default_factory=dict)
    description: str | None = None
    description_source: str | None = None
    wikipedia_title: str | None = None
    wikidata_id: str | None = None
    website: str | None = None
    neighborhood: str | None = None
    doc_quality: str = "C"
    hours_known: bool = False
    osm_opening_hours: str | None = None
    daily_windows: list[Any] = Field(default_factory=list)
    photos: list[PoiPhotoItem] = Field(default_factory=list)
    transit_info: dict[str, Any] | None = None


def _normalize_text(s: str) -> str:
    """Removes accents, lowercases, and strips extra spaces."""
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_str = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return re.sub(r"\s+", " ", ascii_str).strip().lower()


def _strip_articles(s: str) -> str:
    """Strips leading language articles for relaxed prefix matching."""
    norm = _normalize_text(s)
    prefixes = [
        "el ",
        "la ",
        "los ",
        "las ",
        "the ",
        "le ",
        "les ",
        "un ",
        "una ",
        "museo del ",
        "museo de ",
        "museo ",
    ]
    for p in prefixes:
        if norm.startswith(p):
            return norm[len(p) :].strip()
    return norm


def _extract_coords(location: Any) -> tuple[float, float]:
    """Safely extracts (lat, lng) from dict or object."""
    if isinstance(location, dict):
        lat = float(location.get("latitude") or location.get("lat") or 0.0)
        lng = float(location.get("longitude") or location.get("lng") or 0.0)
        return lat, lng
    return 0.0, 0.0


def _candidate_to_search_item(
    c: dict[str, Any], sim: float, match_type: str
) -> PoiSearchItem:
    lat, lng = _extract_coords(c.get("location"))
    iconicity = float(c.get("iconicity_score") or 0.0)
    scoring_dict = dict(c.get("scoring") or {})
    scoring_dict["iconicity_score"] = iconicity
    raw_rating = scoring_dict.get("rating")
    rating_val = (
        round(float(raw_rating), 1)
        if raw_rating is not None and float(raw_rating) > 0
        else None
    )
    return PoiSearchItem(
        id=str(c.get("id")),
        name=str(c.get("name")),
        category=str(c.get("category", "attraction")),
        lat=lat,
        lng=lng,
        duration_mins=int(c.get("duration_mins") or 60),
        cost_eur=float(c.get("cost_eur") or 0.0),
        similarity=round(float(sim), 3),
        rating=rating_val,
        iconicity_score=iconicity,
        scoring=scoring_dict,
        match_type=match_type,
        description=c.get("description"),
        neighborhood=c.get("neighborhood"),
        facets=c.get("facets") or {},
        doc_quality=c.get("doc_quality") or "C",
        hours_known=bool(c.get("hours_known", False)),
    )


CATEGORY_SYNONYMS: dict[str, list[str]] = {
    "monument": ["monument", "landmark", "historic"],
    "landmark": ["monument", "landmark", "historic"],
    "museum": ["museum", "gallery", "exhibition"],
    "cafe": ["cafe", "coffee", "bakery"],
    "restaurant": ["restaurant", "bistro", "food", "dining"],
    "attraction": ["attraction", "sight", "theme_park"],
    "bar": ["bar", "pub", "nightlife"],
    "park": ["park", "garden", "nature"],
    "shopping": ["shop", "shopping", "market", "store"],
    "hotel": ["hotel", "hostel", "lodging"],
}


# TODO(Phase 6): Deprecated legacy transit info extraction.
# Transit stops are now handled exclusively via the Transit tab and its dedicated endpoints.
def _extract_transit_info(
    p: AttractionModel, meta: dict[str, Any]
) -> dict[str, Any] | None:
    category = (p.category or "").lower()
    name = p.name or ""
    tags = dict(meta.get("tags") or {})

    is_transit = (
        category in ("transit", "metro", "train", "bus_stop", "tram", "subway")
        or "transit_info" in meta
        or tags.get("railway") in ("station", "subway_entrance", "tram_stop", "halt")
        or tags.get("station") in ("subway", "train", "light_rail")
        or tags.get("highway") == "bus_stop"
        or tags.get("amenity") in ("bus_station", "ferry_terminal")
    )
    if not is_transit:
        return None

    if meta.get("transit_info"):
        ti = dict(meta["transit_info"])
        # Dynamically sanitize lines to ensure no entrance exit refs or stop codes leak
        raw_lines = ti.get("lines") or []
        stop_ref = (
            tags.get("ref") or meta.get("tags", {}).get("ref") or ti.get("stop_code")
        )
        is_entrance = (
            tags.get("railway") == "subway_entrance"
            or meta.get("tags", {}).get("railway") == "subway_entrance"
        )
        if is_entrance:
            # Subway entrances never have transit lines unless explicitly tagged via route_ref
            clean_l = [
                str(x).strip()
                for x in (tags.get("route_ref") or tags.get("lines") or "").split(";")
                if str(x).strip() and str(x).strip() != stop_ref
            ]
            ti["lines"] = clean_l
        else:
            ti["lines"] = [
                str(x).strip()
                for x in raw_lines
                if str(x).strip() and str(x).strip() != stop_ref
            ]
        return ti

    transit_mode = "transit"
    if (
        category == "metro"
        or tags.get("station") == "subway"
        or tags.get("railway") == "subway_entrance"
        or "metro" in name.lower()
        or tags.get("subway") == "yes"
    ):
        transit_mode = "metro"
    elif (
        category == "train"
        or tags.get("railway") in ("station", "halt")
        or tags.get("station") == "train"
        or "cercanías" in name.lower()
        or "renfe" in name.lower()
        or "gare" in name.lower()
    ):
        transit_mode = "train"
    elif (
        category == "tram"
        or tags.get("railway") == "tram_stop"
        or tags.get("tram") == "yes"
    ):
        transit_mode = "tram"
    elif (
        category in ("bus", "bus_stop")
        or tags.get("amenity") == "bus_station"
        or tags.get("highway") == "bus_stop"
        or tags.get("bus") == "yes"
    ):
        transit_mode = "bus_stop"

    lines: list[str] = []
    # Only legitimate route tags represent transit lines in OpenStreetMap
    is_entrance = tags.get("railway") == "subway_entrance"
    line_keys = (
        ("route_ref", "lines")
        if is_entrance
        else ("lines", "route_ref", "line", "routes")
    )
    for line_key in line_keys:
        val = tags.get(line_key) or meta.get(line_key)
        if val:
            if isinstance(val, list):
                lines.extend([str(x).strip() for x in val if str(x).strip()])
            elif isinstance(val, str):
                lines.extend([x.strip() for x in re.split(r"[,;/|]", val) if x.strip()])

    stop_ref = tags.get("ref") or meta.get("tags", {}).get("ref")
    if stop_ref:
        lines = [x for x in lines if x != str(stop_ref).strip()]

    operator = (
        tags.get("operator")
        or meta.get("operator")
        or meta.get("network")
        or tags.get("network")
    )

    station_type = (
        "Underground Metro Station"
        if transit_mode == "metro"
        else "Railway Station"
        if transit_mode == "train"
        else "Tram Stop"
        if transit_mode == "tram"
        else "Bus Station / Stop"
    )

    wheelchair = tags.get("wheelchair") or meta.get("wheelchair")
    schedule = p.osm_opening_hours or tags.get("opening_hours")
    frequency = tags.get("interval") or tags.get("frequency") or meta.get("frequency")
    zone = tags.get("zone") or meta.get("zone")

    return {
        "type": transit_mode,
        "lines": sorted(list(dict.fromkeys(lines))) if lines else [],
        "operator": operator,
        "network": tags.get("network") or operator,
        "station_type": station_type,
        "wheelchair": wheelchair,
        "zone": zone,
        "schedule": schedule,
        "frequency": frequency,
    }


def is_point_in_polygon(
    lat: float, lng: float, polygon: list[tuple[float, float]]
) -> bool:
    """Standard 2D Ray Casting point-in-polygon algorithm."""
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        intersect = ((yi > lng) != (yj > lng)) and (
            lat < (xj - xi) * (lng - yi) / (yj - yi) + xi
        )
        if intersect:
            inside = not inside
        j = i
    return inside


def _model_to_search_item(
    p: AttractionModel,
    match_type: str = "category_browse",
    similarity: float = 1.0,
) -> PoiSearchItem:
    lat, lng = _extract_coords(p.location)
    meta = p.metadata_field if isinstance(p.metadata_field, dict) else {}
    iconicity = float(p.iconicity_score or 0.0)
    scoring_dict = dict(p.scoring or {})
    scoring_dict["iconicity_score"] = iconicity
    raw_rating = scoring_dict.get("rating")
    rating_val = (
        round(float(raw_rating), 1)
        if raw_rating is not None and float(raw_rating) > 0
        else None
    )
    if match_type == "taste_recommendation" and similarity < 1.0:
        # Calibrate 768D cosine similarity (typically 0.35 - 0.60) to human-readable affinity (62% - 98%)
        calibrated_sim = min(
            0.98, max(0.60, round(0.60 + (similarity - 0.38) * (0.38 / 0.22), 2))
        )
        final_sim = calibrated_sim
    else:
        final_sim = round(float(similarity), 3)

    return PoiSearchItem(
        id=str(p.id),
        name=p.name,
        category=p.category,
        lat=lat,
        lng=lng,
        duration_mins=int(p.duration_mins or 60),
        cost_eur=float(p.cost_eur or 0.0),
        similarity=final_sim,
        rating=rating_val,
        iconicity_score=iconicity,
        scoring=scoring_dict,
        match_type=match_type,
        description=getattr(p, "description", None) or meta.get("description"),
        neighborhood=getattr(p, "neighborhood", None) or meta.get("neighborhood"),
        facets=meta.get("facets") or {},
        doc_quality=meta.get("doc_quality") or "C",
        hours_known=bool(p.osm_opening_hours),
        transit_info=_extract_transit_info(p, meta),
    )


async def _enrich_items_with_photos(items: list[PoiSearchItem], city: str = "") -> None:
    """Enriches PoiSearchItems with cached or resolved thumbnail photos."""
    if not items:
        return
    for item in items:
        try:
            cached = await WikimediaPhotoResolver.get_cached_photos(item.id)
            if not cached and item.name:
                cached = await WikimediaPhotoResolver.get_cached_photos(
                    item.name.lower()
                )
            if cached and len(cached) > 0:
                item.photo_url = cached[0].get("url")
                item.thumbnail_url = cached[0].get("thumbnail_url") or item.photo_url
        except Exception as e:
            logger.debug(f"Failed to check photo cache for {item.name}: {e}")


@router.get("/search", response_model=PoiSearchResponse)
async def search_pois(
    city: str = Query(..., description="Destination city name (e.g. Madrid)"),
    query: str = Query("", description="Search query: POI name or natural language"),
    category: str | None = Query(
        None, description="Optional category filter (e.g. museum, cafe, restaurant)"
    ),
    trip_id: str | None = Query(
        None, description="Optional trip ID to fetch trip-specific hotel and airport"
    ),
    day: int | None = Query(
        None, description="Optional trip day number for territorial spatial clustering"
    ),
    bounds: str | None = Query(
        None, description="Optional bounding box 'min_lat,min_lng,max_lat,max_lng'"
    ),
    polygon: str | None = Query(
        None, description="Optional convex hull polygon 'lat1,lng1;lat2,lng2;...'"
    ),
    limit: int = Query(15, ge=1, le=200, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    """Hybrid POI Search Engine with Single-Roundtrip SQL RRF & Spatial-Semantic MMR."""
    clean_query = query.strip()

    # 1. Resolve city
    city_repo = SqlCityRepository(session)
    city_obj = await city_repo.find_by_name_or_alias(city)
    city_name = city_obj.name if city_obj else city.strip()
    city_id = city_obj.id if city_obj else f"{city.strip().lower()}_es"

    # Resolve user taste embedding for personalized recommendations & category affinity ranking
    resolved_user = current_user
    if not resolved_user and trip_id:
        trip_obj = await session.get(TripModel, trip_id)
        if trip_obj and trip_obj.user_id:
            user_repo = SqlUserRepository(session)
            resolved_user = await user_repo.get_by_id(trip_obj.user_id)

    user_embedding = None
    if (
        resolved_user
        and resolved_user.embedding is not None
        and len(resolved_user.embedding) == 768
    ):
        user_embedding = resolved_user.embedding

    # Resolve day territory / bounding box & convex hull polygon
    polygon_pts: list[tuple[float, float]] = []
    if polygon:
        try:
            for pair in polygon.split(";"):
                parts = [float(x.strip()) for x in pair.split(",") if x.strip()]
                if len(parts) == 2:
                    polygon_pts.append((parts[0], parts[1]))
        except Exception as e:
            logger.debug(f"Failed to parse polygon parameter: {e}")

    day_bounds: tuple[float, float, float, float] | None = None
    if bounds:
        try:
            parts = [float(x.strip()) for x in bounds.split(",")]
            if len(parts) == 4:
                day_bounds = (parts[0], parts[1], parts[2], parts[3])
        except Exception:
            day_bounds = None

    if not day_bounds and polygon_pts:
        p_lats = [pt[0] for pt in polygon_pts]
        p_lngs = [pt[1] for pt in polygon_pts]
        day_bounds = (
            min(p_lats) - 0.005,
            min(p_lngs) - 0.005,
            max(p_lats) + 0.005,
            max(p_lngs) + 0.005,
        )

    if not day_bounds and trip_id and day is not None and day > 0:
        try:
            trip_obj = await session.get(TripModel, trip_id)
            if trip_obj and isinstance(trip_obj.itinerary_data, dict):
                days_list = trip_obj.itinerary_data.get("days", [])
                target_day_data = next(
                    (d for d in days_list if d.get("day") == day), None
                )
                if target_day_data:
                    day_path = (target_day_data.get("itinerary") or {}).get(
                        "path"
                    ) or []
                    lats, lngs = [], []
                    for sp in day_path:
                        p = sp.get("poi") or {}
                        cat_p = str(p.get("category", "")).lower()
                        if cat_p in ("airport", "flight"):
                            continue
                        loc = p.get("location") or {}
                        la = float(loc.get("latitude") or p.get("lat") or 0.0)
                        lo = float(loc.get("longitude") or p.get("lng") or 0.0)
                        if la != 0.0 and lo != 0.0:
                            lats.append(la)
                            lngs.append(lo)
                    if lats and lngs:
                        # Expand by 0.015 degrees (~1.5 km buffer)
                        day_bounds = (
                            min(lats) - 0.015,
                            min(lngs) - 0.015,
                            max(lats) + 0.015,
                            max(lngs) + 0.015,
                        )
        except Exception as e:
            logger.debug(f"Failed to resolve day territory bounds: {e}")

    in_day_clause = None
    if day_bounds:
        b_min_lat, b_min_lng, b_max_lat, b_max_lng = day_bounds
        in_day_clause = and_(
            cast(AttractionModel.location["latitude"].astext, Float).between(
                b_min_lat, b_max_lat
            ),
            cast(AttractionModel.location["longitude"].astext, Float).between(
                b_min_lng, b_max_lng
            ),
        )

    # Category browse or top recommendation fill when no search text is entered
    if not clean_query:
        if category and category.lower() != "all":
            cat_lower = category.lower().strip()
            if cat_lower in (
                "transit",
                "metro",
                "train",
                "bus",
                "bus_stop",
                "tram",
                "subway",
            ):
                return PoiSearchResponse(
                    city=city_name,
                    query="",
                    search_type="category_browse",
                    exact_match_found=False,
                    exact_match=None,
                    results=[],
                    total=0,
                )
            target_cats = CATEGORY_SYNONYMS.get(cat_lower, [cat_lower])

            count_stmt = (
                select(func.count())
                .select_from(AttractionModel)
                .where(
                    or_(
                        AttractionModel.city.ilike(city_name),
                        AttractionModel.city_id == city_id,
                    )
                )
                .where(func.lower(AttractionModel.category).in_(target_cats))
                .where(func.lower(AttractionModel.category) != "transit")
                .where(~AttractionModel.id.like("OSM-transit-%"))
            )
            total_count = (await session.execute(count_stmt)).scalar() or 0

            order_clauses = []
            if in_day_clause is not None:
                order_clauses.append(case((in_day_clause, 1), else_=0).desc())
            order_clauses.append(AttractionModel.tier.asc())

            if user_embedding is not None:
                cos_dist = AttractionModel.embedding.cosine_distance(user_embedding)
                sim_expr = (1.0 - func.coalesce(cos_dist, 1.0)).label("sim")
                comp_quality = (
                    func.coalesce(AttractionModel.iconicity_score, 0.0) * 0.70
                    + (1.0 - func.coalesce(cos_dist, 1.0)) * 0.30
                )
                order_clauses.append(comp_quality.desc())

                fetch_limit = max(100, limit + offset) if polygon_pts else limit
                fetch_offset = 0 if polygon_pts else offset
                stmt = (
                    select(AttractionModel, sim_expr)
                    .where(
                        or_(
                            AttractionModel.city.ilike(city_name),
                            AttractionModel.city_id == city_id,
                        )
                    )
                    .where(func.lower(AttractionModel.category).in_(target_cats))
                    .where(func.lower(AttractionModel.category) != "transit")
                    .where(~AttractionModel.id.like("OSM-transit-%"))
                    .order_by(*order_clauses)
                    .offset(fetch_offset)
                    .limit(fetch_limit)
                )
                db_rows = (await session.execute(stmt)).all()
                results = [
                    _model_to_search_item(
                        row[0],
                        match_type="taste_recommendation",
                        similarity=float(row[1] if row[1] is not None else 1.0),
                    )
                    for row in db_rows
                ]
            else:
                order_clauses.append(AttractionModel.iconicity_score.desc())
                fetch_limit = max(100, limit + offset) if polygon_pts else limit
                fetch_offset = 0 if polygon_pts else offset
                stmt = (
                    select(AttractionModel)
                    .where(
                        or_(
                            AttractionModel.city.ilike(city_name),
                            AttractionModel.city_id == city_id,
                        )
                    )
                    .where(func.lower(AttractionModel.category).in_(target_cats))
                    .where(func.lower(AttractionModel.category) != "transit")
                    .where(~AttractionModel.id.like("OSM-transit-%"))
                    .order_by(*order_clauses)
                    .offset(fetch_offset)
                    .limit(fetch_limit)
                )
                db_pois = (await session.execute(stmt)).scalars().all()
                results = [_model_to_search_item(p, "category_browse") for p in db_pois]

            if polygon_pts:
                results.sort(
                    key=lambda x: (
                        1 if is_point_in_polygon(x.lat, x.lng, polygon_pts) else 0,
                        1
                        if (
                            day_bounds
                            and day_bounds[0] <= x.lat <= day_bounds[2]
                            and day_bounds[1] <= x.lng <= day_bounds[3]
                        )
                        else 0,
                        x.similarity,
                    ),
                    reverse=True,
                )
                results = results[offset : offset + limit]

            await _enrich_items_with_photos(results, city_name)
            return PoiSearchResponse(
                city=city_name,
                query="",
                search_type="taste_recommendation"
                if user_embedding is not None
                else "category_browse",
                exact_match_found=bool(results),
                exact_match=None,
                results=results,
                total=total_count,
            )
        else:
            count_stmt = (
                select(func.count())
                .select_from(AttractionModel)
                .where(
                    or_(
                        AttractionModel.city.ilike(city_name),
                        AttractionModel.city_id == city_id,
                    )
                )
                .where(func.lower(AttractionModel.category) != "transit")
                .where(~AttractionModel.id.like("OSM-transit-%"))
            )
            total_count = (await session.execute(count_stmt)).scalar() or 0

            order_clauses = []
            if in_day_clause is not None:
                order_clauses.append(case((in_day_clause, 1), else_=0).desc())
            order_clauses.append(AttractionModel.tier.asc())

            if user_embedding is not None:
                cos_dist = AttractionModel.embedding.cosine_distance(user_embedding)
                sim_expr = (1.0 - func.coalesce(cos_dist, 1.0)).label("sim")
                comp_quality = (
                    func.coalesce(AttractionModel.iconicity_score, 0.0) * 0.70
                    + (1.0 - func.coalesce(cos_dist, 1.0)) * 0.30
                )
                order_clauses.append(comp_quality.desc())

                stmt = (
                    select(AttractionModel, sim_expr)
                    .where(
                        or_(
                            AttractionModel.city.ilike(city_name),
                            AttractionModel.city_id == city_id,
                        )
                    )
                    .where(func.lower(AttractionModel.category) != "transit")
                    .where(~AttractionModel.id.like("OSM-transit-%"))
                    .where(AttractionModel.embedding.isnot(None))
                    .order_by(*order_clauses)
                    .offset(offset)
                    .limit(limit)
                )
                db_rows = (await session.execute(stmt)).all()
                results = [
                    _model_to_search_item(
                        row[0],
                        match_type="taste_recommendation",
                        similarity=float(row[1] if row[1] is not None else 1.0),
                    )
                    for row in db_rows
                ]
                await _enrich_items_with_photos(results, city_name)
                return PoiSearchResponse(
                    city=city_name,
                    query="",
                    search_type="taste_recommendation",
                    exact_match_found=bool(results),
                    exact_match=None,
                    results=results,
                    total=total_count,
                )
            else:
                order_clauses.append(AttractionModel.iconicity_score.desc())
                stmt = (
                    select(AttractionModel)
                    .where(
                        or_(
                            AttractionModel.city.ilike(city_name),
                            AttractionModel.city_id == city_id,
                        )
                    )
                    .where(func.lower(AttractionModel.category) != "transit")
                    .where(~AttractionModel.id.like("OSM-transit-%"))
                    .order_by(*order_clauses)
                    .offset(offset)
                    .limit(limit)
                )
                db_pois = (await session.execute(stmt)).scalars().all()
                results = [_model_to_search_item(p, "recommendations") for p in db_pois]
                await _enrich_items_with_photos(results, city_name)
                return PoiSearchResponse(
                    city=city_name,
                    query="",
                    search_type="recommendations",
                    exact_match_found=bool(results),
                    exact_match=None,
                    results=results,
                    total=total_count,
                )

    norm_query = _normalize_text(clean_query)
    stripped_query = _strip_articles(clean_query)

    is_hotel_query = any(
        k in norm_query for k in ("hotel", "hoteles", "lodging", "alojamiento")
    )
    is_airport_query = any(
        k in norm_query for k in ("airport", "aeropuerto", "aeropuertos", "flight")
    )

    # Check for trip-specific hotel / airport anchor
    if trip_id and (is_hotel_query or is_airport_query):
        trip_obj = await session.get(TripModel, trip_id)
        if trip_obj and isinstance(trip_obj.itinerary_data, dict):
            itin = trip_obj.itinerary_data
            if is_hotel_query:
                h_info = (itin.get("travel_constraints") or {}).get(
                    "hotel"
                ) or itin.get("hotel")
                h_name = h_info.get("name") if isinstance(h_info, dict) else None
                h_loc = (
                    h_info.get("location") if isinstance(h_info, dict) else None
                ) or {}
                h_lat = float(
                    h_loc.get("latitude")
                    or (h_info.get("lat") if isinstance(h_info, dict) else None)
                    or 0.0
                )
                h_lng = float(
                    h_loc.get("longitude")
                    or (h_info.get("lng") if isinstance(h_info, dict) else None)
                    or 0.0
                )
                if not h_name:
                    for d in itin.get("days", []):
                        for sp in d.get("itinerary", {}).get("path") or []:
                            p = sp.get("poi") or {}
                            cat_p = str(p.get("category", "")).upper()
                            nm_p = str(p.get("name", ""))
                            if (
                                cat_p in ("HOTEL", "LODGING", "ACCOMMODATION")
                                or "hotel" in nm_p.lower()
                            ):
                                h_name = nm_p
                                loc = p.get("location") or {}
                                h_lat = float(
                                    loc.get("latitude") or p.get("lat") or 0.0
                                )
                                h_lng = float(
                                    loc.get("longitude") or p.get("lng") or 0.0
                                )
                                break
                        if h_name:
                            break
                if h_name:
                    hotel_item = PoiSearchItem(
                        id=f"trip_hotel_{trip_id}",
                        name=h_name,
                        category="HOTEL",
                        lat=h_lat,
                        lng=h_lng,
                        duration_mins=30,
                        cost_eur=0.0,
                        similarity=1.0,
                        match_type="trip_hotel_base",
                        description=f"Booked Hotel for trip to {city_name}",
                    )
                    return PoiSearchResponse(
                        city=city_name,
                        query=clean_query,
                        search_type="trip_hotel_base",
                        exact_match_found=True,
                        exact_match=hotel_item,
                        results=[hotel_item],
                    )
            elif is_airport_query:
                a_info = (itin.get("travel_constraints") or {}).get(
                    "airport"
                ) or itin.get("airport")
                a_name = a_info.get("name") if isinstance(a_info, dict) else None
                a_loc = (
                    a_info.get("location") if isinstance(a_info, dict) else None
                ) or {}
                a_lat = float(
                    a_loc.get("latitude")
                    or (a_info.get("lat") if isinstance(a_info, dict) else None)
                    or 0.0
                )
                a_lng = float(
                    a_loc.get("longitude")
                    or (a_info.get("lng") if isinstance(a_info, dict) else None)
                    or 0.0
                )
                if not a_name:
                    for d in itin.get("days", []):
                        for sp in d.get("itinerary", {}).get("path") or []:
                            p = sp.get("poi") or {}
                            cat_p = str(p.get("category", "")).upper()
                            nm_p = str(p.get("name", ""))
                            if (
                                cat_p in ("AIRPORT", "FLIGHT")
                                or "airport" in nm_p.lower()
                            ):
                                a_name = nm_p
                                loc = p.get("location") or {}
                                a_lat = float(
                                    loc.get("latitude") or p.get("lat") or 0.0
                                )
                                a_lng = float(
                                    loc.get("longitude") or p.get("lng") or 0.0
                                )
                                break
                        if a_name:
                            break
                if a_name:
                    airport_item = PoiSearchItem(
                        id=f"trip_airport_{trip_id}",
                        name=a_name,
                        category="AIRPORT",
                        lat=a_lat,
                        lng=a_lng,
                        duration_mins=60,
                        cost_eur=0.0,
                        similarity=1.0,
                        match_type="trip_airport_gateway",
                        description=f"Airport gateway for {city_name}",
                    )
                    return PoiSearchResponse(
                        city=city_name,
                        query=clean_query,
                        search_type="trip_airport_gateway",
                        exact_match_found=True,
                        exact_match=airport_item,
                        results=[airport_item],
                        total=1,
                    )

    # Database search for hotels/airports by name pattern if querying hotel/airport
    if is_hotel_query or is_airport_query:
        pattern = "%hotel%" if is_hotel_query else "%airport%"
        pattern_es = "%hotel%" if is_hotel_query else "%aeropuerto%"
        stmt = (
            select(AttractionModel)
            .where(
                AttractionModel.city.ilike(city_name),
                or_(
                    AttractionModel.name.ilike(pattern),
                    AttractionModel.name.ilike(pattern_es),
                    AttractionModel.category.ilike(pattern),
                ),
            )
            .limit(limit)
        )
        db_matches = (await session.execute(stmt)).scalars().all()
        if db_matches:
            match_results = [
                PoiSearchItem(
                    id=str(m.id),
                    name=m.name,
                    category="HOTEL" if is_hotel_query else "AIRPORT",
                    lat=float(m.latitude),
                    lng=float(m.longitude),
                    duration_mins=30 if is_hotel_query else 60,
                    cost_eur=0.0,
                    similarity=1.0,
                    match_type="exact_name",
                    description=f"{'Hotel' if is_hotel_query else 'Airport'} in {city_name}",
                )
                for m in db_matches
            ]
            return PoiSearchResponse(
                city=city_name,
                query=clean_query,
                search_type="exact_match",
                exact_match_found=True,
                exact_match=match_results[0],
                results=match_results,
                total=len(match_results),
            )

    # 2. Check for exact / fuzzy name match via Trigram RRF
    lexical_candidates = await HybridRetriever.search_hybrid(
        session=session,
        city=city_name,
        city_id=city_id,
        query_vec=None,
        clean_query=clean_query,
        exclude_transit=True,
        limit=5,
        w_vec=0.0,
        w_fts=0.4,
        w_trgm=0.6,
        apply_mmr=False,
    )

    best_match = None
    best_match_score = 0.0
    best_match_type = None

    norm_query = _normalize_text(clean_query)
    stripped_query = _strip_articles(clean_query)

    for cand in lexical_candidates:
        p_name = cand.get("name", "")
        norm_name = _normalize_text(p_name)
        stripped_name = _strip_articles(p_name)
        trgm_sim = float(cand.get("trgm_sim") or 0.0)
        aliases = [str(a) for a in (cand.get("aliases") or []) if a]
        norm_aliases = [_normalize_text(a) for a in aliases]
        stripped_aliases = [_strip_articles(a) for a in aliases]

        base_score = 0.0
        mtype = None

        if norm_name == norm_query or any(a == norm_query for a in norm_aliases):
            base_score = 1.0
            mtype = "exact_name"
        elif stripped_name == stripped_query or any(
            a == stripped_query for a in stripped_aliases
        ):
            base_score = 0.95
            mtype = "exact_name"
        elif (
            len(norm_query) >= 3
            and norm_query in norm_name
            or any(len(norm_query) >= 3 and norm_query in a for a in norm_aliases)
        ):
            base_score = 0.88
            mtype = "fuzzy_name"
        elif (
            len(stripped_query) >= 3
            and stripped_query in stripped_name
            or any(
                len(stripped_query) >= 3 and stripped_query in a
                for a in stripped_aliases
            )
        ):
            base_score = 0.82
            mtype = "fuzzy_name"
        elif trgm_sim >= 0.70:
            base_score = trgm_sim
            mtype = "fuzzy_name"

        if base_score > 0.0:
            # Factoring iconicity and tier to disambiguate famous landmarks vs minor establishments
            iconicity = float(cand.get("iconicity_score") or 0.0)
            tier = int(cand.get("tier") or 3)
            tier_bonus = 0.15 if tier == 1 else (0.08 if tier == 2 else 0.0)

            # Weighted rank score: iconicity is a really important factor (40%) alongside base lexical match (45%) and tier authority (15%)
            rank_score = base_score * 0.45 + iconicity * 0.40 + tier_bonus

            if rank_score > best_match_score:
                best_match_score = rank_score
                best_match = cand
                best_match_type = mtype

    # 3. Decision: Exact / Fuzzy match branch
    if best_match and best_match_score >= 0.60:
        exact_item = _candidate_to_search_item(
            best_match, 1.0, best_match_type or "exact_name"
        )

        # Find similar POIs nearby using vector embedding of exact match
        similar_items: list[PoiSearchItem] = []
        p_emb = best_match.get("embedding")
        if p_emb is not None:
            emb_list: list[float] | None = None
            if isinstance(p_emb, str):
                try:
                    loaded = json.loads(p_emb)
                    if isinstance(loaded, list):
                        emb_list = [float(x) for x in loaded]
                except Exception as parse_err:
                    logger.debug("Failed parsing embedding JSON string: %s", parse_err)
            elif hasattr(p_emb, "__iter__"):
                emb_list = [float(x) for x in p_emb]

            if emb_list and len(emb_list) == 768:
                sim_candidates = await HybridRetriever.search_hybrid(
                    session=session,
                    city=city_name,
                    city_id=city_id,
                    query_vec=emb_list,
                    clean_query="",
                    exclude_transit=True,
                    limit=limit + 1,
                    w_vec=1.0,
                    w_fts=0.0,
                    w_trgm=0.0,
                    apply_mmr=True,
                )
                for c in sim_candidates:
                    if str(c.get("id")) != str(best_match.get("id")):
                        raw_sim = float(c.get("vec_sim") or 0.0)
                        sim_val = (
                            raw_sim
                            if raw_sim > 0.0
                            else float(c.get("composite_score") or 0.85)
                        )
                        similar_items.append(
                            _candidate_to_search_item(c, sim_val, "similar_poi")
                        )
                    if len(similar_items) >= limit:
                        break

        return PoiSearchResponse(
            city=city_name,
            query=clean_query,
            search_type=best_match_type or "exact_match",
            exact_match_found=True,
            exact_match=exact_item,
            results=similar_items,
            total=len(similar_items) + (1 if exact_item else 0),
        )

    # 4. Natural Language Semantic RAG & Hybrid Retrieval
    sq = QueryRewriter.rewrite_query(clean_query, city_name)
    embedding_provider = OllamaEmbeddingProvider()
    try:
        query_vector = await embedding_provider.embed_text(
            clean_query, input_type="query"
        )
    except Exception:
        query_vector = None

    candidates = await HybridRetriever.search_hybrid(
        session=session,
        city=city_name,
        city_id=city_id,
        query_vec=query_vector,
        clean_query=sq.clean_query,
        required_facets=sq.required_facets,
        max_cost_eur=sq.max_cost_eur,
        max_tier=sq.max_tier,
        require_rain_friendly=sq.require_rain_friendly,
        exclude_transit=True,
        limit=max(100, limit + offset)
        if (polygon_pts or day_bounds)
        else (limit + offset),
        w_vec=0.55 if query_vector else 0.0,
        w_fts=0.25 if sq.clean_query else 0.0,
        w_trgm=0.20 if sq.clean_query else 0.0,
        apply_mmr=True,
    )

    candidates = [
        c
        for c in candidates
        if str(c.get("category", "")).lower()
        not in ("transit", "metro", "train", "bus_stop", "tram", "subway")
        and not str(c.get("id", "")).startswith("OSM-transit-")
    ]

    if category and category.lower() != "all":
        cat_lower = category.lower().strip()
        allowed_cats = set(CATEGORY_SYNONYMS.get(cat_lower, [cat_lower]))
        candidates = [
            c for c in candidates if str(c.get("category", "")).lower() in allowed_cats
        ]

    # Compute authentic dynamic total count matching city and filters
    count_filters = [
        or_(
            AttractionModel.city.ilike(city_name),
            AttractionModel.city_id == city_id,
        ),
        func.lower(AttractionModel.category) != "transit",
        ~AttractionModel.id.like("OSM-transit-%"),
    ]
    if category and category.lower() != "all":
        cat_lower = category.lower().strip()
        allowed_cats_list = list(CATEGORY_SYNONYMS.get(cat_lower, [cat_lower]))
        count_filters.append(
            func.lower(AttractionModel.category).in_(allowed_cats_list)
        )
    if clean_query:
        count_filters.append(
            or_(
                AttractionModel.name.ilike(f"%{clean_query}%"),
                AttractionModel.description.ilike(f"%{clean_query}%"),
            )
        )
    try:
        count_stmt = (
            select(func.count()).select_from(AttractionModel).where(*count_filters)
        )
        db_total = (await session.execute(count_stmt)).scalar() or 0
    except Exception:
        db_total = 0

    results: list[PoiSearchItem] = []
    for c in candidates:
        sim_val = float(c.get("vec_sim", c.get("composite_score", 0.0)))
        results.append(_candidate_to_search_item(c, sim_val, "semantic_rag"))

    # Sort by convex hull polygon first if provided, then day territory bounds, then by similarity
    if polygon_pts:
        results.sort(
            key=lambda x: (
                1 if is_point_in_polygon(x.lat, x.lng, polygon_pts) else 0,
                1
                if (
                    day_bounds
                    and day_bounds[0] <= x.lat <= day_bounds[2]
                    and day_bounds[1] <= x.lng <= day_bounds[3]
                )
                else 0,
                x.similarity,
            ),
            reverse=True,
        )
    elif day_bounds:
        b_min_lat, b_min_lng, b_max_lat, b_max_lng = day_bounds
        results.sort(
            key=lambda x: (
                1
                if (b_min_lat <= x.lat <= b_max_lat and b_min_lng <= x.lng <= b_max_lng)
                else 0,
                x.similarity,
            ),
            reverse=True,
        )
    else:
        results.sort(key=lambda x: x.similarity, reverse=True)

    if offset > 0 or len(results) > limit:
        results = results[offset : offset + limit]

    # Check if a non-empty query retrieved no exact match
    message = None
    if not best_match or best_match_score < 0.70:
        message = f"No exact match found for '{clean_query}' in {city_name}. Showing top recommendations."

    await _enrich_items_with_photos(results, city_name)

    return PoiSearchResponse(
        city=city_name,
        query=clean_query,
        search_type="semantic_rag",
        exact_match_found=False,
        message=message,
        exact_match=None,
        results=results,
        total=max(db_total, len(results)),
    )


@router.post("/batch-photos", response_model=BatchPhotoResponse)
async def batch_resolve_photos(
    req: BatchPhotoRequest,
    session: AsyncSession = Depends(get_db),
) -> BatchPhotoResponse:
    """Resolves photos for a batch of POIs concurrently, using Redis cache and Wikimedia."""
    resolved: dict[str, PoiPhotoItem | None] = {}
    items_to_resolve: list[BatchPhotoRequestItem] = []

    for item in req.pois:
        key = item.id or item.name
        if not key:
            continue
        cached = (
            await WikimediaPhotoResolver.get_cached_photos(item.id) if item.id else None
        )
        if not cached and item.name:
            cached = await WikimediaPhotoResolver.get_cached_photos(item.name.lower())
        if cached and len(cached) > 0:
            resolved[key] = PoiPhotoItem(**cached[0])
        else:
            items_to_resolve.append(item)

    if items_to_resolve:
        ids = [it.id for it in items_to_resolve if it.id]
        attraction_map: dict[str, AttractionModel] = {}
        if ids:
            stmt = select(AttractionModel).where(AttractionModel.id.in_(ids))
            res = await session.execute(stmt)
            for att in res.scalars().all():
                attraction_map[att.id] = att

        sem = asyncio.Semaphore(6)

        async def _resolve_one(it: BatchPhotoRequestItem):
            key = it.id or it.name
            async with sem:
                try:
                    att = attraction_map.get(it.id) if it.id else None
                    tags = (
                        dict((att.metadata_field or {}).get("tags") or {})
                        if att
                        else None
                    )
                    photos, _ = await WikimediaPhotoResolver.resolve_photos(
                        poi_id=it.id or it.name.lower(),
                        name=it.name,
                        city=it.city or (att.city if att else ""),
                        wikipedia_title=att.wikipedia_title if att else None,
                        wikidata_id=att.wikidata_id if att else None,
                        osm_tags=tags,
                    )
                    if photos and len(photos) > 0:
                        resolved[key] = PoiPhotoItem(**photos[0])
                    else:
                        resolved[key] = None
                except Exception as err:
                    logger.debug(f"Failed to resolve photo for {it.name}: {err}")
                    resolved[key] = None

        await asyncio.gather(*[_resolve_one(it) for it in items_to_resolve])

    return BatchPhotoResponse(photos=resolved)


def _generate_poi_overview(
    name: str,
    category: str,
    city: str,
    neighborhood: str | None = None,
    tags: dict[str, Any] | None = None,
    cost_eur: float | None = None,
    duration_mins: int | None = None,
) -> str:
    tags = tags or {}
    cat_lower = (category or "destination").lower()

    cuisine = tags.get("cuisine")
    historic_type = tags.get("historic")
    tourism_type = tags.get("tourism")

    location_str = f" in {city}" if city else ""
    if (
        neighborhood
        and neighborhood.strip()
        and city
        and neighborhood.lower() != city.lower()
    ):
        location_str = f" in the {neighborhood} district of {city}"

    parts: list[str] = []

    if cuisine:
        cuisine_clean = cuisine.replace(";", ", ").replace("_", " ")
        parts.append(
            f"{name} is a renowned {cat_lower}{location_str}, serving authentic {cuisine_clean} specialties."
        )
    elif historic_type:
        parts.append(
            f"{name} is a historic {historic_type.replace('_', ' ')}{location_str}, offering rich cultural and architectural heritage."
        )
    elif tourism_type in ("museum", "gallery", "artwork"):
        parts.append(
            f"{name} is an acclaimed cultural {cat_lower}{location_str}, featuring curated exhibits and historical collections."
        )
    elif tourism_type == "viewpoint":
        parts.append(
            f"{name} is a premier scenic viewpoint{location_str}, offering panoramic vistas across the destination."
        )
    elif cat_lower in ("museum", "gallery"):
        parts.append(
            f"{name} is a distinguished museum{location_str}, celebrated for its exhibitions and cultural heritage."
        )
    elif cat_lower in ("restaurant", "food"):
        parts.append(
            f"{name} is a premier dining destination{location_str}, known for its local culinary experience."
        )
    elif cat_lower in ("cafe", "coffee"):
        parts.append(
            f"{name} is a popular café{location_str}, perfect for artisanal beverages, coffee, and light refreshments."
        )
    elif cat_lower in ("park", "nature", "garden"):
        parts.append(
            f"{name} is a scenic public park and green space{location_str}, ideal for relaxing walks and outdoor exploration."
        )
    elif cat_lower in ("landmark", "monument"):
        parts.append(
            f"{name} is an iconic landmark and monument{location_str}, reflecting the unique character and history of {city or 'the region'}."
        )
    elif cat_lower in ("bar", "pub"):
        parts.append(
            f"{name} is a vibrant local establishment{location_str}, offering signature drinks and an inviting atmosphere."
        )
    elif cat_lower in ("transit", "station", "bus_stop"):
        parts.append(
            f"{name} is a key transit waypoint{location_str}, connecting travelers to major routes and attractions."
        )
    else:
        parts.append(
            f"{name} is a notable {cat_lower}{location_str}, popular with visitors and locals alike."
        )

    extras: list[str] = []
    if duration_mins and duration_mins > 0:
        extras.append(f"Recommended visit duration is ~{duration_mins} minutes")
    if cost_eur is not None and cost_eur > 0:
        extras.append(f"admission is around €{cost_eur:.2f}")
    elif cost_eur == 0:
        extras.append("entry is free of charge")

    if extras:
        parts.append(f"{'. '.join(extras).capitalize()}.")

    return " ".join(parts)


@router.get("/{poi_id}", response_model=PoiDetailResponse)
async def get_poi_details(
    poi_id: str,
    name: str | None = Query(
        None, description="Optional POI name for fallback photo resolution"
    ),
    city: str | None = Query(
        None, description="Optional POI city for fallback photo resolution"
    ),
    category: str | None = Query(
        None, description="Optional POI category filter (e.g., 'transit')"
    ),
    lat: float | None = Query(
        None, description="Optional POI latitude for client coordinate preservation"
    ),
    lng: float | None = Query(
        None, description="Optional POI longitude for client coordinate preservation"
    ),
    session: AsyncSession = Depends(get_db),
) -> PoiDetailResponse:
    """Retrieves full POI details and dynamically resolves real photos from Wikimedia/Wikipedia."""
    # 0. Check if this is an explicit GTFS or transit station lookup
    is_explicit_transit = poi_id.startswith("gtfs:") or (
        category
        and category.lower()
        in ("transit", "station", "metro", "train", "tram", "bus", "subway")
    )
    if is_explicit_transit:
        from app.adapters.repositories.sql_transit_repository import (
            SQLTransitRepository,
        )
        from app.services.transit_service import TransitService

        target_city = city or ""
        station_lookup = poi_id
        if poi_id.startswith("gtfs:"):
            parts = poi_id.split(":")
            if len(parts) > 1 and not target_city:
                target_city = parts[1]
            station_lookup = parts[2] if len(parts) > 2 else poi_id
        elif name:
            station_lookup = name

        if target_city:
            transit_repo = SQLTransitRepository(session)
            transit_svc = TransitService(transit_repo)
            st_data = await transit_svc.get_station_detail(target_city, station_lookup)
            if st_data:
                lines = list(
                    dict.fromkeys(
                        line_info.get("short_name") or line_info.get("line_id")
                        for line_info in st_data.get("serving_lines", [])
                        if line_info.get("short_name") or line_info.get("line_id")
                    )
                )
                first_mode = (
                    st_data.get("serving_lines", [{}])[0].get("mode", "station")
                    if st_data.get("serving_lines")
                    else "station"
                )
                st_photos = [
                    PoiPhotoItem(**p)
                    if isinstance(p, dict)
                    else PoiPhotoItem(
                        url=p.url,
                        thumbnail_url=p.thumbnail_url,
                        caption=p.caption,
                        author=p.author,
                        license_name=p.license_name,
                        license_url=p.license_url,
                    )
                    for p in st_data.get("photos", [])
                ]
                line_colors = {
                    (line_info.get("short_name") or line_info.get("line_id")): {
                        "color": line_info.get("color"),
                        "text_color": line_info.get("text_color") or "#FFFFFF",
                    }
                    for line_info in st_data.get("serving_lines", [])
                    if (line_info.get("short_name") or line_info.get("line_id"))
                    and line_info.get("color")
                }
                return PoiDetailResponse(
                    id=f"gtfs:{target_city}:{st_data.get('id', station_lookup)}",
                    name=st_data.get("name") or station_lookup,
                    category="transit",
                    city=target_city,
                    lat=float(st_data.get("lat") or (lat or 0.0)),
                    lng=float(st_data.get("lon") or (lng or 0.0)),
                    duration_mins=15,
                    cost_eur=0.0,
                    cost_is_estimated=False,
                    cost_source=None,
                    scoring={},
                    description=st_data.get("original_name")
                    if st_data.get("original_name") != st_data.get("name")
                    else "",
                    photos=st_photos,
                    transit_info={
                        "lines": lines,
                        "line_colors": line_colors,
                        "station_type": first_mode,
                    },
                )

    stmt = select(AttractionModel).where(AttractionModel.id == poi_id)
    res = await session.execute(stmt)
    poi = res.scalar_one_or_none()

    # If not found by ID, attempt lookup by name in AttractionModel
    target_name = (
        name
        or (poi_id if not poi_id.startswith(("OSM-", "uuid-", "non-existent-")) else "")
    ).strip()

    if not poi and target_name:
        # 1. Exact case-insensitive match
        stmt = select(AttractionModel).where(
            func.lower(AttractionModel.name) == target_name.lower()
        )
        if city:
            stmt = stmt.where(AttractionModel.city.ilike(city))
        stmt = stmt.limit(1)
        res = await session.execute(stmt)
        poi = res.scalar_one_or_none()

    if not poi and target_name and city:
        from app.adapters.repositories.sql_transit_repository import (
            SQLTransitRepository,
        )
        from app.services.transit_service import TransitService

        transit_repo = SQLTransitRepository(session)
        transit_svc = TransitService(transit_repo)
        st_data = await transit_svc.get_station_detail(
            city.strip().lower(), target_name
        )
        if st_data:
            lines = list(
                dict.fromkeys(
                    line_info.get("short_name") or line_info.get("line_id")
                    for line_info in st_data.get("serving_lines", [])
                    if line_info.get("short_name") or line_info.get("line_id")
                )
            )
            first_mode = (
                st_data.get("serving_lines", [{}])[0].get("mode", "station")
                if st_data.get("serving_lines")
                else "station"
            )
            st_photos = [
                PoiPhotoItem(**p)
                if isinstance(p, dict)
                else PoiPhotoItem(
                    url=p.url,
                    thumbnail_url=p.thumbnail_url,
                    caption=p.caption,
                    author=p.author,
                    license_name=p.license_name,
                    license_url=p.license_url,
                )
                for p in st_data.get("photos", [])
            ]
            line_colors = {
                (line_info.get("short_name") or line_info.get("line_id")): {
                    "color": line_info.get("color"),
                    "text_color": line_info.get("text_color") or "#FFFFFF",
                }
                for line_info in st_data.get("serving_lines", [])
                if (line_info.get("short_name") or line_info.get("line_id"))
                and line_info.get("color")
            }
            return PoiDetailResponse(
                id=f"gtfs:{city}:{st_data.get('id', target_name)}",
                name=st_data.get("name") or target_name,
                category="transit",
                city=city,
                lat=float(st_data.get("lat") or (lat or 0.0)),
                lng=float(st_data.get("lon") or (lng or 0.0)),
                duration_mins=15,
                cost_eur=0.0,
                cost_is_estimated=False,
                cost_source=None,
                scoring={},
                description=st_data.get("original_name")
                if st_data.get("original_name") != st_data.get("name")
                else "",
                photos=st_photos,
                transit_info={
                    "lines": lines,
                    "line_colors": line_colors,
                    "station_type": first_mode,
                },
            )

    if not poi and target_name:
        # 2. Substring match
        stmt = select(AttractionModel).where(
            AttractionModel.name.ilike(f"%{target_name}%")
        )
        if city:
            stmt = stmt.where(AttractionModel.city.ilike(city))
        stmt = stmt.order_by(AttractionModel.iconicity_score.desc()).limit(1)
        res = await session.execute(stmt)
        poi = res.scalar_one_or_none()

    if not poi and target_name:
        # 3. Leading multi-word prefix match
        words = target_name.split()
        if len(words) >= 2:
            prefix = " ".join(words[:3])
            stmt = select(AttractionModel).where(
                AttractionModel.name.ilike(f"%{prefix}%")
            )
            if city:
                stmt = stmt.where(AttractionModel.city.ilike(city))
            stmt = stmt.order_by(AttractionModel.iconicity_score.desc()).limit(1)
            res = await session.execute(stmt)
            poi = res.scalar_one_or_none()

    if not poi:
        resolved_name = (
            name
            or (
                poi_id
                if not poi_id.startswith(("OSM-", "uuid-", "non-existent-"))
                and not poi_id.endswith("-999")
                else ""
            )
        ).strip()
        if resolved_name and (name or len(resolved_name) > 3):
            photos_data, lead_extract = await WikimediaPhotoResolver.resolve_photos(
                poi_id=poi_id,
                name=resolved_name,
                city=city or "",
            )
            return PoiDetailResponse(
                id=poi_id,
                name=resolved_name,
                category="attraction",
                city=city or "",
                lat=lat if lat is not None else 0.0,
                lng=lng if lng is not None else 0.0,
                duration_mins=60,
                cost_eur=0.0,
                cost_is_estimated=True,
                cost_source=None,
                scoring={},
                description=lead_extract
                or _generate_poi_overview(
                    name=resolved_name,
                    category="attraction",
                    city=city or "",
                    cost_eur=0.0,
                    duration_mins=60,
                ),
                photos=[PoiPhotoItem(**p) for p in photos_data],
            )
        raise HTTPException(status_code=404, detail=f"POI with id '{poi_id}' not found")

    lat, lng = _extract_coords(poi.location)
    meta = dict(poi.metadata_field or {})
    tags = dict(meta.get("tags") or {})
    scoring_dict = dict(poi.scoring or {})
    if float(scoring_dict.get("rating", 0)) <= 0:
        try:
            from app.services.google_maps_rating_resolver import (
                GoogleMapsRatingResolver,
            )

            resolved_rating = await GoogleMapsRatingResolver.resolve_rating(
                poi_id=poi.id,
                name=poi.name,
                city=poi.city,
                lat=lat,
                lng=lng,
                session=session,
            )
            if resolved_rating:
                scoring_dict = resolved_rating
        except Exception as r_err:
            logger.debug(f"Live rating resolution failed for {poi.id}: {r_err}")

    if not poi.wikidata_id and tags.get("wikidata"):
        poi.wikidata_id = str(tags["wikidata"]).strip().upper()
    if not poi.wikipedia_title and tags.get("wikipedia"):
        poi.wikipedia_title = tags["wikipedia"]

    photos_data, lead_extract = await WikimediaPhotoResolver.resolve_photos(
        poi_id=poi.id,
        name=poi.name,
        city=poi.city,
        wikipedia_title=poi.wikipedia_title,
        wikidata_id=poi.wikidata_id,
        osm_tags=tags,
    )

    osm_desc = (
        tags.get("description")
        or tags.get("description:en")
        or tags.get("description:es")
    )
    description = poi.description or lead_extract or osm_desc or meta.get("description")
    if not description:
        description = _generate_poi_overview(
            name=poi.name,
            category=poi.category,
            city=poi.city,
            neighborhood=poi.neighborhood,
            tags=tags,
            cost_eur=float(poi.cost_eur or 0.0),
            duration_mins=int(poi.duration_mins or 60),
        )

    description_source = poi.description_source or (
        "wikipedia" if lead_extract else "osm" if osm_desc else "paladio_engine"
    )

    # Persist resolved description to PostgreSQL if it was missing
    if (
        (description and not poi.description)
        or tags.get("wikidata")
        or tags.get("wikipedia")
    ):
        try:
            if description and not poi.description:
                poi.description = description
                poi.description_source = description_source
            await session.commit()
        except Exception as e:
            logger.debug(f"Failed to persist description for poi {poi.id}: {e}")

    res = PoiDetailResponse(
        id=poi.id,
        name=poi.name,
        category=poi.category,
        city=poi.city,
        lat=lat,
        lng=lng,
        duration_mins=poi.duration_mins or 60,
        cost_eur=float(poi.cost_eur or 0.0),
        cost_is_estimated=bool(poi.cost_is_estimated),
        cost_source=poi.cost_source,
        scoring=scoring_dict,
        description=description,
        description_source=description_source,
        wikipedia_title=poi.wikipedia_title,
        wikidata_id=poi.wikidata_id,
        website=poi.website or tags.get("website") or tags.get("contact:website"),
        neighborhood=poi.neighborhood,
        doc_quality=getattr(poi, "doc_quality", "C") or "C",
        hours_known=bool(getattr(poi, "hours_known", False)),
        osm_opening_hours=poi.osm_opening_hours,
        daily_windows=list(getattr(poi, "daily_windows", []) or []),
        photos=[PoiPhotoItem(**p) for p in photos_data],
        transit_info=_extract_transit_info(poi, meta),
    )

    # Dynamic fallback: if daily_windows is unpopulated or empty, parse osm_opening_hours or tags
    raw_hours_str = poi.osm_opening_hours or tags.get("opening_hours")
    has_windows = (
        any(bool(w) for w in res.daily_windows) if res.daily_windows else False
    )
    if not has_windows and raw_hours_str:
        parsed_sched = parse_osm_opening_hours(str(raw_hours_str))
        if parsed_sched.hours_known and any(
            bool(w) for w in parsed_sched.daily_windows
        ):
            res.daily_windows = parsed_sched.daily_windows
            res.hours_known = True
            res.osm_opening_hours = raw_hours_str

    return res
