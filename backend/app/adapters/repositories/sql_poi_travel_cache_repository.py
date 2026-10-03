"""Repository for querying and persisting pairwise POI travel times and costs."""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PoiTravelCacheModel

logger = logging.getLogger(__name__)


class SqlPoiTravelCacheRepository:
    """Manages persistence and retrieval of pairwise travel times between POIs."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_cached_pairs(
        self,
        poi_ids: list[str],
        mode: str = "transit",
    ) -> dict[tuple[str, str], dict[str, float]]:
        """Fetch all cached pairwise travel durations and costs for a given set of POI IDs.

        Returns:
            dict mapping (origin_id, destination_id) to:
                {"duration_mins": float, "cost_eur": float, "distance_km": float}
        """
        if not poi_ids or len(poi_ids) < 2:
            return {}

        stmt = select(PoiTravelCacheModel).where(
            PoiTravelCacheModel.origin_id.in_(poi_ids),
            PoiTravelCacheModel.destination_id.in_(poi_ids),
            PoiTravelCacheModel.mode == mode,
        )

        result = await self.session.execute(stmt)
        rows = result.scalars().all()

        cache: dict[tuple[str, str], dict[str, float]] = {}
        for row in rows:
            cache[(row.origin_id, row.destination_id)] = {
                "duration_mins": row.duration_mins,
                "cost_eur": row.cost_eur,
                "distance_km": row.distance_km,
            }

        return cache

    async def save_travel_pairs(
        self,
        entries: list[dict[str, Any]],
    ) -> None:
        """Upsert pairwise travel cache records in bulk."""
        if not entries:
            return

        stmt = insert(PoiTravelCacheModel).values(entries)
        stmt = stmt.on_conflict_do_update(
            index_elements=["origin_id", "destination_id", "mode"],
            set_={
                "duration_mins": stmt.excluded.duration_mins,
                "cost_eur": stmt.excluded.cost_eur,
                "distance_km": stmt.excluded.distance_km,
            },
        )

        await self.session.execute(stmt)
        await self.session.commit()
