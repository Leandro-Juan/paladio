"""Candidate Pool Builder for Paladio Itinerary v2.

Constructs an exhaustive candidate pool combining:
1. 100% of Tier 1 & Tier 2 city POIs (never depending on retrieval luck)
2. Semantic pgvector taste candidates (3-5x needed capacity)
3. Explicit user-mandatory POIs
4. Meal candidate spots
"""

import logging
import zlib
from datetime import datetime, timezone
from typing import Any

import numpy as np
from app.domain.entities.poi import Poi
from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.scoring.learned_ranker import TasteRankerModel
from app.engine.scoring.semantic_learning import SemanticLearningEngine
from app.schemas.itinerary import TravelConstraints
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class CandidatePoi(BaseModel):
    """Unified POI representation in the v2 candidate pool."""

    id: str
    name: str
    city: str
    category: str = "attraction"
    tier: int = 3
    tier_confidence: str = "low"
    tier_source: str = "heuristic"
    iconicity_score: float = 0.0
    taxonomy_category: str = "art_culture"
    category_id: int = 0
    visit_mode: str = "full"
    duration_mins: int = 60
    cost_eur: float = 0.0
    location: dict[str, float] = Field(default_factory=dict)
    open_time_mins_by_day: list[int] = Field(default_factory=lambda: [480] * 7)
    close_time_mins_by_day: list[int] = Field(default_factory=lambda: [1320] * 7)
    taste_score: float = 50.0
    is_mandatory: bool = False
    is_meal_spot: bool = False
    meal_types: list[str] = Field(default_factory=list)
    embedding: list[float] | None = None
    description: str | None = None
    neighborhood: str | None = None
    facets: dict[str, Any] = Field(default_factory=dict)
    doc_quality: str = "C"
    hours_known: bool = False

    model_config = ConfigDict(extra="allow")


def _is_meal_poi(poi: Poi) -> bool:
    return (
        poi.category.lower() in ("restaurant", "food", "cafe", "bistrot", "bakery")
        or poi.taxonomy_category == "food_culinary"
    )


def _season_key_for_constraints(constraints: TravelConstraints | None) -> str | None:
    start_dt = getattr(constraints, "start_date", None) if constraints else None
    if not start_dt:
        return None
    month = getattr(start_dt, "month", None)
    if month is None:
        return None
    if month in (12, 1, 2):
        return "season:winter"
    if month in (3, 4, 5):
        return "season:spring"
    if month in (6, 7, 8):
        return "season:summer"
    return "season:autumn"


def _is_poi_mandatory(poi: Poi, constraints: TravelConstraints | None) -> bool:
    if not constraints or not constraints.nodes:
        return False
    pid = str(poi.id or "").strip().lower()
    pname = str(poi.name or "").strip().lower()
    for n in constraints.nodes:
        if not getattr(n, "mandatory", True):
            continue
        nid = str(getattr(n, "poi_id", "") or "").strip().lower()
        if nid and (nid == pid or nid == pname or (pname and nid in pname)):
            return True
    return False


