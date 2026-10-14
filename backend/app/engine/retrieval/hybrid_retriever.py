"""Hybrid POI Retriever with SQL Reciprocal Rank Fusion (RRF) and Spatial-Semantic MMR (Phase 4).

Features:
1. Single-roundtrip SQL CTE combining:
   - Dense Vector Cosine Similarity (pgvector 0.8+ with iterative scan)
   - PostgreSQL Full-Text Search (ts_rank_cd on unaccented text vector)
   - Trigram Fuzzy Matching (similarity % on name & aliases)
2. Composite Candidate Reranking:
   Score(p) = 0.55 * NormRRF(p) + 0.25 * Iconicity(p) + 0.12 * FacetMatch(p) + 0.08 * DocQualityBonus(p)
3. Spatial-Semantic Maximal Marginal Relevance (MMR) Diversification:
   MMR(p_i) = λ * Score(p_i) - (1-λ) * max_{p_j ∈ S} [ 0.65 * cos(e_i, e_j) + 0.35 * I(cat_i == cat_j) * exp(-d_km / 0.5) ]
"""

import logging
import math
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes Haversine distance between two points in km."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * r * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def _parse_vector(v: Any) -> list[float] | None:
    """Safely converts vector representations (str, list, tuple, Vector) into list[float]."""
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        return [float(x) for x in v]
    if isinstance(v, str):
        cleaned = v.strip("[]() ")
        if not cleaned:
            return None
        try:
            return [float(x) for x in cleaned.split(",")]
        except ValueError:
            return None
    if hasattr(v, "tolist"):
        return [float(x) for x in v.tolist()]
    return None


def _cosine_similarity(vec1: Any, vec2: Any) -> float:
    """Computes cosine similarity between two float vectors."""
    v1 = _parse_vector(vec1)
    v2 = _parse_vector(vec2)
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm1 * norm2)))


def compute_facet_match_score(
    poi_facets: dict[str, Any] | None,
    required_facets: dict[str, Any] | None,
) -> float:
    """Computes normalized [0.0, 1.0] score of how well POI satisfies required facets."""
    if not required_facets:
        return 1.0
    if not poi_facets:
        return 0.0

    matches = 0
    total = 0

    if "rain_friendly" in required_facets:
        total += 1
        if bool(poi_facets.get("rain_friendly")) == bool(
            required_facets["rain_friendly"]
        ):
            matches += 1

    if "indoor_outdoor" in required_facets:
        total += 1
        if poi_facets.get("indoor_outdoor") == required_facets["indoor_outdoor"]:
            matches += 1

    if "budget_tier" in required_facets:
        total += 1
        if poi_facets.get("budget_tier") == required_facets["budget_tier"]:
            matches += 1

    if "themes" in required_facets:
        total += 1
        req_themes = set(required_facets["themes"])
        poi_themes = set(poi_facets.get("themes") or [])
        if req_themes & poi_themes:
            matches += 1

    if "vibes" in required_facets:
        total += 1
        req_vibes = set(required_facets["vibes"])
        poi_vibes = set(poi_facets.get("vibes") or [])
        if req_vibes & poi_vibes:
            matches += 1

    return matches / max(1, total)


def compute_doc_quality_bonus(doc_quality: str | None) -> float:
    """DocQualityBonus: +1.0 for Grade A, +0.6 for Grade B, 0.0 for Grade C."""
    grade = (doc_quality or "C").upper().strip()
    if grade == "A":
        return 1.0
    elif grade == "B":
        return 0.6
    return 0.0


def apply_spatial_semantic_mmr(
    candidates: list[dict[str, Any]],
    limit: int = 50,
    mmr_lambda: float = 0.70,
) -> list[dict[str, Any]]:
    """Diversifies candidate POIs using Geographic + Semantic Maximal Marginal Relevance (MMR).

    Formula:
    MMR(p_i) = λ * Score(p_i) - (1-λ) * max_{p_j ∈ S} [ 0.65 * cos(e_i, e_j) + 0.35 * I(subcat_i == subcat_j) * exp(-d_km / 0.5) ]
    """
    if len(candidates) <= limit:
        return candidates

    selected: list[dict[str, Any]] = []
    remaining = list(candidates)

    # 1. Pick top composite score candidate
    best_initial_idx = max(
        range(len(remaining)), key=lambda i: remaining[i].get("composite_score", 0.0)
    )
    selected.append(remaining.pop(best_initial_idx))

    # 2. Greedily select next candidates maximizing MMR
    while len(selected) < limit and remaining:
        best_mmr = -float("inf")
        best_idx = 0

        for idx, cand in enumerate(remaining):
            score_i = cand.get("composite_score", 0.0)
            loc_i = cand.get("location") or {}
            lat_i = loc_i.get("latitude")
            lon_i = loc_i.get("longitude")
            cat_i = cand.get("category", "")
            tax_i = cand.get("taxonomy_category", "")
            emb_i = cand.get("embedding")

            # Compute max penalty against already selected set S
            max_penalty = 0.0
            for sel in selected:
                loc_j = sel.get("location") or {}
                lat_j = loc_j.get("latitude")
                lon_j = loc_j.get("longitude")
                cat_j = sel.get("category", "")
                tax_j = sel.get("taxonomy_category", "")
                emb_j = sel.get("embedding")

                # Semantic similarity
                cos_sim = _cosine_similarity(emb_i, emb_j) if (emb_i and emb_j) else 0.0
                cos_sim = max(0.0, cos_sim)

                # Geographic proximity decay if same category/taxonomy
                spatial_penalty = 0.0
                same_cat = (cat_i == cat_j) or (tax_i and tax_i == tax_j)
                if (
                    same_cat
                    and lat_i is not None
                    and lon_i is not None
                    and lat_j is not None
                    and lon_j is not None
                ):
                    d_km = _haversine_distance_km(lat_i, lon_i, lat_j, lon_j)
                    spatial_penalty = math.exp(-d_km / 0.5)

                penalty = (
                    0.65 * cos_sim + 0.35 * (1.0 if same_cat else 0.0) * spatial_penalty
                )
                if penalty > max_penalty:
                    max_penalty = penalty

            mmr_val = mmr_lambda * score_i - (1.0 - mmr_lambda) * max_penalty
            if mmr_val > best_mmr:
                best_mmr = mmr_val
                best_idx = idx

        selected.append(remaining.pop(best_idx))

    return selected


