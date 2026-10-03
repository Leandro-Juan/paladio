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


def _poi_to_candidate(
    poi: Poi,
    taste_score: float | None = None,
    is_mandatory: bool = False,
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

    t_score = taste_score
    if t_score is None:
        # Default baseline calibrated against iconicity (Amendment A3)
        t_score = round(float(poi.iconicity_score) * 75.0, 2)

    is_meal = _is_meal_poi(poi)

    return CandidatePoi(
        id=str(poi.id or poi.name),
        name=poi.name,
        city=poi.city,
        tier=poi.tier,
        tier_confidence=poi.tier_confidence,
        tier_source=poi.tier_source,
        iconicity_score=poi.iconicity_score,
        taxonomy_category=poi.taxonomy_category,
        category_id=poi.category_id,
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


async def build_candidate_pool(
    city: str,
    poi_repo: IPoiRepository,
    user_vector: list[float] | None = None,
    constraints: TravelConstraints | None = None,
    semantic_limit: int = 50,
) -> list[CandidatePoi]:
    """Assembles the complete candidate pool for trip-level selection."""
    pool: dict[str, CandidatePoi] = {}

    # 1. Guaranteed Tier 1 and Tier 2 POIs for the city
    try:
        tiered_pois = await poi_repo.find_tiered_pois(city, max_tier=2)
        for p in tiered_pois:
            pool[p.id or p.name] = _poi_to_candidate(p)
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
                # Map similarity [0.0, 1.0] to taste score [0.0, 100.0]
                taste = round(float(sim) * 100.0, 2)
                p_id = poi.id or poi.name
                if p_id in pool:
                    # Update existing tiered POI with its personalized taste score
                    pool[p_id].taste_score = taste
                else:
                    pool[p_id] = _poi_to_candidate(poi, taste_score=taste)
            logger.info(
                f"Candidate pool expanded with {semantic_hits} semantic candidates."
            )
        except Exception as e:
            logger.warning(f"Semantic candidate retrieval skipped for {city}: {e}")

    # 2b. Deterministic Tier-3 fill (iconicity-ranked) when taste retrieval yields
    # nothing (no user vector or city not yet embedded). Taste is then pure iconicity.
    if semantic_hits == 0:
        city_pois = await poi_repo.find_by_city(city)
        fill = sorted(
            (
                p
                for p in city_pois
                if (p.id or p.name) not in pool and not _is_meal_poi(p)
            ),
            key=lambda p: (-float(p.iconicity_score), p.name),
        )[:semantic_limit]
        for p in fill:
            pool[p.id or p.name] = _poi_to_candidate(p)
        logger.info(f"Candidate pool filled with {len(fill)} iconicity-ranked POIs.")

    # 2c. Real dining venues (never synthesized)
    meal_spots = await poi_repo.find_meal_spots(city)
    for p in meal_spots:
        pool.setdefault(p.id or p.name, _poi_to_candidate(p))
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