def compute_taste_score(
    poi: Poi,
    constraints: TravelConstraints | None = None,
    base_similarity: float | None = None,
) -> float:
    """Computes a taste match score (0.0 to 100.0) reflecting user prompt and learned multi-traveler profile."""
    tp = (getattr(constraints, "taste_profile", None) or {}) if constraints else {}
    if not isinstance(tp, dict):
        tp = {}

    is_mandatory = _is_poi_mandatory(poi, constraints)

    # Resolve canonical taxonomy category
    tax_cat = poi.taxonomy_category
    if (not tax_cat or tax_cat in ("unknown", "art_culture")) and (
        poi.name or poi.category
    ):
        from app.engine.taxonomy import classify_poi_taxonomy

        meta_dict = (
            poi.metadata
            if isinstance(poi.metadata, dict)
            else (
                poi.metadata.model_dump()
                if hasattr(poi.metadata, "model_dump")
                else None
            )
        )
        derived_cat, _ = classify_poi_taxonomy(poi.name, poi.category, meta_dict)
        if derived_cat != "unknown":
            tax_cat = derived_cat

    # 0. Hard veto check (from any group traveler's hard dislike or "do not repeat" veto)
    poi_priors = tp.get("poi_priors") if isinstance(tp.get("poi_priors"), dict) else {}
    poi_prior = poi_priors.get(str(poi.id or "")) or poi_priors.get(poi.name) or {}
    if not is_mandatory:
        if isinstance(poi_prior, dict) and poi_prior.get("hard_veto"):
            return 0.0
        vetoed_cats = tp.get("vetoed_categories") or []
        prompt_aff = (
            float(constraints.tag_affinities.get(tax_cat, 0.0))
            if (constraints and constraints.tag_affinities)
            else 0.0
        )
        if tax_cat in vetoed_cats and prompt_aff < 0.65:
            return 0.0

    # 1. Base score from similarity, profile 768D vector, or iconicity
    tp_emb = tp.get("embedding")
    poi_emb = getattr(poi, "embedding", None)
    has_vectors = (
        isinstance(tp_emb, list)
        and len(tp_emb) == 768
        and isinstance(poi_emb, list)
        and len(poi_emb) == 768
    )
    vec_sim = 0.5
    if has_vectors:
        u_norm = SemanticLearningEngine.normalize_vector(tp_emb)
        p_norm = SemanticLearningEngine.normalize_vector(poi_emb)
        raw_cos = float(np.dot(u_norm, p_norm))
        vec_sim = float(np.clip((raw_cos + 1.0) / 2.0, 0.0, 1.0))

    if base_similarity is not None:
        base_score = float(base_similarity) * 100.0
        if not has_vectors:
            vec_sim = float(np.clip(base_similarity, 0.0, 1.0))
    else:
        base_score = float(poi.iconicity_score) * 55.0 + 20.0
        if has_vectors:
            base_score = 0.50 * base_score + 0.50 * (vec_sim * 100.0)

    if not constraints:
        return round(max(0.0, min(100.0, base_score)), 2)

    t_score = base_score

    # 2. Tag affinities (session prompt blended with merged long-term profile + contextual sub-profile)
    eff_affinity: float | None = None
    if constraints.tag_affinities and tax_cat in constraints.tag_affinities:
        eff_affinity = float(constraints.tag_affinities[tax_cat])
    elif isinstance(tp.get("tag_affinities"), dict) and tax_cat in tp["tag_affinities"]:
        eff_affinity = float(tp["tag_affinities"][tax_cat])

    ctx_fit = eff_affinity if eff_affinity is not None else 0.5
    if eff_affinity is not None:
        ctx_profiles = tp.get("contextual_profiles") or {}
        season_key = _season_key_for_constraints(constraints)
        if (
            season_key
            and isinstance(ctx_profiles.get(season_key), dict)
            and tax_cat in ctx_profiles[season_key]
        ):
            ctx_val = float(ctx_profiles[season_key][tax_cat])
            ctx_fit = ctx_val
            eff_affinity = 0.80 * eff_affinity + 0.20 * ctx_val
        t_score = 0.35 * t_score + 0.65 * (eff_affinity * 100.0)

    # 3. Travel tastes keywords matching (e.g., ['bar', 'view', 'rooftop', 'modern'])
    if constraints.travel_tastes:
        taste_kws = [
            t.lower().strip() for t in constraints.travel_tastes if t and t.strip()
        ]
        if taste_kws:
            corpus = f"{poi.name} {poi.category} {tax_cat}".lower()
            if poi.metadata and isinstance(poi.metadata, dict):
                tags_val = (
                    poi.metadata.get("tags")
                    or (
                        poi.metadata.get("osm", {}).get("tags")
                        if isinstance(poi.metadata.get("osm"), dict)
                        else ""
                    )
                    or ""
                )
                corpus += f" {tags_val}".lower()
            matches = sum(1 for kw in taste_kws if kw in corpus)
            if matches > 0:
                bonus = min(25.0, matches * 12.0)
                t_score = min(100.0, t_score + bonus)

    # 4. Preferred cuisines matching + food price elasticity
    cuisines_pool = list(constraints.preferred_cuisines or [])
    if not cuisines_pool and isinstance(tp.get("preferred_cuisines"), list):
        cuisines_pool = list(tp["preferred_cuisines"])
    is_meal = _is_meal_poi(poi)
    if cuisines_pool and is_meal:
        cuisines = [c.lower().strip() for c in cuisines_pool if c and c.strip()]
        corpus = (
            f"{poi.name} {poi.category} {getattr(poi, 'description', '') or ''}".lower()
        )
        if any(c in corpus for c in cuisines):
            t_score = min(100.0, t_score + 20.0)

    econ = (
        tp.get("economic_profile")
        if isinstance(tp.get("economic_profile"), dict)
        else {}
    )
    price_sens = float(econ.get("price_sensitivity", 0.5))
    if is_meal and getattr(poi, "cost_eur", 0.0) and price_sens > 0.55:
        t_score -= (price_sens - 0.5) * (min(float(poi.cost_eur), 100.0) / 100.0) * 15.0

    # 5. Per-POI learned prior & repeat-visit decaying penalty
    repeat_pen_norm = 0.0
    if isinstance(poi_prior, dict) and poi_prior:
        t_score += float(poi_prior.get("score_delta", 0.0))
        visited_cnt = int(poi_prior.get("visited_count", 0) or 0)
        if visited_cnt > 0 and not is_mandatory:
            days_since = 0.0
            last_v = poi_prior.get("last_visited_at")
            if last_v:
                try:
                    dt = datetime.fromisoformat(str(last_v))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    days_since = max(
                        0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
                    )
                except ValueError:
                    days_since = 0.0
            decay = 0.5 ** (days_since / 180.0)
            repeat_pen = 25.0 * decay
            repeat_pen_norm = float(decay)
            t_score -= repeat_pen

    # 6. Deterministic seeded exploration bonus (uncertainty-driven to avoid filter bubbles)
    unc = float((tp.get("tag_uncertainties") or {}).get(tax_cat, 0.0))
    if unc > 0.12:
        h = zlib.crc32(f"{tp.get('version', 1)}:{poi.id or poi.name}".encode("utf-8"))
        if (h % 100) < 15:
            t_score += min(12.0, unc * 45.0)

    # 7. Learned ranker blend when sufficient samples exist
    rw = tp.get("ranker_weights")
    if isinstance(rw, dict) and int(rw.get("n_samples", 0)) >= 5:
        trav_affs = tp.get("traveler_affinities") or {}
        if trav_affs and isinstance(trav_affs, dict):
            g_min_aff = min(
                float(tmap.get(tax_cat, 0.5))
                for tmap in trav_affs.values()
                if isinstance(tmap, dict)
            )
        else:
            g_min_aff = eff_affinity if eff_affinity is not None else 0.5
        feat = TasteRankerModel.build_feature_vector(
            sim_768d=vec_sim,
            cat_affinity=eff_affinity if eff_affinity is not None else 0.5,
            cat_uncertainty=unc,
            iconicity=float(getattr(poi, "iconicity_score", 0.5)),
            tier=int(getattr(poi, "tier", 3)),
            cost_eur=float(getattr(poi, "cost_eur", 0.0)),
            duration_mins=int(getattr(poi, "duration_mins", 60)),
            time_of_day_fit=0.5,
            context_fit=ctx_fit,
            is_meal=is_meal,
            price_sensitivity=price_sens,
            distance_km=1.5,
            repeat_penalty=repeat_pen_norm,
            group_min_affinity=g_min_aff,
        )
        r_score = float(TasteRankerModel.predict_score(feat, rw)[0])
        alpha_r = min(0.40, float(rw["n_samples"]) / 80.0)
        t_score = (1.0 - alpha_r) * t_score + alpha_r * r_score

    return round(max(0.0, min(100.0, t_score)), 2)


