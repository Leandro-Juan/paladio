"""SQLAlchemy adapter implementing ICityRepository port."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CityModel
from app.domain.entities.city import City
from app.domain.interfaces.city_repository import ICityRepository

logger = logging.getLogger(__name__)


def model_to_city(m: CityModel) -> City:
    return City(
        id=m.id,
        name=m.name,
        aliases=list(m.aliases or []),
        country_code=m.country_code,
        center_lat=float(m.center_lat),
        center_lon=float(m.center_lon),
        bbox=[float(x) for x in m.bbox],
        radius_km=float(m.radius_km),
        timezone=m.timezone,
        currency=m.currency,
        profile=dict(m.profile or {}),
        ingested_at=m.ingested_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


class SqlCityRepository(ICityRepository):
    """PostgreSQL implementation of City repository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, city_id: str) -> City | None:
        cid = city_id.strip().lower()
        stmt = select(CityModel).where(CityModel.id == cid)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        return model_to_city(m) if m else None

    async def find_by_name_or_alias(self, query: str) -> City | None:
        q = query.strip().lower()
        if not q:
            return None

        # 1. Exact match on id
        stmt = select(CityModel).where(CityModel.id == q)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if m:
            return model_to_city(m)

        # 2. Case-insensitive match on name
        stmt = select(CityModel).where(func.lower(CityModel.name) == q)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if m:
            return model_to_city(m)

        # 3. Match within aliases array (case-insensitive)
        stmt = select(CityModel).where(
            func.lower(func.array_to_string(CityModel.aliases, " ")).like(f"%{q}%")
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if m:
            return model_to_city(m)

        return None

    async def save_city(self, city: City) -> City:
        norm_aliases = list(
            dict.fromkeys([a.strip().lower() for a in city.aliases if a.strip()])
        )
        vals = {
            "id": city.id,
            "name": city.name,
            "aliases": norm_aliases,
            "country_code": city.country_code,
            "center_lat": city.center_lat,
            "center_lon": city.center_lon,
            "bbox": city.bbox,
            "radius_km": city.radius_km,
            "timezone": city.timezone,
            "currency": city.currency,
            "profile": city.profile,
            "ingested_at": city.ingested_at or func.now(),
        }

        stmt = pg_insert(CityModel).values(**vals)
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=[CityModel.id],
            set_={
                "name": stmt.excluded.name,
                "aliases": stmt.excluded.aliases,
                "country_code": stmt.excluded.country_code,
                "center_lat": stmt.excluded.center_lat,
                "center_lon": stmt.excluded.center_lon,
                "bbox": stmt.excluded.bbox,
                "radius_km": stmt.excluded.radius_km,
                "timezone": stmt.excluded.timezone,
                "currency": stmt.excluded.currency,
                "profile": stmt.excluded.profile,
                "ingested_at": stmt.excluded.ingested_at,
                "updated_at": func.now(),
            },
        )
        await self.session.execute(upsert_stmt)
        await self.session.commit()
        return city

    async def list_cities(self) -> list[City]:
        stmt = select(CityModel).order_by(CityModel.name.asc())
        res = await self.session.execute(stmt)
        return [model_to_city(m) for m in res.scalars().all()]