class HybridRetriever:
    """Executes single-roundtrip SQL RRF search, composite reranking, and MMR diversification."""

    @classmethod
    async def search_hybrid(
        cls,
        session: AsyncSession,
        city: str,
        city_id: str | None = None,
        query_vec: list[float] | None = None,
        clean_query: str = "",
        required_facets: dict[str, Any] | None = None,
        max_tier: int | None = None,
        max_cost_eur: float | None = None,
        require_rain_friendly: bool = False,
        limit: int = 50,
        w_vec: float = 0.50,
        w_fts: float = 0.30,
        w_trgm: float = 0.20,
        apply_mmr: bool = True,
        mmr_lambda: float = 0.70,
    ) -> list[dict[str, Any]]:
        """Searches POIs combining Vector + FTS + Trigram via SQL CTE with pgvector iterative scan."""
        has_vec = query_vec is not None and len(query_vec) == 768
        has_text = bool(clean_query and clean_query.strip())

        # Optimize pgvector 0.8+ query execution
        try:
            await session.execute(
                text("SET LOCAL hnsw.iterative_scan = 'relaxed_order'")
            )
            await session.execute(text("SET LOCAL hnsw.ef_search = 100"))
        except Exception as e:
            logger.debug("Could not set hnsw settings: %s", e)

        vec_str = (
            "[" + ",".join(str(f) for f in query_vec) + "]" if has_vec else "[0.0]"
        )

        # Unified SQL CTE matching PLAN.md
        sql_query = text("""
        WITH city_scope AS (
          SELECT * FROM attractions
          WHERE (CAST(:city_id AS text) IS NOT NULL AND city_id = CAST(:city_id AS text) OR lower(city) = lower(CAST(:city AS text)))
            AND (CAST(:max_tier AS integer) IS NULL OR tier <= CAST(:max_tier AS integer))
            AND (CAST(:max_cost_eur AS float) IS NULL OR cost_eur <= CAST(:max_cost_eur AS float))
            AND (CAST(:require_rain_friendly AS boolean) = FALSE OR (facets->>'rain_friendly')::boolean = TRUE)
        ),
        semantic_rank AS (
          SELECT id,
                 1.0 - (embedding <=> CAST(:query_vec AS vector)) AS vec_sim,
                 ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:query_vec AS vector)) AS r_vec
          FROM city_scope
          WHERE CAST(:has_vec AS boolean) = TRUE AND embedding IS NOT NULL
          ORDER BY embedding <=> CAST(:query_vec AS vector)
          LIMIT 150
        ),
        fts_rank AS (
          SELECT id,
                 ts_rank_cd(
                   to_tsvector('simple', immutable_unaccent(coalesce(name,'') || ' ' || coalesce(neighborhood,'') || ' ' || coalesce(description,''))),
                   websearch_to_tsquery('simple', immutable_unaccent(CAST(:clean_query AS text)))
                 ) AS fts_score,
                 ROW_NUMBER() OVER (
                   ORDER BY ts_rank_cd(
                     to_tsvector('simple', immutable_unaccent(coalesce(name,'') || ' ' || coalesce(neighborhood,'') || ' ' || coalesce(description,''))),
                     websearch_to_tsquery('simple', immutable_unaccent(CAST(:clean_query AS text)))
                   ) DESC
                 ) AS r_fts
          FROM city_scope
          WHERE CAST(:has_text AS boolean) = TRUE
            AND to_tsvector('simple', immutable_unaccent(coalesce(name,'') || ' ' || coalesce(neighborhood,'') || ' ' || coalesce(description,'')))
                @@ websearch_to_tsquery('simple', immutable_unaccent(CAST(:clean_query AS text)))
          LIMIT 100
        ),
        trgm_rank AS (
          SELECT id,
                 GREATEST(
                   similarity(immutable_unaccent(lower(name)), immutable_unaccent(lower(CAST(:clean_query AS text)))),
                   COALESCE((SELECT MAX(similarity(immutable_unaccent(lower(a)), immutable_unaccent(lower(CAST(:clean_query AS text))))) FROM unnest(coalesce(aliases, ARRAY[]::varchar[])) a), 0.0)
                 ) AS trgm_sim,
                 ROW_NUMBER() OVER (
                   ORDER BY GREATEST(
                     similarity(immutable_unaccent(lower(name)), immutable_unaccent(lower(CAST(:clean_query AS text)))),
                     COALESCE((SELECT MAX(similarity(immutable_unaccent(lower(a)), immutable_unaccent(lower(CAST(:clean_query AS text))))) FROM unnest(coalesce(aliases, ARRAY[]::varchar[])) a), 0.0)
                   ) DESC
                 ) AS r_trgm
          FROM city_scope
          WHERE CAST(:has_text AS boolean) = TRUE
            AND (
              immutable_unaccent(lower(name)) % immutable_unaccent(lower(CAST(:clean_query AS text)))
              OR EXISTS (SELECT 1 FROM unnest(coalesce(aliases, ARRAY[]::varchar[])) a WHERE immutable_unaccent(lower(a)) % immutable_unaccent(lower(CAST(:clean_query AS text))))
            )
          LIMIT 50
        )
        SELECT c.*,
               COALESCE(s.vec_sim, 0.0) AS vec_sim,
               COALESCE(t.trgm_sim, 0.0) AS trgm_sim,
               (
                 COALESCE(1.0 / (60 + s.r_vec), 0.0) * CAST(:w_vec AS float) +
                 COALESCE(1.0 / (60 + f.r_fts), 0.0) * CAST(:w_fts AS float) +
                 COALESCE(1.0 / (60 + t.r_trgm), 0.0) * CAST(:w_trgm AS float)
               ) AS rrf_score
        FROM city_scope c
        LEFT JOIN semantic_rank s ON c.id = s.id
        LEFT JOIN fts_rank f ON c.id = f.id
        LEFT JOIN trgm_rank t ON c.id = t.id
        WHERE (CAST(:has_vec AS boolean) = FALSE AND CAST(:has_text AS boolean) = FALSE)
           OR s.id IS NOT NULL OR f.id IS NOT NULL OR t.id IS NOT NULL
        ORDER BY rrf_score DESC, c.iconicity_score DESC
        LIMIT 200;
        """)

        params = {
            "city": city,
            "city_id": city_id,
            "has_vec": has_vec,
            "has_text": has_text,
            "query_vec": vec_str,
            "clean_query": clean_query.strip(),
            "max_tier": max_tier,
            "max_cost_eur": max_cost_eur,
            "require_rain_friendly": require_rain_friendly,
            "w_vec": w_vec if has_vec else 0.0,
            "w_fts": w_fts if has_text else 0.0,
            "w_trgm": w_trgm if has_text else 0.0,
        }

        res = await session.execute(sql_query, params)
        rows = res.mappings().all()

        candidates: list[dict[str, Any]] = [dict(row) for row in rows]
        if not candidates:
            return []

        # 2. Composite Reranking
        rrf_scores = [c.get("rrf_score", 0.0) for c in candidates]
        max_rrf = max(rrf_scores) if rrf_scores else 1.0
        min_rrf = min(rrf_scores) if rrf_scores else 0.0
        range_rrf = max_rrf - min_rrf

        for c in candidates:
            raw_rrf = c.get("rrf_score", 0.0)
            norm_rrf = (
                (raw_rrf - min_rrf) / range_rrf
                if range_rrf > 1e-6
                else (1.0 if raw_rrf > 0 else 0.0)
            )

            iconicity = float(c.get("iconicity_score") or 0.0)
            facet_match = compute_facet_match_score(c.get("facets"), required_facets)
            doc_bonus = compute_doc_quality_bonus(c.get("doc_quality"))

            # Composite Score formula
            comp_score = (
                0.55 * norm_rrf
                + 0.25 * iconicity
                + 0.12 * facet_match
                + 0.08 * doc_bonus
            )
            c["composite_score"] = round(comp_score, 4)
            c["norm_rrf"] = round(norm_rrf, 4)
            c["facet_match"] = round(facet_match, 4)
            c["doc_quality_bonus"] = doc_bonus

        candidates.sort(key=lambda x: x.get("composite_score", 0.0), reverse=True)

        # 3. Spatial-Semantic MMR Diversification
        if apply_mmr:
            return apply_spatial_semantic_mmr(
                candidates, limit=limit, mmr_lambda=mmr_lambda
            )

        return candidates[:limit]