def _poi_to_candidate(
    poi: Poi,
    taste_score: float | None = None,
    is_mandatory: bool = False,
    constraints: TravelConstraints | None = None,
) -> CandidatePoi:
    lat = None
    lon = None
    if hasattr(poi.location, "latitude"):
        lat = poi.location.latitude
        lon = poi.location.longitude
    elif isinstance(poi.location, dict):
        lat = poi.location.get("latitude")
        lon = poi.location.get("longitude")

    lat_val = float(lat) if lat is not None else 0.0
    lon_val = float(lon) if lon is not None else 0.0

    if taste_score is not None:
        t_score = taste_score
    else:
        t_score = compute_taste_score(poi, constraints=constraints)

    is_meal = _is_meal_poi(poi)

    tax_cat = poi.taxonomy_category
    cat_id = poi.category_id
    if (not tax_cat or tax_cat in ("unknown", "art_culture")) and (
        poi.name or poi.category
    ):
        from app.engine.taxonomy import classify_poi_taxonomy

        meta_dict = (
            poi.metadata
            if isinstance(poi.metadata, dict)
            else (
                poi.metadata.model_dump()
                if hasattr(poi.metadata, "model_dump")
                else None
            )
        )
        d_cat, d_id = classify_poi_taxonomy(poi.name, poi.category, meta_dict)
        if d_cat != "unknown":
            tax_cat = d_cat
            cat_id = d_id

    meta_dict = (
        poi.metadata
        if isinstance(poi.metadata, dict)
        else (poi.metadata.model_dump() if hasattr(poi.metadata, "model_dump") else {})
    ) or {}
    tags_dict = meta_dict.get("tags") if isinstance(meta_dict.get("tags"), dict) else {}
    access_val = str(
        tags_dict.get("access")
        or meta_dict.get("access")
        or (
            meta_dict.get("osm", {}).get("access")
            if isinstance(meta_dict.get("osm"), dict)
            else ""
        )
        or ""
    ).lower()
    tourism_val = str(
        tags_dict.get("tourism")
        or meta_dict.get("tourism")
        or (
            meta_dict.get("osm", {}).get("tourism")
            if isinstance(meta_dict.get("osm"), dict)
            else ""
        )
        or ""
    ).lower()
    c_tier = (
        4
        if (access_val in ("private", "no", "military") or tourism_val == "no")
        else poi.tier
    )

    return CandidatePoi(
        id=str(poi.id or poi.name),
        name=poi.name,
        city=poi.city,
        category=poi.category,
        tier=c_tier,
        tier_confidence=poi.tier_confidence,
        tier_source=poi.tier_source,
        iconicity_score=poi.iconicity_score,
        taxonomy_category=tax_cat,
        category_id=cat_id,
        visit_mode=poi.visit_mode,
        duration_mins=poi.duration_mins,
        cost_eur=poi.cost_eur,
        location={"latitude": lat_val, "longitude": lon_val},
        open_time_mins_by_day=list(poi.open_time_mins_by_day),
        close_time_mins_by_day=list(poi.close_time_mins_by_day),
        taste_score=float(t_score),
        is_mandatory=is_mandatory,
        is_meal_spot=is_meal,
        embedding=poi.embedding,
        description=getattr(poi, "description", None),
        neighborhood=getattr(poi, "neighborhood", None),
        facets=getattr(poi, "facets", None) or {},
        doc_quality=getattr(poi, "doc_quality", "C") or "C",
        hours_known=bool(getattr(poi, "hours_known", False)),
    )


