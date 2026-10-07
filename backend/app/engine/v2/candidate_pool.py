"""Candidate Pool Builder for Paladio Itinerary v2.

Constructs an exhaustive candidate pool combining:
1. 100% of Tier 1 & Tier 2 city POIs (never depending on retrieval luck)
2. Semantic pgvector taste candidates (3-5x needed capacity)
3. Explicit user-mandatory POIs
4. Meal candidate spots
"""

import logging

from app.domain.entities.poi import Poi
from app.domain.interfaces.poi_repository import IPoiRepository
from app.schemas.itinerary import TravelConstraints
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class CandidatePoi(BaseModel):
    """Unified POI representation in the v2 candidate pool."""

    id: str
    name: str
    city: str
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

    model_config = ConfigDict(extra="allow")


def _is_meal_poi(poi: Poi) -> bool:
    return (
        poi.category.lower() in ("restaurant", "food", "cafe", "bistrot")
        or poi.taxonomy_category == "food_culinary"
    )


def compute_taste_score(
    poi: Poi,
    constraints: TravelConstraints | None = None,
    base_similarity: float | None = None,
) -> float:
    """Computes a taste match score (0.0 to 100.0) reflecting user prompt and profile."""
    # 1. Base score from similarity or iconicity
    if base_similarity is not None:
        base_score = float(base_similarity) * 100.0
    else:
        # Calibrated baseline from iconicity (20.0 to 75.0)
        base_score = float(poi.iconicity_score) * 55.0 + 20.0

    if not constraints:
        return round(max(0.0, min(100.0, base_score)), 2)

    t_score = base_score

    # 2. Tag affinities from user prompt (art_culture, nightlife, etc.)
    tax_cat = poi.taxonomy_category
    if (not tax_cat or tax_cat in ("unknown", "art_culture")) and (
        poi.name or poi.category
    ):
        from app.engine.v2.taxonomy import classify_poi_taxonomy

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

    if constraints.tag_affinities and tax_cat in constraints.tag_affinities:
        affinity = float(constraints.tag_affinities[tax_cat])
        affinity_score = affinity * 100.0
        # High-weight blend with user's explicit category affinity
        t_score = 0.35 * t_score + 0.65 * affinity_score

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

    # 4. Preferred cuisines matching for food venues
    if constraints.preferred_cuisines and _is_meal_poi(poi):
        cuisines = [
            c.lower().strip() for c in constraints.preferred_cuisines if c and c.strip()
        ]
        corpus = f"{poi.name} {poi.category}".lower()
        if any(c in corpus for c in cuisines):
            t_score = min(100.0, t_score + 20.0)

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
        from app.engine.v2.taxonomy import classify_poi_taxonomy

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

    return CandidatePoi(
        id=str(poi.id or poi.name),
        name=poi.name,
        city=poi.city,
        tier=poi.tier,
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
    )


def _add_or_update_pool(
    pool: dict[str, CandidatePoi],
    name_to_id: dict[str, str],
    cand: CandidatePoi,
) -> None:
    norm_name = cand.name.strip().lower()
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
    else:
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
            cand = _poi_to_candidate(p, constraints=constraints)
            _add_or_update_pool(pool, name_to_id, cand)
        logger.info(
            f"Candidate pool seeded with {len(tiered_pois)} Tier 1 & 2 POIs for {city}."
        )
    except Exception as e:
        logger.warning(f"Could not load tiered POIs for {city}: {e}")

    # 2. Semantic pgvector taste candidates
    semantic_hits = 0
    if user_vector and len(user_vector) == 768:
        try:
            semantic_candidates = await poi_repo.find_semantic_candidates(
                city_name=city,
                user_vector=user_vector,
                limit=semantic_limit,
            )
            semantic_hits = len(semantic_candidates)
            for poi, sim in semantic_candidates:
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
        city_pois = await poi_repo.find_by_city(city)
        fill = sorted(
            (
                p
                for p in city_pois
                if (p.id or p.name) not in pool
                and p.name.strip().lower() not in name_to_id
                and not _is_meal_poi(p)
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

    # 3. Explicit user-mandatory POIs
    if constraints and constraints.nodes:
        mand_names = {
            n.poi_id.strip().lower()
            for n in constraints.nodes
            if getattr(n, "mandatory", True)
        }
        for c in pool.values():
            if (
                c.id.lower() in mand_names
                or c.name.lower() in mand_names
                or any(m in c.name.lower() for m in mand_names)
            ):
                c.is_mandatory = True

    return list(pool.values())
