"""POI Search and Retrieval API (Phase 4).

Powered by HybridRetriever:
- Single-roundtrip SQL CTE combining Dense Vector + Full-Text Search + Trigram RRF
- Composite reranking (RRF + Iconicity + Facet Match + Doc Quality Bonus)
- Spatial-Semantic MMR diversification
- Exposes description, neighborhood, facets, doc_quality, and hours_known
"""

import asyncio
from difflib import SequenceMatcher
import json
import logging
import math
import re
import unicodedata
import uuid
from typing import Any

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.api.deps import get_optional_user
from app.db.models import (
    AttractionModel,
    CityModel,
    TripCollectionItemModel,
    TripModel,
    UserModel,
)
from app.db.session import get_db
from app.engine.retrieval.hybrid_retriever import (
    HybridRetriever,
    compute_info_richness_score,
)
from app.engine.retrieval.query_rewriter import QueryRewriter
from app.infrastructure.providers.onnx_embedding_provider import (
    OnnxEmbeddingProvider,
)
from app.services.wikimedia_photo_resolver import (
    WikimediaPhotoResolver,
    effective_poi_cache_key,
    is_generic_placeholder_poi,
)
from app.utils.opening_hours_parser import parse_osm_opening_hours
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import Float, and_, case, cast, delete, func, or_, select
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
    city_total_pois: int = 0
    is_hydrating: bool = False


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
    description_lang: str | None = None
    description_source: str | None = None
    wikipedia_title: str | None = None
    wikidata_id: str | None = None
    website: str | None = None
    phone: str | None = None
    address: str | None = None
    email: str | None = None
    wheelchair_accessible: bool | None = None
    reservation_required: bool | None = None
    cuisine: str | None = None
    amenities: list[str] = Field(default_factory=list)
    neighborhood: str | None = None
    doc_quality: str = "C"
    hours_known: bool = False
    osm_opening_hours: str | None = None
    daily_windows: list[Any] = Field(default_factory=list)
    photos: list[PoiPhotoItem] = Field(default_factory=list)
    transit_info: dict[str, Any] | None = None


class DailyHoursInput(BaseModel):
    is_open: bool = True
    open_time: str | None = None
    close_time: str | None = None


class PoiPhotoInput(BaseModel):
    url: str
    thumbnail_url: str | None = None
    caption: str | None = None


class PoiCreateRequest(BaseModel):
    name: str
    city: str
    country: str | None = None
    category: str = "attraction"
    lat: float
    lng: float
    duration_mins: int = 60
    cost_eur: float = 0.0
    description: str | None = None
    website: str | None = None
    phone: str | None = None
    address: str | None = None
    neighborhood: str | None = None
    email: str | None = None
    wheelchair_accessible: bool | None = None
    reservation_required: bool | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    weekly_hours: list[DailyHoursInput] | None = None
    photos: list[PoiPhotoInput] | None = None
    rating: float | None = None


class DuplicatePoiCandidate(BaseModel):
    id: str
    name: str
    category: str
    city: str
    lat: float
    lng: float
    neighborhood: str | None = None
    rating: float | None = None
    distance_meters: float | None = None
    match_reason: str


class PoiDuplicateCheckResponse(BaseModel):
    has_duplicates: bool
    candidates: list[DuplicatePoiCandidate] = Field(default_factory=list)


class PoiUpdateRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    duration_mins: int | None = None
    cost_eur: float | None = None
    description: str | None = None
    website: str | None = None
    phone: str | None = None
    lat: float | None = None
    lng: float | None = None
    photo_url: str | None = None
    photos: list[PoiPhotoInput] | None = None