def _is_transit_poi(poi: Any) -> bool:
    """Detects public transit stations, subway entrances, and transit nodes."""
    pid = str(getattr(poi, "id", "") or "")
    if pid.startswith("OSM-transit-"):
        return True
    cat = (getattr(poi, "category", "") or "").lower()
    if cat in ("transit", "metro", "train", "bus_stop", "tram", "subway", "station"):
        return True
    meta = getattr(poi, "metadata", None)
    if isinstance(meta, dict):
        tags = meta.get("tags") if isinstance(meta.get("tags"), dict) else {}
        if (
            tags.get("railway") in ("subway_entrance", "stop", "station")
            or tags.get("subway") == "yes"
        ):
            return True
    return False


def _add_or_update_pool(
    pool: dict[str, CandidatePoi],
    name_to_id: dict[str, str],
    cand: CandidatePoi,
) -> None:
    from app.engine.selection import normalize_poi_name
    from app.engine.transit_matrix import haversine_distance

    norm_name = normalize_poi_name(cand.name)
    if not norm_name:
        return

    # 1. Exact normalized name match (e.g. Puerta de Alcalá vs Puerta de Alcala)
    if norm_name in name_to_id:
        existing_id = name_to_id[norm_name]
        existing = pool[existing_id]
        # Keep better tier (lower number) or higher iconicity
        if cand.tier < existing.tier or (
            cand.tier == existing.tier
            and cand.iconicity_score > existing.iconicity_score
        ):
            del pool[existing_id]
            pool[cand.id] = cand
            name_to_id[norm_name] = cand.id
        elif cand.taste_score > existing.taste_score:
            existing.taste_score = cand.taste_score
        return

    # 2. Near-duplicate spatial and token matching (e.g. Museo Reina Sofía vs Museo Nacional Centro de Arte Reina Sofía)
    c_lat = cand.location.get("latitude") if isinstance(cand.location, dict) else 0.0
    c_lon = cand.location.get("longitude") if isinstance(cand.location, dict) else 0.0
    cand_tokens = set(norm_name.split()) - {
        "de",
        "del",
        "el",
        "la",
        "los",
        "las",
        "y",
        "en",
        "museo",
        "centro",
        "arte",
        "nacional",
    }

    if c_lat and c_lon:
        for existing_id, existing in list(pool.items()):
            e_lat = (
                existing.location.get("latitude")
                if isinstance(existing.location, dict)
                else 0.0
            )
            e_lon = (
                existing.location.get("longitude")
                if isinstance(existing.location, dict)
                else 0.0
            )
            if e_lat and e_lon:
                dist = haversine_distance(c_lat, c_lon, e_lat, e_lon)
                if dist <= 0.25:  # within 250 meters
                    e_norm = normalize_poi_name(existing.name)
                    e_tokens = set(e_norm.split()) - {
                        "de",
                        "del",
                        "el",
                        "la",
                        "los",
                        "las",
                        "y",
                        "en",
                        "museo",
                        "centro",
                        "arte",
                        "nacional",
                    }
                    if (
                        cand_tokens
                        and e_tokens
                        and (
                            cand_tokens == e_tokens
                            or cand_tokens.issubset(e_tokens)
                            or e_tokens.issubset(cand_tokens)
                        )
                    ):
                        if cand.tier < existing.tier or (
                            cand.tier == existing.tier
                            and cand.iconicity_score > existing.iconicity_score
                        ):
                            del pool[existing_id]
                            if e_norm in name_to_id:
                                del name_to_id[e_norm]
                            pool[cand.id] = cand
                            name_to_id[norm_name] = cand.id
                        return

    pool[cand.id] = cand
    name_to_id[norm_name] = cand.id


