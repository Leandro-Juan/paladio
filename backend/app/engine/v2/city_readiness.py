"""City readiness: guarantees that ANY city can be planned.

If a city has no tiered sights / dining venues in the store, it is ingested from
OpenStreetMap, tiered relative to the city itself, persisted, and (optionally)
embedded with the local embedding model so taste retrieval works too.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from app.adapters.repositories.sql_city_repository import SqlCityRepository
from app.db.session import async_session
from app.domain.entities.city import City
from app.domain.interfaces.poi_repository import IPoiRepository
from app.domain.reference.iso_currencies import get_country_currency
from app.engine.v2.tiering import tier_city_attractions
from app.infrastructure.providers.osm_city_ingest import (
    CityGeo,
    fetch_city_records,
    geocode_city,
)
from app.utils.timezone_utils import cache_city_timezone
from sqlalchemy import text

logger = logging.getLogger(__name__)

MIN_TIERED_SIGHTS = 8
MIN_DINING_VENUES = 6

try:
    from timezonefinder import TimezoneFinder

    _tf = TimezoneFinder()
except Exception:
    _tf = None


_local_city_locks: dict[str, asyncio.Lock] = {}


@asynccontextmanager
async def _distributed_city_lock(city_key: str):
    """Distributed PostgreSQL advisory lock preventing concurrent ingestion of the same city."""
    lock_str = f"paladio_city_lock_{city_key.lower().strip()}"
    has_db_lock = False
    s = None
    try:
        s = async_session()
        await s.execute(text("SELECT pg_advisory_lock(hashtext(:k))"), {"k": lock_str})
        has_db_lock = True
    except Exception as exc:
        logger.warning(f"Advisory lock acquisition failed ({exc}); using local lock.")
        if s:
            await s.close()
            s = None

    if not has_db_lock:
        lock = _local_city_locks.setdefault(lock_str, asyncio.Lock())
        async with lock:
            yield
        return

    try:
        yield
    finally:
        try:
            if s and has_db_lock:
                await s.execute(
                    text("SELECT pg_advisory_unlock(hashtext(:k))"), {"k": lock_str}
                )
        except Exception:
            pass
        finally:
            if s:
                await s.close()


def is_valid_embedding(emb: list[float] | None, dim: int = 768) -> bool:
    """Verifies that an embedding vector is present, 768D, non-zero, and not a uniform dummy."""
    if not emb or len(emb) != dim:
        return False
    target = 1.0 / (dim**0.5)
    # Check if first and last elements match uniform dummy vector
    if abs(emb[0] - target) < 1e-4 and abs(emb[-1] - target) < 1e-4:
        return False
    return True


@dataclass
class CityCountState:
    tier1: int
    tier2: int
    dining: int
    embedded_tier12_ratio: float = 0.0
    embedded_total_ratio: float = 0.0


@dataclass
class CityReadiness:
    city: str
    ingested: bool
    tier1: int
    tier2: int
    dining: int
    embedded_tier12_ratio: float = 0.0
    embedded_total_ratio: float = 0.0
    geo: CityGeo | None = None
    city_id: str | None = None
    city_entity: City | None = None
    notes: list[str] = field(default_factory=list)


def normalize_city_name(city: str) -> str:
    return " ".join(city.strip().split()).title()


async def _count_state(city: str, poi_repo: IPoiRepository) -> CityCountState:
    tiered = await poi_repo.find_tiered_pois(city, max_tier=2)
    dining = await poi_repo.find_meal_spots(city)
    t1 = sum(1 for p in tiered if p.tier == 1)
    t2 = sum(1 for p in tiered if p.tier == 2)

    tier12 = [p for p in tiered if p.tier in (1, 2)]
    valid_t12_emb = sum(1 for p in tier12 if is_valid_embedding(p.embedding))
    emb_t12_ratio = valid_t12_emb / max(1, len(tier12)) if tier12 else 0.0

    all_pois = list(tiered) + list(dining)
    valid_total_emb = sum(1 for p in all_pois if is_valid_embedding(p.embedding))
    emb_total_ratio = valid_total_emb / max(1, len(all_pois)) if all_pois else 0.0

    return CityCountState(
        tier1=t1,
        tier2=t2,
        dining=len(dining),
        embedded_tier12_ratio=round(emb_t12_ratio, 4),
        embedded_total_ratio=round(emb_total_ratio, 4),
    )


async def ensure_city_ready(city: str, poi_repo: IPoiRepository) -> CityReadiness:
    """Ingests + tiers the city if needed. Raises CityIngestError on failure."""
    name = normalize_city_name(city)
    city_lower = name.lower()

    async with _distributed_city_lock(city_lower):
        active_session = getattr(poi_repo, "session", None)
        if active_session is not None:
            city_repo = SqlCityRepository(active_session)
            city_entity = await city_repo.find_by_name_or_alias(name)
        else:
            async with async_session() as session:
                city_repo = SqlCityRepository(session)
                city_entity = await city_repo.find_by_name_or_alias(name)

        state = await _count_state(name, poi_repo)
        if (
            city_entity is not None
            and state.tier1 >= 2
            and (state.tier1 + state.tier2) >= MIN_TIERED_SIGHTS
            and state.dining >= MIN_DINING_VENUES
            and state.embedded_tier12_ratio >= 0.95
        ):
            if city_entity.timezone:
                cache_city_timezone(city_entity.name, city_entity.timezone)
            return CityReadiness(
                city=name,
                ingested=False,
                tier1=state.tier1,
                tier2=state.tier2,
                dining=state.dining,
                embedded_tier12_ratio=state.embedded_tier12_ratio,
                embedded_total_ratio=state.embedded_total_ratio,
                city_id=city_entity.id,
                city_entity=city_entity,
            )

        logger.info(
            f"City '{name}' not ready (entity={city_entity is not None} T1={state.tier1} T2={state.tier2} dining={state.dining} emb_t12={state.embedded_tier12_ratio:.2f}); ingesting/hydrating."
        )
        need_sights = (state.tier1 + state.tier2) < MIN_TIERED_SIGHTS or state.tier1 < 2
        need_dining = state.dining < MIN_DINING_VENUES
        geo = await geocode_city(city)

        country = (geo.country_code or "XX").upper()
        tz = (_tf.timezone_at(lat=geo.lat, lng=geo.lon) if _tf else None) or "UTC"
        currency = get_country_currency(country)
        canon_id = f"{city_lower}_{country.lower()}"

        city_obj = City(
            id=canon_id,
            name=name,
            aliases=[city_lower, name, geo.display_name],
            country_code=country,
            center_lat=geo.lat,
            center_lon=geo.lon,
            bbox=geo.bbox,
            radius_km=geo.radius_km,
            timezone=tz,
            currency=currency,
            profile={"source": "nominatim_osm"},
        )
        if active_session is not None:
            city_repo = SqlCityRepository(active_session)
            await city_repo.save_city(city_obj)
        else:
            async with async_session() as session:
                city_repo = SqlCityRepository(session)
                await city_repo.save_city(city_obj)

        records = await fetch_city_records(
            geo,
            max_sights=220 if need_sights else 0,
            max_dining=200 if need_dining else 0,
        )
        for r in records:
            r["city_id"] = canon_id

        tiered = tier_city_attractions(records, name)
        for t in tiered:
            t["city_id"] = canon_id

        await poi_repo.save_tiered_for_city(name, tiered)

        final_state = await _count_state(name, poi_repo)
        notes: list[str] = []
        if final_state.dining < MIN_DINING_VENUES:
            notes.append(
                f"Only {final_state.dining} dining venues known: meals will be left at leisure."
            )
        if city_obj and city_obj.timezone:
            cache_city_timezone(city_obj.name, city_obj.timezone)
        return CityReadiness(
            city=name,
            ingested=True,
            tier1=final_state.tier1,
            tier2=final_state.tier2,
            dining=final_state.dining,
            embedded_tier12_ratio=final_state.embedded_tier12_ratio,
            embedded_total_ratio=final_state.embedded_total_ratio,
            geo=geo,
            city_id=canon_id,
            city_entity=city_obj,
            notes=notes,
        )
