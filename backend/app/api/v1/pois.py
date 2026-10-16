"""POI Search and Retrieval API (Phase 4).

Powered by HybridRetriever:
- Single-roundtrip SQL CTE combining Dense Vector + Full-Text Search + Trigram RRF
- Composite reranking (RRF + Iconicity + Facet Match + Doc Quality Bonus)
- Spatial-Semantic MMR diversification
- Exposes description, neighborhood, facets, doc_quality, and hours_known
"""

import logging
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.db.session import get_db
from app.engine.retrieval.hybrid_retriever import HybridRetriever
from app.engine.retrieval.query_rewriter import QueryRewriter
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)

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


class PoiSearchResponse(BaseModel):
    city: str
    query: str
    search_type: str  # "exact_match", "fuzzy_match", "semantic_rag"
    exact_match_found: bool
    message: str | None = None
    exact_match: PoiSearchItem | None = None
    results: list[PoiSearchItem] = []


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
    return PoiSearchItem(
        id=str(c.get("id")),
        name=str(c.get("name")),
        category=str(c.get("category", "attraction")),
        lat=lat,
        lng=lng,
        duration_mins=int(c.get("duration_mins") or 60),
        cost_eur=float(c.get("cost_eur") or 0.0),
        similarity=round(float(sim), 3),
        match_type=match_type,
        description=c.get("description"),
        neighborhood=c.get("neighborhood"),
        facets=c.get("facets") or {},
        doc_quality=c.get("doc_quality") or "C",
        hours_known=bool(c.get("hours_known", False)),
    )


@router.get("/search", response_model=PoiSearchResponse)
async def search_pois(
    city: str = Query(..., description="Destination city name (e.g. Madrid)"),
    query: str = Query(..., description="Search query: POI name or natural language"),
    category: str | None = Query(
        None, description="Optional category filter (e.g. museum, cafe, restaurant)"
    ),
    trip_id: str | None = Query(
        None, description="Optional trip ID to fetch trip-specific hotel and airport"
    ),
    limit: int = Query(15, ge=1, le=50, description="Max results to return"),
    session: AsyncSession = Depends(get_db),
):
    """Hybrid POI Search Engine with Single-Roundtrip SQL RRF & Spatial-Semantic MMR."""
    clean_query = query.strip()
    if not clean_query:
        return PoiSearchResponse(
            city=city,
            query="",
            search_type="semantic_rag",
            exact_match_found=False,
            message="Please enter a search query.",
            results=[],
        )

    # 1. Resolve city
    city_repo = SqlCityRepository(session)
    city_obj = await city_repo.find_by_name_or_alias(city)
    city_name = city_obj.name if city_obj else city.strip()
    city_id = city_obj.id if city_obj else f"{city.strip().lower()}_es"

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
        from app.db.models import TripModel

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
                    )

    # Database search for hotels/airports by name pattern if querying hotel/airport
    if is_hotel_query or is_airport_query:
        from sqlalchemy import or_, select
        from app.db.models import AttractionModel

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
            )

    # 2. Check for exact / fuzzy name match via Trigram RRF
    lexical_candidates = await HybridRetriever.search_hybrid(
        session=session,
        city=city_name,
        city_id=city_id,
        query_vec=None,
        clean_query=clean_query,
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

        score = 0.0
        mtype = None

        if norm_name == norm_query:
            score = 1.0
            mtype = "exact_name"
        elif stripped_name == stripped_query:
            score = 0.95
            mtype = "exact_name"
        elif len(norm_query) >= 3 and norm_query in norm_name:
            score = 0.88
            mtype = "fuzzy_name"
        elif len(stripped_query) >= 3 and stripped_query in stripped_name:
            score = 0.82
            mtype = "fuzzy_name"
        elif trgm_sim >= 0.70:
            score = trgm_sim
            mtype = "fuzzy_name"

        if score > best_match_score:
            best_match_score = score
            best_match = cand
            best_match_type = mtype

    # 3. Decision: Exact / Fuzzy match branch
    if best_match and best_match_score >= 0.70:
        exact_item = _candidate_to_search_item(
            best_match, 1.0, best_match_type or "exact_name"
        )

        # Find similar POIs nearby using vector embedding of exact match
        similar_items: list[PoiSearchItem] = []
        p_emb = best_match.get("embedding")
        if p_emb is not None:
            # Query similar items with vector search
            emb_list = list(p_emb) if hasattr(p_emb, "__iter__") else None
            sim_candidates = await HybridRetriever.search_hybrid(
                session=session,
                city=city_name,
                city_id=city_id,
                query_vec=emb_list,
                clean_query="",
                limit=limit + 1,
                w_vec=1.0,
                w_fts=0.0,
                w_trgm=0.0,
                apply_mmr=True,
            )
            for c in sim_candidates:
                if str(c.get("id")) != str(best_match.get("id")):
                    sim_val = float(c.get("vec_sim", 0.85))
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
        limit=limit,
        w_vec=0.55 if query_vector else 0.0,
        w_fts=0.25 if sq.clean_query else 0.0,
        w_trgm=0.20 if sq.clean_query else 0.0,
        apply_mmr=True,
    )

    if category and category.lower() != "all":
        candidates = [
            c
            for c in candidates
            if str(c.get("category", "")).lower() == category.lower()
        ]

    results: list[PoiSearchItem] = []
    for c in candidates:
        sim_val = float(c.get("vec_sim", c.get("composite_score", 0.0)))
        results.append(_candidate_to_search_item(c, sim_val, "semantic_rag"))

    # If results are sorted by similarity
    results.sort(key=lambda x: x.similarity, reverse=True)

    # Check if a non-empty query retrieved no exact match
    message = None
    if not best_match or best_match_score < 0.70:
        message = f"No exact match found for '{clean_query}' in {city_name}. Showing top recommendations."

    return PoiSearchResponse(
        city=city_name,
        query=clean_query,
        search_type="semantic_rag",
        exact_match_found=False,
        message=message,
        exact_match=None,
        results=results,
    )
