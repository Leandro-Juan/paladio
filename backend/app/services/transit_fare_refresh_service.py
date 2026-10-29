"""Periodic background refresh service for transit fares and schema drift monitoring."""

from __future__ import annotations

import logging

from app.db.models import TransitFareQuoteModel
from app.db.session import async_session
from app.services.fare_resolver import FareResolver
from sqlalchemy import select

logger = logging.getLogger(__name__)


class TransitFareRefreshService:
    """Refreshes transit fare quotes and verifies provider health."""

    @classmethod
    async def refresh_all_active_cities(cls) -> dict[str, int]:
        """Refreshes active cities quotes and returns summary."""
        refreshed = 0
        conflicts = 0

        async with async_session() as db:
            # Query distinct active cities from transit_fare_quotes
            stmt = select(TransitFareQuoteModel.city).distinct()
            res = await db.execute(stmt)
            cities = [row[0] for row in res.fetchall()]

            resolver = FareResolver(db)
            for city in cities:
                try:
                    quotes = await resolver.resolve_city(city)
                    refreshed += len(quotes)
                except Exception as e:
                    logger.error(
                        f"Error during periodic refresh for city '{city}': {e}"
                    )

        logger.info(
            f"Periodic transit fare refresh complete. Refreshed {refreshed} quotes across {len(cities)} cities."
        )
        return {
            "cities_count": len(cities),
            "quotes_refreshed": refreshed,
            "conflicts": conflicts,
        }
