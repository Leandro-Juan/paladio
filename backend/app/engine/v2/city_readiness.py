"""City readiness: guarantees that ANY city can be planned.

If a city has no tiered sights / dining venues in the store, it is ingested from
OpenStreetMap, tiered relative to the city itself, persisted, and (optionally)
embedded with the local embedding model so taste retrieval works too.
"""

import asyncio
import logging
from dataclasses import dataclass, field

from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.v2.tiering import tier_city_attractions
from app.infrastructure.providers.osm_city_ingest import (
    CityGeo,
    fetch_city_records,
    geocode_city,
)

logger = logging.getLogger(__name__)

MIN_TIERED_SIGHTS = 3
MIN_DINING_VENUES = 5

_city_locks: dict[str, asyncio.Lock] = {}


@dataclass
class CityReadiness:
    city: str
    ingested: bool
    tier1: int
    tier2: int
    dining: int
    geo: CityGeo | None = None
    notes: list[str] = field(default_factory=list)


def normalize_city_name(city: str) -> str:
    return " ".join(city.strip().split()).title()


async def _count_state(city: str, poi_repo: IPoiRepository) -> tuple[int, int, int]:
    tiered = await poi_repo.find_tiered_pois(city, max_tier=2)
    dining = await poi_repo.find_meal_spots(city)
    t1 = sum(1 for p in tiered if p.tier == 1)
    t2 = sum(1 for p in tiered if p.tier == 2)
    return t1, t2, len(dining)


async def ensure_city_ready(city: str, poi_repo: IPoiRepository) -> CityReadiness:
    """Ingests + tiers the city if needed. Raises CityIngestError on failure."""
    name = normalize_city_name(city)
    lock = _city_locks.setdefault(name.lower(), asyncio.Lock())
    async with lock:
        t1, t2, dining = await _count_state(name, poi_repo)
        if t1 + t2 >= MIN_TIERED_SIGHTS and dining >= MIN_DINING_VENUES:
            return CityReadiness(name, False, t1, t2, dining)

        logger.info(
            f"City '{name}' not ready (T1={t1} T2={t2} dining={dining}); ingesting."
        )
        geo = await geocode_city(city)
        records = await fetch_city_records(geo)
        tiered = tier_city_attractions(records, name)
        await poi_repo.save_tiered_for_city(name, tiered)

        t1, t2, dining = await _count_state(name, poi_repo)
        notes: list[str] = []
        if dining < MIN_DINING_VENUES:
            notes.append(
                f"Only {dining} dining venues known: meals will be left at leisure."
            )
        return CityReadiness(name, True, t1, t2, dining, geo=geo, notes=notes)
