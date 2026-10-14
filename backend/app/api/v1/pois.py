import logging
import re
import unicodedata
from typing import Any

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.db.session import get_db
from app.infrastructure.providers.ollama_embedding_provider import (
    OllamaEmbeddingProvider,
)
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
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


@router.get("/search", response_model=PoiSearchResponse)
async def search_pois(
    city: str = Query(..., description="Destination city name (e.g. Madrid)"),
    query: str = Query(..., description="Search query: POI name or natural language"),
    category: str | None = Query(
        None, description="Optional category filter (e.g. museum, cafe, restaurant)"
    ),
    limit: int = Query(15, ge=1, le=50, description="Max results to return"),
    session: AsyncSession = Depends(get_db),
):
    """
    Intelligent POI search engine supporting:
    1. Exact / Fuzzy POI Name Search: checks PostgreSQL database. If found, returns
       exact match card + similar POIs nearby. If not found, explicitly informs user.
    2. Natural Language Semantic RAG: embeds prompt via Ollama (768D) and retrieves
       most relevant POIs in the city ranked by cosine similarity [0.0, 1.0].
    """
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

    # 2. Check for exact / fuzzy name match
    category_filter_sql = ""
    params: dict[str, Any] = {
        "city_name": city_name,
        "city_id": city_id,
        "limit": limit,
    }
    if category and category.lower() != "all":
        category_filter_sql = "AND lower(category) = :category"
        params["category"] = category.lower()

    # Query all POIs in the city for lexical evaluation
    lexical_query = text(
        f"""
        SELECT id, name, category, location, scoring, cost_eur, duration_mins, embedding
        FROM attractions
        WHERE (lower(city) = lower(:city_name) OR city_id = :city_id)
        {category_filter_sql}
        """
    )
    lex_res = await session.execute(lexical_query, params)
    city_pois = lex_res.fetchall()

    best_match = None
    best_match_score = 0.0
    best_match_type = None

    for poi in city_pois:
        p_id, p_name, p_cat, p_loc, p_sc, p_cost, p_dur, p_emb = poi
        norm_name = _normalize_text(p_name)
        stripped_name = _strip_articles(p_name)

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
        elif len(norm_query) >= 4 and norm_name in norm_query:
            score = 0.80
            mtype = "fuzzy_name"
        else:
            # Word token overlap
            q_words = [w for w in stripped_query.split() if len(w) >= 3]
            n_words = [w for w in stripped_name.split() if len(w) >= 3]
            if q_words and n_words:
                overlap = set(q_words).intersection(set(n_words))
                if len(overlap) == len(q_words):
                    score = 0.75
                    mtype = "fuzzy_name"
                elif overlap:
                    score = 0.40 * (len(overlap) / max(len(q_words), len(n_words)))
                    mtype = "fuzzy_name"

        if score > best_match_score:
            best_match_score = score
            best_match = poi
            best_match_type = mtype

    # 3. Decision: Is this an Exact/Fuzzy POI Name Match?
    if best_match and best_match_score >= 0.70:
        p_id, p_name, p_cat, p_loc, p_sc, p_cost, p_dur, p_emb = best_match
        lat, lng = _extract_coords(p_loc)
        exact_item = PoiSearchItem(
            id=p_id,
            name=p_name,
            category=p_cat,
            lat=lat,
            lng=lng,
            duration_mins=int(p_dur or 60),
            cost_eur=float(p_cost or 0.0),
            similarity=1.0,
            match_type=best_match_type,
        )

        similar_items: list[PoiSearchItem] = []
        if p_emb is not None:
            sim_sql = text(
                f"""
                WITH city_pois AS MATERIALIZED (
                    SELECT id, name, category, location, scoring, cost_eur, duration_mins, embedding
                    FROM attractions
                    WHERE (lower(city) = lower(:city_name) OR city_id = :city_id)
                      AND id != :target_id AND embedding IS NOT NULL
                      {category_filter_sql}
                )
                SELECT id, name, category, location, scoring, cost_eur, duration_mins,
                       1 - (embedding <=> cast(:emb as vector)) AS sim
                FROM city_pois
                ORDER BY embedding <=> cast(:emb as vector) ASC
                LIMIT :limit;
                """
            )
            sim_params = {**params, "target_id": p_id, "emb": str(p_emb)}
            sim_res = await session.execute(sim_sql, sim_params)
            for r in sim_res.fetchall():
                r_id, r_name, r_cat, r_loc, r_sc, r_cost, r_dur, r_sim = r
                r_lat, r_lng = _extract_coords(r_loc)
                sim_score = float(max(0.0, min(1.0, float(r_sim))))
                similar_items.append(
                    PoiSearchItem(
                        id=r_id,
                        name=r_name,
                        category=r_cat,
                        lat=r_lat,
                        lng=r_lng,
                        duration_mins=int(r_dur or 60),
                        cost_eur=float(r_cost or 0.0),
                        similarity=round(sim_score, 3),
                        match_type="similar_poi",
                    )
                )

        return PoiSearchResponse(
            city=city_name,
            query=clean_query,
            search_type=best_match_type or "exact_match",
            exact_match_found=True,
            exact_match=exact_item,
            results=similar_items,
        )

    # 4. Otherwise, generate embedding for Natural Language / Semantic RAG search
    embedding_provider = OllamaEmbeddingProvider()
    try:
        query_vector = await embedding_provider.embed_text(
            clean_query, input_type="query"
        )
    except Exception:
        query_vector = None

    results: list[PoiSearchItem] = []
    if query_vector:
        rag_sql = text(
            f"""
            WITH city_pois AS MATERIALIZED (
                SELECT id, name, category, location, scoring, cost_eur, duration_mins, embedding
                FROM attractions
                WHERE (lower(city) = lower(:city_name) OR city_id = :city_id)
                  AND embedding IS NOT NULL
                  {category_filter_sql}
            )
            SELECT id, name, category, location, scoring, cost_eur, duration_mins,
                   1 - (embedding <=> cast(:vec as vector)) AS sim
            FROM city_pois
            ORDER BY embedding <=> cast(:vec as vector) ASC
            LIMIT :limit;
            """
        )
        rag_params = {**params, "vec": str(query_vector)}
        rag_res = await session.execute(rag_sql, rag_params)
        for r in rag_res.fetchall():
            r_id, r_name, r_cat, r_loc, r_sc, r_cost, r_dur, r_sim = r
            r_lat, r_lng = _extract_coords(r_loc)
            sim_score = float(max(0.0, min(1.0, float(r_sim))))
            results.append(
                PoiSearchItem(
                    id=r_id,
                    name=r_name,
                    category=r_cat,
                    lat=r_lat,
                    lng=r_lng,
                    duration_mins=int(r_dur or 60),
                    cost_eur=float(r_cost or 0.0),
                    similarity=round(sim_score, 3),
                    match_type="semantic",
                )
            )

    is_name_attempt = (
        len(clean_query.split()) <= 4
        and not any(
            w in norm_query
            for w in [
                "best",
                "good",
                "cozy",
                "with",
                "where",
                "popular",
                "top",
                "cheap",
                "free",
                "view",
                "museums",
                "cafes",
                "restaurants",
            ]
        )
        and (best_match_score < 0.5)
    )

    message = None
    if is_name_attempt and not results:
        message = f"Place '{clean_query}' not found in {city_name} database."
    elif is_name_attempt:
        message = f"Exact place '{clean_query}' not found in {city_name} database. Showing closest semantic discoveries below:"

    return PoiSearchResponse(
        city=city_name,
        query=clean_query,
        search_type="semantic_rag",
        exact_match_found=False,
        message=message,
        exact_match=None,
        results=results,
    )