def _extract_poi_attributes(
    poi: AttractionModel,
    meta: dict[str, Any],
    tags: dict[str, Any],
) -> dict[str, Any]:
    """Derives contact info, structured address, cuisine, and amenity keys from OSM tags and metadata."""
    raw_phone = (
        meta.get("phone")
        or tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("contact:mobile")
        or tags.get("telephone")
        or (meta.get("wikidata_claims") or {}).get("phone")
    )
    phone = str(raw_phone).strip() if raw_phone and str(raw_phone).strip() else None

    raw_email = meta.get("email") or tags.get("email") or tags.get("contact:email")
    email = str(raw_email).strip() if raw_email and str(raw_email).strip() else None

    address = meta.get("address") or tags.get("addr:full")
    if not address:
        street = str(tags.get("addr:street") or "").strip()
        housenumber = str(tags.get("addr:housenumber") or "").strip()
        if street:
            street_part = f"{street} {housenumber}".strip() if housenumber else street
            postcode = str(tags.get("addr:postcode") or "").strip()
            city_part = str(tags.get("addr:city") or "").strip()
            locality = " ".join(p for p in (postcode, city_part) if p)
            address = f"{street_part}, {locality}" if locality else street_part
        else:
            address = poi.neighborhood

    wheelchair_tag = str(tags.get("wheelchair") or "").strip().lower()
    wheelchair_accessible = meta.get("wheelchair_accessible")
    if wheelchair_accessible is None and wheelchair_tag:
        if wheelchair_tag in ("yes", "designated", "limited"):
            wheelchair_accessible = True
        elif wheelchair_tag == "no":
            wheelchair_accessible = False

    reservation_tag = str(tags.get("reservation") or "").strip().lower()
    reservation_required = meta.get("reservation_required")
    if reservation_required is None and reservation_tag:
        if reservation_tag in ("yes", "required", "recommended"):
            reservation_required = True
        elif reservation_tag == "no":
            reservation_required = False

    raw_cuisine = meta.get("cuisine") or tags.get("cuisine")
    cuisine: str | None = None
    if raw_cuisine and str(raw_cuisine).strip():
        parts = [
            p.strip().replace("_", " ").title()
            for p in re.split(r"[;,]", str(raw_cuisine))
            if p.strip()
        ]
        if parts:
            cuisine = ", ".join(parts[:3])

    amenities: list[str] = []
    internet_tag = str(tags.get("internet_access") or "").strip().lower()
    wifi_tag = str(tags.get("wifi") or "").strip().lower()
    if internet_tag in ("wlan", "yes", "free") or wifi_tag in ("yes", "free"):
        amenities.append("wifi")
    if wheelchair_accessible is True:
        amenities.append("wheelchair")
    if str(tags.get("outdoor_seating") or "").strip().lower() in (
        "yes",
        "terrace",
        "garden",
        "patio",
        "street",
    ):
        amenities.append("outdoor_seating")
    if str(tags.get("takeaway") or "").strip().lower() in ("yes", "only"):
        amenities.append("takeaway")
    if str(tags.get("delivery") or "").strip().lower() == "yes":
        amenities.append("delivery")
    if reservation_required is True:
        amenities.append("reservation")
    if str(tags.get("air_conditioning") or "").strip().lower() == "yes":
        amenities.append("air_conditioning")
    if (
        str(tags.get("toilets") or "").strip().lower() == "yes"
        or str(tags.get("toilets:wheelchair") or "").strip().lower() == "yes"
    ):
        amenities.append("toilets")
    if any(
        str(tags.get(k) or "").strip().lower() == "yes"
        for k in (
            "payment:credit_cards",
            "payment:cards",
            "payment:debit_cards",
            "payment:contactless",
        )
    ):
        amenities.append("cards")
    if str(tags.get("diet:vegetarian") or "").strip().lower() in ("yes", "only"):
        amenities.append("vegetarian")
    if str(tags.get("diet:vegan") or "").strip().lower() in ("yes", "only"):
        amenities.append("vegan")
    if (
        str(tags.get("dog") or "").strip().lower() == "yes"
        or str(tags.get("pets") or "").strip().lower() == "yes"
    ):
        amenities.append("pets")
    parking_tag = str(tags.get("parking") or "").strip().lower()
    if parking_tag and parking_tag != "no":
        amenities.append("parking")
    if str(tags.get("smoking") or "").strip().lower() == "no":
        amenities.append("non_smoking")
    if bool(
        tags.get("heritage")
        or tags.get("historic")
        or tags.get("unesco")
        or (meta.get("wikidata_claims") or {}).get("unesco")
    ):
        amenities.append("heritage")
    if str(tags.get("fee") or "").strip().lower() == "no":
        amenities.append("free_entry")

    return {
        "phone": phone,
        "email": email,
        "address": address,
        "wheelchair_accessible": wheelchair_accessible,
        "reservation_required": reservation_required,
        "cuisine": cuisine,
        "amenities": amenities,
    }


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
    clean_sim = (
        0.0
        if (sim is None or (isinstance(sim, float) and math.isnan(sim)))
        else round(float(sim), 3)
    )
    return PoiSearchItem(
        id=str(c.get("id")),
        name=str(c.get("name")),
        category=str(c.get("category", "attraction")),
        lat=lat,
        lng=lng,
        duration_mins=int(c.get("duration_mins") or 60),
        cost_eur=float(c.get("cost_eur") or 0.0),
        similarity=clean_sim,
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
    "monument": [
        "monument",
        "landmark",
        "historic",
        "attraction",
        "sight",
        "viewpoint",
        "artwork",
    ],
    "landmark": [
        "monument",
        "landmark",
        "historic",
        "attraction",
        "sight",
        "viewpoint",
        "artwork",
    ],
    "museum": ["museum", "gallery", "exhibition", "arts_centre"],
    "cafe": ["cafe", "coffee", "bakery", "pastry"],
    "restaurant": ["restaurant", "bistro", "food", "dining"],
    "attraction": [
        "attraction",
        "sight",
        "theme_park",
        "monument",
        "landmark",
        "viewpoint",
        "historic",
        "entertainment",
        "artwork",
    ],
    "entertainment": [
        "entertainment",
        "theatre",
        "cinema",
        "music_venue",
        "attraction",
    ],
    "bar": ["bar", "pub", "nightlife", "nightclub"],
    "park": ["park", "garden", "nature", "nature_reserve"],
    "shopping": ["shop", "shopping", "market", "store", "mall"],
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


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two points in meters using Haversine formula."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return 6371000.0 * c


def _sql_info_richness_expr():
    """SQL expression mirroring compute_info_richness_score in [0.0, 1.0] for AttractionModel."""
    doc_expr = case(
        (func.upper(func.coalesce(AttractionModel.doc_quality, "C")) == "A", 1.0),
        (func.upper(func.coalesce(AttractionModel.doc_quality, "C")) == "B", 0.6),
        else_=0.0,
    )
    desc_len = func.length(func.trim(func.coalesce(AttractionModel.description, "")))
    desc_expr = case(
        (desc_len >= 80, 1.0),
        (desc_len > 0, 0.5),
        else_=0.0,
    )
    neighborhood_expr = case(
        (
            func.length(func.trim(func.coalesce(AttractionModel.neighborhood, ""))) > 0,
            1.0,
        ),
        else_=0.0,
    )
    hours_expr = case(
        (
            or_(
                AttractionModel.hours_known.is_(True),
                func.length(
                    func.trim(func.coalesce(AttractionModel.osm_opening_hours, ""))
                )
                > 0,
            ),
            1.0,
        ),
        else_=0.0,
    )
    has_links_expr = or_(
        func.length(func.trim(func.coalesce(AttractionModel.website, ""))) > 0,
        func.length(func.trim(func.coalesce(AttractionModel.wikidata_id, ""))) > 0,
        func.length(func.trim(func.coalesce(AttractionModel.wikipedia_title, ""))) > 0,
    )
    extra_expr = case((has_links_expr, 1.0), else_=0.0)
    return (
        0.45 * doc_expr
        + 0.25 * desc_expr
        + 0.10 * neighborhood_expr
        + 0.10 * hours_expr
        + 0.10 * extra_expr
    )


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
        doc_quality=getattr(p, "doc_quality", None) or meta.get("doc_quality") or "C",
        hours_known=bool(getattr(p, "hours_known", False) or p.osm_opening_hours),
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
    circle_lat: float | None = Query(
        None, description="Center latitude for radial circle search"
    ),
    circle_lng: float | None = Query(
        None, description="Center longitude for radial circle search"
    ),
    circle_radius: float | None = Query(
        None, description="Radius in meters for radial circle search"
    ),
    limit: int = Query(15, ge=1, le=200, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    custom_only: bool = Query(
        False, description="Filter to only user-created custom POIs"
    ),
    session: AsyncSession = Depends(get_db),
    current_user: UserModel | None = Depends(get_optional_user),
):
    # Normalize parameter values when called programmatically (where Query/Depends objects remain default)
    if hasattr(current_user, "dependency") or not isinstance(current_user, UserModel):
        current_user = None

    if hasattr(custom_only, "default"):
        custom_only = bool(custom_only.default)
    else:
        custom_only = bool(custom_only)

    if hasattr(category, "default"):
        category = category.default if category.default is not ... else None

    if hasattr(query, "default"):
        query = str(query.default) if query.default is not ... else ""
    clean_query = (query or "").strip()

    if hasattr(trip_id, "default"):
        trip_id = trip_id.default if trip_id.default is not ... else None

    if hasattr(day, "default"):
        day = day.default if day.default is not ... else None

    if hasattr(bounds, "default"):
        bounds = bounds.default if bounds.default is not ... else None

    if hasattr(polygon, "default"):
        polygon = polygon.default if polygon.default is not ... else None

    if hasattr(circle_lat, "default"):
        circle_lat = (
            float(circle_lat.default)
            if circle_lat.default is not ... and circle_lat.default is not None
            else None
        )
    elif circle_lat is not None:
        try:
            circle_lat = float(circle_lat)
        except (ValueError, TypeError):
            circle_lat = None

    if hasattr(circle_lng, "default"):
        circle_lng = (
            float(circle_lng.default)
            if circle_lng.default is not ... and circle_lng.default is not None
            else None
        )
    elif circle_lng is not None:
        try:
            circle_lng = float(circle_lng)
        except (ValueError, TypeError):
            circle_lng = None

    if hasattr(circle_radius, "default"):
        circle_radius = (
            float(circle_radius.default)
            if circle_radius.default is not ... and circle_radius.default is not None
            else None
        )
    elif circle_radius is not None:
        try:
            circle_radius = float(circle_radius)
        except (ValueError, TypeError):
            circle_radius = None

    if hasattr(limit, "default"):
        limit = int(limit.default) if limit.default is not ... else 15

    if hasattr(offset, "default"):
        offset = int(offset.default) if offset.default is not ... else 0

    # 1. Resolve city
    city_repo = SqlCityRepository(session)
    city_obj = await city_repo.find_by_name_or_alias(city)
    city_name = city_obj.name if city_obj else city.strip()
    city_id = city_obj.id if city_obj else f"{city.strip().lower()}_es"
    city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())

    # Check total real attractions count for this city in the database
    city_count_stmt = (
        select(func.count())
        .select_from(AttractionModel)
        .where(
            or_(
                func.lower(AttractionModel.city) == city_clean,
                AttractionModel.city_id == city_id,
                AttractionModel.city_id == city_clean,
                AttractionModel.city_id.startswith(f"{city_clean}_"),
                AttractionModel.city.ilike(city_name),
            )
        )
        .where(~AttractionModel.id.like("custom-%"))
        .where(~AttractionModel.id.like("OSM-transit-%"))
    )
    city_total_pois = (await session.execute(city_count_stmt)).scalar() or 0

    # Check if city hydration is currently active
    is_hydrating = False
    try:
        import os
        import redis

        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        if city_total_pois == 0:
            is_hydrating = bool(
                r.exists(f"paladio:lock:hydrate_city:{city_clean}")
                or r.get(f"paladio:city_hydration_active:{city_clean}")
            )
        else:
            is_hydrating = bool(r.exists(f"paladio:lock:hydrate_city:{city_clean}"))
    except Exception:
        pass

    def _make_search_response(**kwargs) -> PoiSearchResponse:
        kwargs.setdefault("city_total_pois", city_total_pois)
        kwargs.setdefault("is_hydrating", is_hydrating)
        return PoiSearchResponse(**kwargs)

    # Resolve radial circle parameters
    has_circle = (
        circle_lat is not None
        and circle_lng is not None
        and circle_radius is not None
        and circle_radius > 0
    )
    circle_bounds: tuple[float, float, float, float] | None = None
    circle_clause = None
    if has_circle:
        d_lat = circle_radius / 111320.0
        d_lng = circle_radius / (
            111320.0 * max(0.0001, math.cos(math.radians(circle_lat)))
        )
        circle_bounds = (
            circle_lat - d_lat,
            circle_lng - d_lng,
            circle_lat + d_lat,
            circle_lng + d_lng,
        )
        circle_clause = and_(
            cast(AttractionModel.location["latitude"].astext, Float).between(
                circle_bounds[0], circle_bounds[2]
            ),
            cast(AttractionModel.location["longitude"].astext, Float).between(
                circle_bounds[1], circle_bounds[3]
            ),
        )

    # Fast-path for user-created custom POIs
    if custom_only:
        custom_query = (
            select(AttractionModel)
            .where(
                or_(
                    AttractionModel.city.ilike(city_name),
                    AttractionModel.city_id == city_id,
                )
            )
            .where(
                or_(
                    AttractionModel.id.like("custom-%"),
                    AttractionModel.cost_source == "user",
                    AttractionModel.metadata_field["source"].astext == "user_created",
                )
            )
        )
        if circle_clause is not None:
            custom_query = custom_query.where(circle_clause)
        if clean_query:
            custom_query = custom_query.where(
                AttractionModel.name.ilike(f"%{clean_query}%")
            )
        if category and category.lower() != "all":
            custom_query = custom_query.where(
                func.lower(AttractionModel.category) == category.lower().strip()
            )
        fetch_limit = max(100, limit + offset) if has_circle else limit
        fetch_offset = 0 if has_circle else offset
        custom_query = (
            custom_query.order_by(AttractionModel.id.desc())
            .limit(fetch_limit)
            .offset(fetch_offset)
        )
        res = await session.execute(custom_query)
        custom_pois = res.scalars().all()
        results = [
            _model_to_search_item(p, match_type="custom", similarity=1.0)
            for p in custom_pois
        ]
        if has_circle:
            results = [
                r
                for r in results
                if haversine_distance_m(circle_lat, circle_lng, r.lat, r.lng)
                <= circle_radius
            ]
            results = results[offset : offset + limit]
        return _make_search_response(
            city=city_name,
            query=clean_query,
            search_type="custom",
            exact_match_found=bool(results),
            exact_match=results[0] if results else None,
            results=results,
            total=len(results),
        )

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

    if circle_bounds and not bounds:
        day_bounds = circle_bounds

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
                return _make_search_response(
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
            if circle_clause is not None:
                count_stmt = count_stmt.where(circle_clause)
            total_count = (await session.execute(count_stmt)).scalar() or 0

            order_clauses = []
            if in_day_clause is not None:
                order_clauses.append(case((in_day_clause, 1), else_=0).desc())
            order_clauses.append(AttractionModel.tier.asc())

            richness_expr = _sql_info_richness_expr()

            if user_embedding is not None:
                cos_dist = AttractionModel.embedding.cosine_distance(user_embedding)
                sim_expr = (1.0 - func.coalesce(cos_dist, 1.0)).label("sim")
                comp_quality = (
                    func.coalesce(AttractionModel.iconicity_score, 0.0) * 0.65
                    + (1.0 - func.coalesce(cos_dist, 1.0)) * 0.27
                    + richness_expr * 0.08
                )
                order_clauses.append(comp_quality.desc())

                fetch_limit = (
                    max(100, limit + offset) if (polygon_pts or has_circle) else limit
                )
                fetch_offset = 0 if (polygon_pts or has_circle) else offset
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
                )
                if circle_clause is not None:
                    stmt = stmt.where(circle_clause)
                stmt = (
                    stmt.order_by(*order_clauses)
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
                comp_browse = (
                    func.coalesce(AttractionModel.iconicity_score, 0.0) * 0.92
                    + richness_expr * 0.08
                )
                order_clauses.append(comp_browse.desc())
                fetch_limit = (
                    max(100, limit + offset) if (polygon_pts or has_circle) else limit
                )
                fetch_offset = 0 if (polygon_pts or has_circle) else offset
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
                )
                if circle_clause is not None:
                    stmt = stmt.where(circle_clause)
                stmt = (
                    stmt.order_by(*order_clauses)
                    .offset(fetch_offset)
                    .limit(fetch_limit)
                )
                db_pois = (await session.execute(stmt)).scalars().all()
                results = [_model_to_search_item(p, "category_browse") for p in db_pois]

            if has_circle:
                results = [
                    r
                    for r in results
                    if haversine_distance_m(circle_lat, circle_lng, r.lat, r.lng)
                    <= circle_radius
                ]
                total_count = len(results)
                results = results[offset : offset + limit]
            elif polygon_pts:
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
                        compute_info_richness_score(x),
                    ),
                    reverse=True,
                )
                results = results[offset : offset + limit]

            await _enrich_items_with_photos(results, city_name)
            return _make_search_response(
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
            if circle_clause is not None:
                count_stmt = count_stmt.where(circle_clause)
            total_count = (await session.execute(count_stmt)).scalar() or 0

            order_clauses = []
            if in_day_clause is not None:
                order_clauses.append(case((in_day_clause, 1), else_=0).desc())
            order_clauses.append(AttractionModel.tier.asc())

            fetch_limit = max(100, limit + offset) if has_circle else limit
            fetch_offset = 0 if has_circle else offset

            richness_expr = _sql_info_richness_expr()

            if user_embedding is not None:
                cos_dist = AttractionModel.embedding.cosine_distance(user_embedding)
                sim_expr = (1.0 - func.coalesce(cos_dist, 1.0)).label("sim")
                comp_quality = (
                    func.coalesce(AttractionModel.iconicity_score, 0.0) * 0.65
                    + (1.0 - func.coalesce(cos_dist, 1.0)) * 0.27
                    + richness_expr * 0.08
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
                )
                if circle_clause is not None:
                    stmt = stmt.where(circle_clause)
                stmt = (
                    stmt.order_by(*order_clauses)
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
                if has_circle:
                    results = [
                        r
                        for r in results
                        if haversine_distance_m(circle_lat, circle_lng, r.lat, r.lng)
                        <= circle_radius
                    ]
                    total_count = len(results)
                    results = results[offset : offset + limit]
                await _enrich_items_with_photos(results, city_name)
                return _make_search_response(
                    city=city_name,
                    query="",
                    search_type="taste_recommendation",
                    exact_match_found=bool(results),
                    exact_match=None,
                    results=results,
                    total=total_count,
                )
            else:
                comp_browse = (
                    func.coalesce(AttractionModel.iconicity_score, 0.0) * 0.92
                    + richness_expr * 0.08
                )
                order_clauses.append(comp_browse.desc())
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
                )
                if circle_clause is not None:
                    stmt = stmt.where(circle_clause)
                stmt = (
                    stmt.order_by(*order_clauses)
                    .offset(fetch_offset)
                    .limit(fetch_limit)
                )
                db_pois = (await session.execute(stmt)).scalars().all()
                results = [_model_to_search_item(p, "recommendations") for p in db_pois]
                if has_circle:
                    results = [
                        r
                        for r in results
                        if haversine_distance_m(circle_lat, circle_lng, r.lat, r.lng)
                        <= circle_radius
                    ]
                    total_count = len(results)
                    results = results[offset : offset + limit]
                await _enrich_items_with_photos(results, city_name)
                return _make_search_response(
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
                    return _make_search_response(
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
                if not a_name:
                    dest_iata = (itin.get("travel_constraints") or {}).get(
                        "destination_iata"
                    ) or itin.get("destination_iata")
                    if dest_iata:
                        try:
                            from app.services.airport_service import get_airport_service

                            ap_info = get_airport_service().get_airport(str(dest_iata))
                            if ap_info:
                                a_name = f"{ap_info.name} ({ap_info.iata_code})"
                                a_lat = float(ap_info.latitude)
                                a_lng = float(ap_info.longitude)
                        except Exception:
                            pass
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
                    return _make_search_response(
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
            match_results = []
            for m in db_matches:
                m_loc = m.location or {}
                m_lat = float(m_loc.get("latitude") or 0.0)
                m_lng = float(m_loc.get("longitude") or 0.0)
                match_results.append(
                    PoiSearchItem(
                        id=str(m.id),
                        name=m.name,
                        category="HOTEL" if is_hotel_query else "AIRPORT",
                        lat=m_lat,
                        lng=m_lng,
                        duration_mins=30 if is_hotel_query else 60,
                        cost_eur=0.0,
                        similarity=1.0,
                        match_type="exact_name",
                        description=f"{'Hotel' if is_hotel_query else 'Airport'} in {city_name}",
                    )
                )
            return _make_search_response(
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

            # Weighted rank score: iconicity is a really important factor (40%) alongside base lexical match (45%) and tier authority (15%), plus a slight info richness tie-breaker
            richness = compute_info_richness_score(cand)
            rank_score = (
                base_score * 0.45 + iconicity * 0.40 + tier_bonus + richness * 0.05
            )

            if rank_score > best_match_score:
                best_match_score = rank_score
                best_match = cand
                best_match_type = mtype

    # 3. Decision: Exact / Fuzzy match branch
    if best_match and best_match_score >= 0.60:
        b_loc = best_match.get("location") or {}
        b_lat = float(best_match.get("lat") or b_loc.get("latitude") or 0.0)
        b_lng = float(best_match.get("lng") or b_loc.get("longitude") or 0.0)
        if (
            has_circle
            and haversine_distance_m(circle_lat, circle_lng, b_lat, b_lng)
            > circle_radius
        ):
            best_match = None
            best_match_score = 0.0
        else:
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
                        logger.debug(
                            "Failed parsing embedding JSON string: %s", parse_err
                        )
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
                        apply_mmr=False,
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

            if not similar_items:
                for cand in lexical_candidates:
                    if str(cand.get("id")) != str(best_match.get("id")):
                        similar_items.append(
                            _candidate_to_search_item(
                                cand,
                                float(cand.get("trgm_sim") or 0.5),
                                "fuzzy_name",
                            )
                        )
                    if len(similar_items) >= limit:
                        break

            if has_circle:
                similar_items = [
                    s
                    for s in similar_items
                    if haversine_distance_m(circle_lat, circle_lng, s.lat, s.lng)
                    <= circle_radius
                ]

            return _make_search_response(
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
    embedding_provider = OnnxEmbeddingProvider()
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
        if (polygon_pts or day_bounds or has_circle)
        else (limit + offset),
        w_vec=0.55 if query_vector else 0.0,
        w_fts=0.25 if sq.clean_query else 0.0,
        w_trgm=0.20 if sq.clean_query else 0.0,
        w_cat=0.35 if sq.target_categories else 0.0,
        target_categories=sq.target_categories,
        lexical_keywords=sq.lexical_keywords,
        fallback_to_top=True,
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

    if has_circle:
        candidates = [
            c
            for c in candidates
            if haversine_distance_m(
                circle_lat,
                circle_lng,
                float((c.get("location") or {}).get("latitude") or c.get("lat") or 0.0),
                float(
                    (c.get("location") or {}).get("longitude") or c.get("lng") or 0.0
                ),
            )
            <= circle_radius
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
    if circle_clause is not None:
        count_filters.append(circle_clause)
    if category and category.lower() != "all":
        cat_lower = category.lower().strip()
        allowed_cats_list = list(CATEGORY_SYNONYMS.get(cat_lower, [cat_lower]))
        count_filters.append(
            func.lower(AttractionModel.category).in_(allowed_cats_list)
        )
    if clean_query:
        text_or_clauses = [
            AttractionModel.name.ilike(f"%{clean_query}%"),
            AttractionModel.description.ilike(f"%{clean_query}%"),
        ]
        if sq.target_categories:
            text_or_clauses.append(
                func.lower(AttractionModel.category).in_(sq.target_categories)
            )
        for kw in (sq.lexical_keywords or [])[:5]:
            text_or_clauses.append(AttractionModel.name.ilike(f"%{kw}%"))
        count_filters.append(or_(*text_or_clauses))
    try:
        count_stmt = (
            select(func.count()).select_from(AttractionModel).where(*count_filters)
        )
        db_total = (await session.execute(count_stmt)).scalar() or 0
    except Exception:
        db_total = 0

    target_cats_set = {c.lower() for c in (sq.target_categories or [])}
    results: list[PoiSearchItem] = []
    for c in candidates:
        raw_sim = c.get("vec_sim")
        richness = compute_info_richness_score(c)
        has_valid_vec_sim = (
            raw_sim is not None
            and not (isinstance(raw_sim, float) and math.isnan(raw_sim))
            and float(raw_sim) > 0.0
        )
        if has_valid_vec_sim:
            if target_cats_set:
                cat_match = (
                    1.0
                    if str(c.get("category") or "").lower() in target_cats_set
                    else 0.0
                )
                sim_val = 0.45 * float(raw_sim) + 0.45 * cat_match + 0.10 * richness
            else:
                sim_val = float(raw_sim) * 0.94 + richness * 0.06
        else:
            raw_comp = c.get("composite_score")
            sim_val = (
                float(raw_comp)
                if raw_comp is not None
                and not (isinstance(raw_comp, float) and math.isnan(raw_comp))
                else 0.0
            )
        results.append(_candidate_to_search_item(c, sim_val, "semantic_rag"))

    if has_circle:
        results = [
            r
            for r in results
            if haversine_distance_m(circle_lat, circle_lng, r.lat, r.lng)
            <= circle_radius
        ]
        db_total = len(results)

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
    elif day_bounds and not has_circle:
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

    return _make_search_response(
        city=city_name,
        query=clean_query,
        search_type="semantic_rag",
        exact_match_found=False,
        message=message,
        exact_match=None,
        results=results,
        total=max(db_total, len(results)),
    )


@router.post("/city/{city}/download")
@router.post("/{city}/download")
async def download_city_pois(
    city: str,
    session: AsyncSession = Depends(get_db),
):
    """
    Triggers asynchronous POI download and hydration for the specified city.
    """
    city_clean = re.sub(r"[^a-z0-9_-]", "", city.strip().lower())
    if not city_clean:
        raise HTTPException(status_code=400, detail="Invalid city name provided")

    task_id = "initiated"
    try:
        from app.tasks import hydrate_city_pipeline_task

        task = hydrate_city_pipeline_task.delay(city_name=city.strip(), force=True)
        task_id = task.id
    except Exception as e:
        logger.warning(
            f"Could not queue Celery hydration task for {city}: {e}. Running in-process fallback."
        )
        import asyncio
        from app.tasks import (
            _run_enrich_long_tail_city_pois,
            _run_enrich_tier12_city_pois,
            _run_ingest_city_pois,
        )

        async def _run_full_hydration_in_process(
            target_city: str, force_ingest: bool = True
        ) -> None:
            s1 = await _run_ingest_city_pois(target_city, force=force_ingest)
            cid = s1.get("city_id") if isinstance(s1, dict) else None
            await _run_enrich_tier12_city_pois(target_city, city_id=cid)
            await _run_enrich_long_tail_city_pois(target_city, city_id=cid)

        asyncio.create_task(_run_full_hydration_in_process(city.strip(), True))
        task_id = "in_process"

    # Set active hydration flag in Redis
    try:
        import os
        import redis

        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        r.set(f"paladio:city_hydration_active:{city_clean}", "1", ex=1800)
    except Exception:
        pass

    return {
        "status": "initiated",
        "city": city.strip(),
        "task_id": task_id,
        "message": f"POI database download initiated for {city.strip()}.",
    }


@router.get("/city/{city}/status")
async def get_city_pois_status(
    city: str,
    session: AsyncSession = Depends(get_db),
):
    """
    Checks the status and total POIs count for a city database.
    """
    city_clean = re.sub(r"[^a-z0-9_-]", "", city.strip().lower())
    stmt = (
        select(func.count())
        .select_from(AttractionModel)
        .where(
            or_(
                func.lower(AttractionModel.city) == city_clean,
                AttractionModel.city_id == city_clean,
                AttractionModel.city_id.startswith(f"{city_clean}_"),
                AttractionModel.city.ilike(city.strip()),
            )
        )
        .where(~AttractionModel.id.like("custom-%"))
        .where(~AttractionModel.id.like("OSM-transit-%"))
    )
    count = (await session.execute(stmt)).scalar() or 0

    is_hydrating = False
    try:
        import os
        import redis

        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url)
        if count == 0:
            is_hydrating = bool(
                r.exists(f"paladio:lock:hydrate_city:{city_clean}")
                or r.get(f"paladio:city_hydration_active:{city_clean}")
            )
        else:
            is_hydrating = bool(r.exists(f"paladio:lock:hydrate_city:{city_clean}"))
    except Exception:
        pass

    return {
        "city": city.strip(),
        "poi_count": count,
        "is_hydrating": is_hydrating,
    }


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
        if is_generic_placeholder_poi(item.name, item.id):
            resolved[key] = None
            continue
        cache_id = (
            effective_poi_cache_key(item.id, item.name or "", item.city or "")
            if item.id
            else None
        )
        cached = (
            await WikimediaPhotoResolver.get_cached_photos(cache_id)
            if cache_id
            else None
        )
        if not cached and item.name and cache_id == item.id:
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
                    custom_photos = (
                        (att.metadata_field or {}).get("photos") if att else None
                    )
                    if isinstance(custom_photos, list) and len(custom_photos) > 0:
                        resolved[key] = PoiPhotoItem(**custom_photos[0])
                        return
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
    target_lang: str = "en",
) -> str:
    tags = tags or {}
    cat_lower = (category or "destination").lower()
    t_lang = (target_lang or "en").lower().split("-")[0]

    cuisine = tags.get("cuisine")
    historic_type = tags.get("historic")
    tourism_type = tags.get("tourism")

    if t_lang == "es":
        loc_str = f" en {city}" if city else ""
        if (
            neighborhood
            and neighborhood.strip()
            and city
            and neighborhood.lower() != city.lower()
        ):
            loc_str = f" en el distrito de {neighborhood} en {city}"
        parts = []
        if cat_lower in ("museum", "gallery"):
            parts.append(
                f"{name} es un museo destacado{loc_str}, célebre por sus exposiciones y patrimonio cultural."
            )
        elif cat_lower in ("restaurant", "food"):
            parts.append(
                f"{name} es un restaurante destacado{loc_str}, conocido por su auténtica experiencia culinaria."
            )
        elif cat_lower in ("cafe", "coffee"):
            parts.append(
                f"{name} es una cafetería popular{loc_str}, ideal para degustar café artesanal y refrigerios."
            )
        elif cat_lower in ("park", "nature", "garden"):
            parts.append(
                f"{name} es un parque y espacio verde{loc_str}, ideal para paseos relajantes y actividades al aire libre."
            )
        elif cat_lower in ("landmark", "monument"):
            parts.append(
                f"{name} es un monumento emblemático{loc_str}, representativo del patrimonio histórico de la región."
            )
        elif cat_lower in ("transit", "station", "bus_stop"):
            parts.append(
                f"{name} es un punto de conexión de transporte clave{loc_str}."
            )
        else:
            parts.append(
                f"{name} es un atractivo destacado ({cat_lower}){loc_str}, muy visitado por viajeros."
            )

        extras = []
        if duration_mins and duration_mins > 0:
            extras.append(
                f"La duración recomendada de la visita es de ~{duration_mins} minutos"
            )
        if cost_eur is not None and cost_eur > 0:
            extras.append(f"la entrada cuesta alrededor de €{cost_eur:.2f}")
        elif cost_eur == 0:
            extras.append("la entrada es gratuita")
        if extras:
            parts.append(f"{'. '.join(extras).capitalize()}.")
        return " ".join(parts)

    elif t_lang == "fr":
        loc_str = f" à {city}" if city else ""
        if (
            neighborhood
            and neighborhood.strip()
            and city
            and neighborhood.lower() != city.lower()
        ):
            loc_str = f" dans le quartier {neighborhood} à {city}"
        parts = []
        if cat_lower in ("museum", "gallery"):
            parts.append(
                f"{name} est un musée renommé{loc_str}, apprécié pour ses collections et son patrimoine culturel."
            )
        elif cat_lower in ("restaurant", "food"):
            parts.append(
                f"{name} est une adresse gastronomique prisée{loc_str}, proposant des spécialités locales."
            )
        elif cat_lower in ("cafe", "coffee"):
            parts.append(
                f"{name} est un café accueillant{loc_str}, parfait pour une pause gourmande."
            )
        elif cat_lower in ("park", "nature", "garden"):
            parts.append(
                f"{name} est un espace vert paisible{loc_str}, propice aux promenades et à la détente."
            )
        else:
            parts.append(
                f"{name} est un site remarquable ({cat_lower}){loc_str}, apprécié des visiteurs."
            )
        extras = []
        if duration_mins and duration_mins > 0:
            extras.append(f"Durée de visite recommandée : ~{duration_mins} minutes")
        if cost_eur is not None and cost_eur > 0:
            extras.append(f"tarif indicatif : ~{cost_eur:.2f} €")
        elif cost_eur == 0:
            extras.append("l'accès est gratuit")
        if extras:
            parts.append(f"{'. '.join(extras).capitalize()}.")
        return " ".join(parts)

    elif t_lang == "de":
        loc_str = f" in {city}" if city else ""
        parts = []
        if cat_lower in ("museum", "gallery"):
            parts.append(
                f"{name} ist ein renommiertes Museum{loc_str}, bekannt für seine kulturellen Ausstellungen."
            )
        elif cat_lower in ("restaurant", "food"):
            parts.append(
                f"{name} ist eine beliebte kulinarische Adresse{loc_str} mit regionalen Spezialitäten."
            )
        elif cat_lower in ("park", "nature", "garden"):
            parts.append(
                f"{name} ist eine malerische Grünanlage{loc_str}, ideal für Spaziergänge im Freien."
            )
        else:
            parts.append(
                f"{name} ist ein bemerkenswertes Ausflugsziel ({cat_lower}){loc_str}."
            )
        extras = []
        if duration_mins and duration_mins > 0:
            extras.append(f"Empfohlene Besuchsdauer: ca. {duration_mins} Minuten")
        if cost_eur == 0:
            extras.append("der Eintritt ist kostenlos")
        elif cost_eur is not None and cost_eur > 0:
            extras.append(f"Eintritt ca. €{cost_eur:.2f}")
        if extras:
            parts.append(f"{'. '.join(extras).capitalize()}.")
        return " ".join(parts)

    elif t_lang == "ja":
        loc_str = f"（{city}）" if city else ""
        parts = [f"{name}は{city or ''}にある注目の{cat_lower}スポットです。{loc_str}"]
        if duration_mins and duration_mins > 0:
            parts.append(f"推奨滞在時間は約{duration_mins}分です。")
        if cost_eur == 0:
            parts.append("入場料は無料です。")
        elif cost_eur and cost_eur > 0:
            parts.append(f"想定料金は約€{cost_eur:.2f}です。")
        return "".join(parts)

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
    elif (
        cat_lower in ("hotel", "lodging", "resort", "hostel", "accommodation")
        or "hotel" in name.lower()
        or "hostel" in name.lower()
    ):
        parts.append(
            f"{name} provides hospitality accommodations and base camp lodging{location_str}."
        )
    elif (
        cat_lower in ("airport", "flight", "aerodrome", "airfield")
        or "airport" in name.lower()
    ):
        parts.append(
            f"{name} is an aviation gateway and flight transport hub{location_str}."
        )
    else:
        parts.append(
            f"{name} is a notable {cat_lower}{location_str}, popular with visitors and locals alike."
        )

    is_hotel_or_airport = (
        cat_lower
        in (
            "hotel",
            "lodging",
            "resort",
            "hostel",
            "accommodation",
            "airport",
            "flight",
            "aerodrome",
            "airfield",
        )
        or any(
            w in name.lower().split()
            for w in (
                "hotel",
                "hostel",
                "resort",
                "inn",
                "motel",
                "ryokan",
                "suites",
                "airport",
            )
        )
        or "hotel" in name.lower()
        or "airport" in name.lower()
    )

    extras: list[str] = []
    if not is_hotel_or_airport:
        if duration_mins and duration_mins > 0:
            extras.append(f"Recommended visit duration is ~{duration_mins} minutes")
        if cost_eur is not None and cost_eur > 0:
            extras.append(f"admission is around €{cost_eur:.2f}")
        elif cost_eur == 0:
            extras.append("entry is free of charge")

    if extras:
        parts.append(f"{'. '.join(extras).capitalize()}.")

    return " ".join(parts)


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Computes great-circle distance in meters between two WGS84 coordinates."""
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("/check-duplicate", response_model=PoiDuplicateCheckResponse)
async def check_duplicate_poi(
    city: str = Query(..., description="Destination city name"),
    name: str = Query(..., min_length=1, description="Proposed POI name"),
    lat: float | None = Query(None, description="Proposed latitude"),
    lng: float | None = Query(None, description="Proposed longitude"),
    session: AsyncSession = Depends(get_db),
) -> PoiDuplicateCheckResponse:
    """Checks if a similar POI already exists in the database by name or proximity."""
    clean_city = city.strip()
    clean_name = name.strip()
    norm_target = _normalize_text(clean_name)
    stripped_target = _strip_articles(clean_name)

    if not norm_target:
        return PoiDuplicateCheckResponse(has_duplicates=False, candidates=[])

    stmt = select(AttractionModel)
    if clean_city:
        stmt = stmt.where(func.lower(AttractionModel.city) == clean_city.lower())

    res = await session.execute(stmt)
    rows = res.scalars().all()

    scored_matches: list[tuple[float, DuplicatePoiCandidate]] = []
    for att in rows:
        cand_norm = _normalize_text(att.name or "")
        cand_stripped = _strip_articles(att.name or "")
        if not cand_norm:
            continue

        c_lat, c_lng = _extract_coords(att.location)
        dist_m: float | None = None
        if lat is not None and lng is not None and (c_lat != 0.0 or c_lng != 0.0):
            dist_m = round(_haversine_meters(lat, lng, c_lat, c_lng), 1)

        match_reason: str | None = None
        score = 0.0

        if cand_norm == norm_target or cand_stripped == stripped_target:
            match_reason = "Exact name match"
            score = 1.0
        else:
            ratio = max(
                SequenceMatcher(None, norm_target, cand_norm).ratio(),
                SequenceMatcher(None, stripped_target, cand_stripped).ratio(),
            )
            is_substring = (
                len(stripped_target) >= 4
                and len(cand_stripped) >= 4
                and (
                    stripped_target in cand_stripped or cand_stripped in stripped_target
                )
            )
            if ratio >= 0.78 or (is_substring and ratio >= 0.6):
                match_reason = "Similar name"
                score = ratio
            elif dist_m is not None and dist_m <= 60.0:
                match_reason = f"Same location ({int(dist_m)}m away)"
                score = 0.75 + (60.0 - dist_m) / 240.0
            elif dist_m is not None and dist_m <= 150.0 and ratio >= 0.55:
                match_reason = f"Similar name & nearby ({int(dist_m)}m)"
                score = 0.7 + ratio * 0.2

        if match_reason:
            rating_val = None
            if isinstance(att.scoring, dict) and att.scoring.get("rating") is not None:
                try:
                    rating_val = float(att.scoring["rating"])
                except (TypeError, ValueError):
                    rating_val = None
            scored_matches.append(
                (
                    score,
                    DuplicatePoiCandidate(
                        id=att.id,
                        name=att.name,
                        category=att.category,
                        city=att.city,
                        lat=c_lat,
                        lng=c_lng,
                        neighborhood=att.neighborhood,
                        rating=rating_val,
                        distance_meters=dist_m,
                        match_reason=match_reason,
                    ),
                )
            )

    scored_matches.sort(key=lambda x: x[0], reverse=True)
    top_candidates = [item for _, item in scored_matches[:5]]
    return PoiDuplicateCheckResponse(
        has_duplicates=len(top_candidates) > 0,
        candidates=top_candidates,
    )


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
    lang: str | None = Query(
        None, description="Preferred language ISO code, e.g. 'en', 'es', 'ja', 'fr'"
    ),
    request: Request = None,
    current_user: UserModel | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db),
) -> PoiDetailResponse:
    """Retrieves full POI details and dynamically resolves real photos and localized descriptions from Wikimedia/Wikipedia."""
    from app.services.translation_service import (
        base_lang_code,
        detect_language,
        normalize_target_lang,
    )

    raw_lang: str | None = None
    if lang and lang.strip():
        raw_lang = lang.strip()
    elif (
        current_user
        and isinstance(getattr(current_user, "preferences", None), dict)
        and current_user.preferences.get("preferred_language")
    ):
        raw_lang = str(current_user.preferences["preferred_language"]).strip()
    elif request and request.headers.get("accept-language"):
        raw_al = request.headers.get("accept-language", "")
        cand = raw_al.split(",")[0].split(";")[0].strip()
        if cand and len(cand) >= 2:
            raw_lang = cand

    tag_lang = normalize_target_lang(raw_lang) if raw_lang else "en"
    effective_lang = base_lang_code(raw_lang) if raw_lang else "en"
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
        or (
            poi_id
            if not poi_id.startswith(("OSM-", "uuid-", "non-existent-", "custom-"))
            else ""
        )
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
                if not poi_id.startswith(("OSM-", "uuid-", "non-existent-", "custom-"))
                and not poi_id.endswith("-999")
                else ""
            )
        ).strip()
        if resolved_name and (name or len(resolved_name) > 3):
            if is_generic_placeholder_poi(resolved_name, poi_id):
                photos_data, lead_extract = [], None
            else:
                photos_data, lead_extract = await WikimediaPhotoResolver.resolve_photos(
                    poi_id=poi_id,
                    name=resolved_name,
                    city=city or "",
                    target_lang=effective_lang,
                )
            cat_lower = (category or "").lower().strip()
            name_lower = resolved_name.lower().strip()
            if (
                cat_lower
                in (
                    "hotel",
                    "lodging",
                    "resort",
                    "hostel",
                    "accommodation",
                    "motel",
                    "inn",
                    "ryokan",
                )
                or any(
                    w in name_lower.split()
                    for w in (
                        "hotel",
                        "hostel",
                        "resort",
                        "inn",
                        "motel",
                        "ryokan",
                        "suites",
                        "guesthouse",
                    )
                )
                or "hotel" in name_lower
                or "hostel" in name_lower
            ):
                resolved_category = "hotel"
                resolved_duration = 0
            elif (
                cat_lower in ("airport", "flight", "aerodrome", "airfield")
                or "airport" in name_lower
                or "aeroport" in name_lower
                or "aeropuerto" in name_lower
                or "flughafen" in name_lower
            ):
                resolved_category = "airport"
                resolved_duration = 0
            elif cat_lower:
                resolved_category = cat_lower
                resolved_duration = 60
            else:
                resolved_category = "attraction"
                resolved_duration = 60

            fallback_desc = lead_extract or _generate_poi_overview(
                name=resolved_name,
                category=resolved_category,
                city=city or "",
                cost_eur=0.0,
                duration_mins=resolved_duration,
                target_lang=effective_lang,
            )
            fallback_desc_lang = (
                detect_language(lead_extract)
                if lead_extract
                else (
                    effective_lang
                    if effective_lang in ("en", "es", "fr", "de", "ja")
                    else "en"
                )
            )
            return PoiDetailResponse(
                id=poi_id,
                name=resolved_name,
                category=resolved_category,
                city=city or "",
                lat=lat if lat is not None else 0.0,
                lng=lng if lng is not None else 0.0,
                duration_mins=resolved_duration,
                cost_eur=0.0,
                cost_is_estimated=resolved_category not in ("hotel", "airport"),
                cost_source=None,
                scoring={},
                description=fallback_desc,
                description_lang=fallback_desc_lang,
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

    custom_photos = meta.get("photos")
    has_custom_photos = isinstance(custom_photos, list) and len(custom_photos) > 0
    localized_osm_desc = tags.get(f"description:{tag_lang}") or tags.get(
        f"description:{effective_lang}"
    )

    if has_custom_photos and localized_osm_desc:
        photos_data = custom_photos
        lead_extract = None
    else:
        resolved_photos, lead_extract = await WikimediaPhotoResolver.resolve_photos(
            poi_id=poi.id,
            name=poi.name,
            city=poi.city,
            wikipedia_title=poi.wikipedia_title,
            wikidata_id=poi.wikidata_id,
            osm_tags=tags,
            target_lang=effective_lang,
        )
        photos_data = custom_photos if has_custom_photos else resolved_photos

    localized_osm_name = (
        tags.get(f"name:{effective_lang}") if effective_lang != "en" else None
    )
    poi_display_name = (
        str(localized_osm_name).strip()
        if localized_osm_name
        and isinstance(localized_osm_name, str)
        and localized_osm_name.strip()
        else poi.name
    )

    osm_desc = (
        localized_osm_desc
        or tags.get("description")
        or tags.get("description:en")
        or tags.get("description:es")
    )
    generated_overview: str | None = None
    if localized_osm_desc:
        description = localized_osm_desc
    elif lead_extract:
        description = lead_extract
    else:
        description = poi.description or osm_desc or meta.get("description")

    if not description:
        generated_overview = _generate_poi_overview(
            name=poi_display_name,
            category=poi.category,
            city=poi.city,
            neighborhood=poi.neighborhood,
            tags=tags,
            cost_eur=float(poi.cost_eur or 0.0),
            duration_mins=int(poi.duration_mins or 60),
            target_lang=effective_lang,
        )
        description = generated_overview

    if generated_overview is not None:
        description_lang: str | None = (
            effective_lang if effective_lang in ("en", "es", "fr", "de", "ja") else "en"
        )
    elif localized_osm_desc and description == localized_osm_desc:
        description_lang = detect_language(description) or effective_lang
    else:
        description_lang = detect_language(description)

    description_source = poi.description_source or (
        "wikipedia"
        if (lead_extract and description == lead_extract)
        else "osm"
        if osm_desc
        else "paladio_engine"
    )

    # Persist canonical English description to poi.description and non-English
    # extracts to metadata_field["tags"]["description:{lang}"] so RAG embeddings
    # are never poisoned by non-English UI visits.
    should_persist_en = bool(
        description and not poi.description and description_lang == "en"
    )
    lead_lang = detect_language(lead_extract) if lead_extract else None
    should_persist_localized = bool(
        lead_extract
        and lead_lang
        and lead_lang != "en"
        and not tags.get(f"description:{lead_lang}")
    )
    if (
        should_persist_en
        or should_persist_localized
        or tags.get("wikidata")
        or tags.get("wikipedia")
    ):
        try:
            if should_persist_en:
                poi.description = description
                poi.description_source = description_source
            if should_persist_localized and lead_extract and lead_lang:
                updated_meta = dict(poi.metadata_field or {})
                updated_tags = dict(updated_meta.get("tags") or {})
                updated_tags[f"description:{lead_lang}"] = lead_extract
                updated_meta["tags"] = updated_tags
                poi.metadata_field = updated_meta
            await session.commit()
        except Exception as e:
            logger.debug(f"Failed to persist description for poi {poi.id}: {e}")

    attrs = _extract_poi_attributes(poi, meta, tags)
    res = PoiDetailResponse(
        id=poi.id,
        name=poi_display_name,
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
        description_lang=description_lang,
        description_source=description_source,
        wikipedia_title=poi.wikipedia_title,
        wikidata_id=poi.wikidata_id,
        website=poi.website or tags.get("website") or tags.get("contact:website"),
        phone=attrs["phone"],
        address=attrs["address"],
        email=attrs["email"],
        wheelchair_accessible=attrs["wheelchair_accessible"],
        reservation_required=attrs["reservation_required"],
        cuisine=attrs["cuisine"],
        amenities=attrs["amenities"],
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


@router.post("", response_model=PoiDetailResponse)
async def create_poi(
    poi_in: PoiCreateRequest,
    session: AsyncSession = Depends(get_db),
) -> PoiDetailResponse:
    """Creates a custom POI and persists it in PostgreSQL."""
    clean_city = poi_in.city.strip()
    city_id: str | None = None
    if clean_city:
        city_res = await session.execute(
            select(CityModel.id).where(func.lower(CityModel.name) == clean_city.lower())
        )
        city_id = city_res.scalar_one_or_none()

    new_id = f"custom-{uuid.uuid4().hex[:12]}"

    open_time_mins_by_day: list[int] = []
    close_time_mins_by_day: list[int] = []
    daily_windows: list[list[list[int]]] = []
    osm_hours: str | None = None
    hours_known = False

    def _parse_hhmm(val: str | None) -> int | None:
        if not val or ":" not in val:
            return None
        try:
            hh, mm = map(int, val.strip().split(":"))
            return max(0, min(1440, hh * 60 + mm))
        except Exception:
            return None

    if poi_in.weekly_hours and len(poi_in.weekly_hours) == 7:
        day_codes = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
        osm_parts: list[str] = []
        any_configured = False
        for idx, day_item in enumerate(poi_in.weekly_hours):
            if day_item.is_open:
                o_min = _parse_hhmm(day_item.open_time)
                c_min = _parse_hhmm(day_item.close_time)
                if o_min is not None and c_min is not None:
                    open_time_mins_by_day.append(o_min)
                    close_time_mins_by_day.append(c_min)
                    daily_windows.append([[o_min, c_min]])
                    osm_parts.append(
                        f"{day_codes[idx]} {day_item.open_time.strip()}-{day_item.close_time.strip()}"
                    )
                    any_configured = True
                else:
                    open_time_mins_by_day.append(0)
                    close_time_mins_by_day.append(0)
                    daily_windows.append([])
            else:
                open_time_mins_by_day.append(0)
                close_time_mins_by_day.append(0)
                daily_windows.append([])
                osm_parts.append(f"{day_codes[idx]} off")
                any_configured = True

        if any_configured:
            hours_known = True
            osm_hours = "; ".join(osm_parts) if osm_parts else None
    elif poi_in.opening_time and poi_in.closing_time:
        o_min = _parse_hhmm(poi_in.opening_time)
        c_min = _parse_hhmm(poi_in.closing_time)
        if o_min is not None and c_min is not None:
            open_time_mins_by_day = [o_min] * 7
            close_time_mins_by_day = [c_min] * 7
            daily_windows = [[[o_min, c_min]] for _ in range(7)]
            osm_hours = f"{poi_in.opening_time.strip()}-{poi_in.closing_time.strip()}"
            hours_known = True

    rating_val: float | None = None
    if poi_in.rating is not None:
        rating_val = round(max(0.5, min(5.0, float(poi_in.rating))), 1)

    tags: dict[str, Any] = {}
    if poi_in.website:
        tags["website"] = poi_in.website.strip()
    if poi_in.phone:
        tags["phone"] = poi_in.phone.strip()
    if poi_in.address:
        tags["addr:full"] = poi_in.address.strip()
    if poi_in.email:
        tags["email"] = poi_in.email.strip()
    if poi_in.wheelchair_accessible is True:
        tags["wheelchair"] = "yes"
    elif poi_in.wheelchair_accessible is False:
        tags["wheelchair"] = "no"

    photos_list: list[dict[str, Any]] = []
    if poi_in.photos:
        for ph in poi_in.photos:
            clean_url = (ph.url or "").strip()
            if not clean_url:
                continue
            photos_list.append(
                {
                    "url": clean_url,
                    "thumbnail_url": (ph.thumbnail_url or clean_url).strip(),
                    "caption": ph.caption.strip() if ph.caption else None,
                }
            )

    meta: dict[str, Any] = {
        "source": "user_created",
        "description": poi_in.description or "",
    }
    if clean_city:
        meta["city"] = clean_city
    clean_country = (poi_in.country or "").strip() or None
    if clean_country:
        meta["country"] = clean_country
    if rating_val is not None:
        meta["rating"] = rating_val
    if tags:
        meta["tags"] = tags
    if osm_hours:
        meta["opening_hours"] = osm_hours
    if poi_in.phone:
        meta["phone"] = poi_in.phone.strip()
    if poi_in.address:
        meta["address"] = poi_in.address.strip()
    if poi_in.email:
        meta["email"] = poi_in.email.strip()
    if poi_in.wheelchair_accessible is not None:
        meta["wheelchair_accessible"] = poi_in.wheelchair_accessible
    if poi_in.reservation_required is not None:
        meta["reservation_required"] = poi_in.reservation_required
    if photos_list:
        meta["photos"] = photos_list

    scoring_data: dict[str, Any] = {}
    if rating_val is not None:
        scoring_data["rating"] = rating_val
        scoring_data["reviews"] = 1

    resolved_neighborhood = (
        (poi_in.neighborhood or "").strip() or (poi_in.address or "").strip() or None
    )

    location_payload: dict[str, Any] = {
        "latitude": float(poi_in.lat),
        "longitude": float(poi_in.lng),
    }
    if clean_city:
        location_payload["city"] = clean_city
    if clean_country:
        location_payload["country"] = clean_country

    attraction = AttractionModel(
        id=new_id,
        city=clean_city,
        city_id=city_id,
        name=poi_in.name.strip(),
        category=poi_in.category.strip().lower(),
        cost_eur=float(poi_in.cost_eur),
        cost_is_estimated=False,
        cost_source="user",
        duration_mins=int(poi_in.duration_mins),
        location=location_payload,
        scoring=scoring_data,
        metadata_field=meta,
        description=poi_in.description,
        website=poi_in.website,
        neighborhood=resolved_neighborhood,
        doc_quality="A",
        hours_known=hours_known,
        osm_opening_hours=osm_hours,
        daily_windows=daily_windows,
        open_time_mins_by_day=open_time_mins_by_day,
        close_time_mins_by_day=close_time_mins_by_day,
    )
    session.add(attraction)
    await session.commit()
    await session.refresh(attraction)

    return PoiDetailResponse(
        id=attraction.id,
        name=attraction.name,
        category=attraction.category,
        city=attraction.city,
        lat=float(poi_in.lat),
        lng=float(poi_in.lng),
        duration_mins=attraction.duration_mins,
        cost_eur=float(attraction.cost_eur),
        cost_is_estimated=False,
        cost_source=attraction.cost_source,
        scoring=scoring_data,
        description=attraction.description,
        website=attraction.website,
        phone=meta.get("phone"),
        address=meta.get("address"),
        email=meta.get("email"),
        wheelchair_accessible=meta.get("wheelchair_accessible"),
        reservation_required=meta.get("reservation_required"),
        neighborhood=attraction.neighborhood,
        doc_quality="A",
        hours_known=hours_known,
        osm_opening_hours=osm_hours,
        daily_windows=daily_windows,
        photos=[PoiPhotoItem(**p) for p in photos_list],
    )


@router.put("/{poi_id}", response_model=PoiDetailResponse)
async def update_poi(
    poi_id: str,
    update_in: PoiUpdateRequest,
    session: AsyncSession = Depends(get_db),
) -> PoiDetailResponse:
    """Updates an existing POI attributes in PostgreSQL."""
    attraction = await session.get(AttractionModel, poi_id)
    if not attraction:
        if update_in.name and update_in.lat is not None and update_in.lng is not None:
            attraction = AttractionModel(
                id=poi_id,
                city="",
                name=update_in.name.strip(),
                category=(update_in.category or "attraction").strip().lower(),
                cost_eur=float(update_in.cost_eur or 0.0),
                cost_is_estimated=False,
                cost_source="user",
                duration_mins=int(update_in.duration_mins or 60),
                location={
                    "latitude": float(update_in.lat),
                    "longitude": float(update_in.lng),
                },
                scoring={},
                metadata_field={"source": "user_edited"},
                description=update_in.description,
                website=update_in.website,
                doc_quality="A",
                hours_known=False,
                open_time_mins_by_day=[480] * 7,
                close_time_mins_by_day=[1320] * 7,
            )
            session.add(attraction)
        else:
            raise HTTPException(status_code=404, detail="POI not found")

    if update_in.name is not None:
        attraction.name = update_in.name.strip()
    if update_in.category is not None:
        attraction.category = update_in.category.strip().lower()
    if update_in.duration_mins is not None:
        attraction.duration_mins = int(update_in.duration_mins)
    if update_in.cost_eur is not None:
        attraction.cost_eur = float(update_in.cost_eur)
        attraction.cost_is_estimated = False
    if update_in.description is not None:
        attraction.description = update_in.description
    if update_in.website is not None:
        attraction.website = update_in.website
        meta = dict(attraction.metadata_field or {})
        tags = dict(meta.get("tags") or {})
        tags["website"] = update_in.website
        meta["tags"] = tags
        attraction.metadata_field = meta
    if update_in.phone is not None:
        meta = dict(attraction.metadata_field or {})
        tags = dict(meta.get("tags") or {})
        clean_phone = update_in.phone.strip()
        if clean_phone:
            meta["phone"] = clean_phone
            tags["phone"] = clean_phone
        else:
            meta.pop("phone", None)
            tags.pop("phone", None)
        meta["tags"] = tags
        attraction.metadata_field = meta
    if update_in.lat is not None and update_in.lng is not None:
        attraction.location = {
            "latitude": float(update_in.lat),
            "longitude": float(update_in.lng),
        }

    if update_in.photos is not None:
        meta = dict(attraction.metadata_field or {})
        photos_list = [
            {
                "url": p.url.strip(),
                "thumbnail_url": (p.thumbnail_url or p.url).strip(),
                "caption": p.caption.strip() if p.caption else None,
            }
            for p in update_in.photos
            if p.url and p.url.strip()
        ]
        meta["photos"] = photos_list
        if photos_list:
            meta["photo_url"] = photos_list[0]["url"]
            meta["thumbnail_url"] = photos_list[0]["thumbnail_url"]
        else:
            meta.pop("photo_url", None)
            meta.pop("thumbnail_url", None)
        attraction.metadata_field = meta
    elif update_in.photo_url is not None:
        meta = dict(attraction.metadata_field or {})
        clean_url = update_in.photo_url.strip()
        if clean_url:
            meta["photos"] = [
                {"url": clean_url, "thumbnail_url": clean_url, "caption": None}
            ]
            meta["photo_url"] = clean_url
            meta["thumbnail_url"] = clean_url
        else:
            meta["photos"] = []
            meta.pop("photo_url", None)
            meta.pop("thumbnail_url", None)
        attraction.metadata_field = meta

    await session.commit()
    await session.refresh(attraction)

    loc = attraction.location or {}
    lat = float(loc.get("latitude") or loc.get("lat") or (update_in.lat or 0.0))
    lng = float(loc.get("longitude") or loc.get("lng") or (update_in.lng or 0.0))
    meta = dict(attraction.metadata_field or {})
    tags = dict(meta.get("tags") or {})
    attrs = _extract_poi_attributes(attraction, meta, tags)
    photos_data = meta.get("photos") or []
    photos_res = (
        [PoiPhotoItem(**p) for p in photos_data]
        if isinstance(photos_data, list)
        else []
    )

    from app.services.translation_service import detect_language

    return PoiDetailResponse(
        id=attraction.id,
        name=attraction.name,
        category=attraction.category,
        city=attraction.city or "",
        lat=lat,
        lng=lng,
        duration_mins=attraction.duration_mins or 60,
        cost_eur=float(attraction.cost_eur or 0.0),
        cost_is_estimated=bool(attraction.cost_is_estimated),
        cost_source=attraction.cost_source,
        scoring=dict(attraction.scoring or {}),
        description=attraction.description,
        description_lang=detect_language(attraction.description),
        website=attraction.website,
        phone=attrs["phone"],
        address=attrs["address"],
        email=attrs["email"],
        wheelchair_accessible=attrs["wheelchair_accessible"],
        reservation_required=attrs["reservation_required"],
        cuisine=attrs["cuisine"],
        amenities=attrs["amenities"],
        neighborhood=attraction.neighborhood,
        doc_quality=getattr(attraction, "doc_quality", "C") or "C",
        hours_known=bool(getattr(attraction, "hours_known", False)),
        daily_windows=list(getattr(attraction, "daily_windows", []) or []),
        photos=photos_res,
    )


class PoiTranslateRequest(BaseModel):
    target_lang: str = Field(..., min_length=2, max_length=20)
    text: str | None = None
    source_lang: str | None = None


class PoiTranslateResponse(BaseModel):
    translated_text: str
    source_lang: str | None = None
    target_lang: str
    provider: str
    cached: bool = False


@router.post("/{poi_id}/translate", response_model=PoiTranslateResponse)
async def translate_poi_description(
    poi_id: str,
    payload: PoiTranslateRequest,
    session: AsyncSession = Depends(get_db),
) -> PoiTranslateResponse:
    """Translates a POI description into target_lang on demand and caches it in PostgreSQL."""
    from app.services.translation_service import (
        TranslationError,
        TranslationService,
        base_lang_code,
        normalize_target_lang,
    )

    norm_target = normalize_target_lang(payload.target_lang)
    base_target = base_lang_code(norm_target)

    res = await session.execute(
        select(AttractionModel).where(AttractionModel.id == poi_id)
    )
    attraction = res.scalar_one_or_none()

    meta = dict(attraction.metadata_field or {}) if attraction else {}
    tags = dict(meta.get("tags") or {})

    provided_text = (
        payload.text.strip() if payload.text and payload.text.strip() else None
    )
    stored_candidates = {
        s.strip()
        for s in (
            attraction.description if attraction else None,
            tags.get("description"),
            tags.get("description:en"),
            meta.get("description"),
        )
        if isinstance(s, str) and s.strip()
    }

    # Check PostgreSQL cache first when translating the POI's stored description
    if attraction and (not provided_text or provided_text in stored_candidates):
        cached_val = tags.get(f"description:{norm_target}") or tags.get(
            f"description:{base_target}"
        )
        if isinstance(cached_val, str) and cached_val.strip():
            return PoiTranslateResponse(
                translated_text=cached_val.strip(),
                source_lang=payload.source_lang,
                target_lang=norm_target,
                provider="cache",
                cached=True,
            )

    source_text = provided_text or (
        attraction.description
        or tags.get("description")
        or tags.get("description:en")
        or meta.get("description")
        if attraction
        else None
    )
    if not source_text or not source_text.strip():
        raise HTTPException(
            status_code=400, detail="No description text available to translate."
        )

    try:
        tr = await TranslationService.translate_text(
            text=source_text,
            target_lang=norm_target,
            source_lang=payload.source_lang,
            session=session,
        )
    except TranslationError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err

    if attraction and tr.provider != "noop":
        try:
            updated_meta = dict(attraction.metadata_field or {})
            updated_tags = dict(updated_meta.get("tags") or {})
            updated_tags[f"description:{norm_target}"] = tr.translated_text
            if base_target != norm_target.lower():
                updated_tags[f"description:{base_target}"] = tr.translated_text
            if base_target == "en" and not attraction.description:
                attraction.description = tr.translated_text
                attraction.description_source = tr.provider
            updated_meta["tags"] = updated_tags
            attraction.metadata_field = updated_meta
            await session.commit()
        except Exception as cache_err:
            logger.debug(f"Failed to cache translation for poi {poi_id}: {cache_err}")

    return PoiTranslateResponse(
        translated_text=tr.translated_text,
        source_lang=tr.source_lang,
        target_lang=tr.target_lang,
        provider=tr.provider,
        cached=False,
    )


@router.delete("/{poi_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poi(
    poi_id: str,
    session: AsyncSession = Depends(get_db),
) -> None:
    """Deletes a manually created custom POI."""
    res = await session.execute(
        select(AttractionModel).where(AttractionModel.id == poi_id)
    )
    attraction = res.scalar_one_or_none()
    if not attraction:
        raise HTTPException(status_code=404, detail="POI not found")

    meta = attraction.metadata_field or {}
    is_custom = (
        poi_id.startswith("custom-")
        or meta.get("source") == "user_created"
        or attraction.cost_source == "user"
    )
    if not is_custom:
        raise HTTPException(
            status_code=403,
            detail="Only manually created custom POIs can be deleted",
        )

    # Clean up any trip collection items referencing this custom POI
    await session.execute(
        delete(TripCollectionItemModel).where(TripCollectionItemModel.poi_id == poi_id)
    )

    await session.delete(attraction)
    await session.commit()
    return None