async def build_candidate_pool(
    city: str,
    poi_repo: IPoiRepository,
    user_vector: list[float] | None = None,
    constraints: TravelConstraints | None = None,
    semantic_limit: int = 50,
) -> list[CandidatePoi]:
    """Assembles the complete candidate pool for trip-level selection."""
    pool: dict[str, CandidatePoi] = {}
    name_to_id: dict[str, str] = {}

    # 1. Guaranteed Tier 1 and Tier 2 POIs for the city
    try:
        tiered_pois = await poi_repo.find_tiered_pois(city, max_tier=2)
        for p in tiered_pois:
            if _is_transit_poi(p):
                continue
            cand = _poi_to_candidate(p, constraints=constraints)
            if cand.tier <= 2:
                _add_or_update_pool(pool, name_to_id, cand)
        logger.info(
            f"Candidate pool seeded with {len(pool)} Tier 1 & 2 POIs for {city}."
        )
    except Exception as e:
        logger.warning(f"Could not load tiered POIs for {city}: {e}")

    # 2. Semantic & Hybrid MMR taste candidates
    semantic_hits = 0
    clean_query = (
        " ".join(constraints.travel_tastes)
        if constraints and constraints.travel_tastes
        else ""
    )
    req_facets = getattr(constraints, "required_facets", None)
    if (not user_vector or len(user_vector) != 768) and constraints:
        tp = getattr(constraints, "taste_profile", None)
        if (
            isinstance(tp, dict)
            and isinstance(tp.get("embedding"), list)
            and len(tp["embedding"]) == 768
        ):
            user_vector = tp["embedding"]
    if user_vector and len(user_vector) == 768:
        try:
            if hasattr(poi_repo, "find_hybrid_candidates"):
                semantic_candidates = await poi_repo.find_hybrid_candidates(
                    city_name=city,
                    user_vector=user_vector,
                    clean_query=clean_query,
                    required_facets=req_facets,
                    limit=semantic_limit,
                    apply_mmr=True,
                )
            else:
                semantic_candidates = await poi_repo.find_semantic_candidates(
                    city_name=city,
                    user_vector=user_vector,
                    limit=semantic_limit,
                )
            semantic_hits = len(semantic_candidates)
            for poi, sim in semantic_candidates:
                if _is_transit_poi(poi):
                    continue
                taste = compute_taste_score(
                    poi, constraints=constraints, base_similarity=sim
                )
                cand = _poi_to_candidate(
                    poi, taste_score=taste, constraints=constraints
                )
                _add_or_update_pool(pool, name_to_id, cand)
            logger.info(
                f"Candidate pool expanded with {semantic_hits} semantic candidates."
            )
        except Exception as e:
            logger.warning(f"Semantic candidate retrieval skipped for {city}: {e}")

    # 2b. Deterministic fill when taste retrieval yields nothing (no user vector or not yet embedded).
    # Ranked by taste score (reflecting tag_affinities & travel_tastes) and iconicity.
    if semantic_hits == 0:
        from app.engine.selection import normalize_poi_name

        city_pois = await poi_repo.find_by_city(city)
        fill = sorted(
            (
                p
                for p in city_pois
                if (p.id or p.name) not in pool
                and normalize_poi_name(p.name) not in name_to_id
                and not _is_meal_poi(p)
                and not _is_transit_poi(p)
            ),
            key=lambda p: (
                -compute_taste_score(p, constraints=constraints),
                -float(p.iconicity_score),
                p.name,
            ),
        )[:semantic_limit]
        for p in fill:
            cand = _poi_to_candidate(p, constraints=constraints)
            _add_or_update_pool(pool, name_to_id, cand)
        logger.info(
            f"Candidate pool filled with {len(fill)} taste/iconicity-ranked POIs."
        )

    # 2c. Real dining venues (never synthesized)
    meal_spots = await poi_repo.find_meal_spots(city)
    for p in meal_spots:
        cand = _poi_to_candidate(p, constraints=constraints)
        _add_or_update_pool(pool, name_to_id, cand)
    logger.info(f"Candidate pool carries {len(meal_spots)} dining venues for {city}.")

    # 3. Explicit user-mandatory POIs (never substring-match generic words onto dining venues)
    _generic_dining = {
        "street food",
        "local food",
        "fast food",
        "food market",
        "night market",
        "street market",
        "food court",
    }
    if constraints and constraints.nodes:
        mand_names = {
            n.poi_id.strip().lower()
            for n in constraints.nodes
            if getattr(n, "mandatory", True)
            and n.poi_id
            and n.poi_id.strip().lower() not in _generic_dining
        }
        for c in pool.values():
            c_id = c.id.lower()
            c_name = c.name.lower()
            if c_id in mand_names or c_name in mand_names:
                c.is_mandatory = True
            elif not c.is_meal_spot and any(
                len(m) >= 4 and m in c_name for m in mand_names
            ):
                c.is_mandatory = True

    return list(pool.values())
