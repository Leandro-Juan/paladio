"""Shim provider delegating to the unified osm_city_ingest engine.

Maintains backward compatibility with IPoiProvider interface while routing
all requests through the high-volume, deduplicated, noise-free ingestion pipeline.
"""

import logging
from typing import Any

from app.domain.interfaces.poi_provider import IPoiProvider
from app.infrastructure.providers.osm_city_ingest import (
    fetch_city_records,
    geocode_city,
)
from app.schemas.scraper import (
    Attraction,
    AttractionFinancials,
    AttractionSchedule,
    Location,
    Metadata,
    Scoring,
)

logger = logging.getLogger(__name__)


def _record_to_attraction(rec: dict[str, Any]) -> Attraction:
    loc = rec.get("location", {})
    return Attraction(
        id=rec["id"],
        category=rec.get("category", "attraction"),
        name=rec["name"],
        location=Location(
            latitude=float(loc.get("latitude", 0.0)),
            longitude=float(loc.get("longitude", 0.0)),
        ),
        schedule=AttractionSchedule(
            osm_opening_hours=rec.get("osm_opening_hours"),
            recommended_duration_minutes=int(rec.get("duration_mins", 60)),
        ),
        financials=AttractionFinancials(
            is_free=float(rec.get("cost_eur", 0.0)) == 0.0,
            estimated_cost=float(rec.get("cost_eur", 0.0)),
            currency="EUR",
            is_estimated=bool(rec.get("cost_is_estimated", True)),
            price_source=rec.get("cost_source"),
        ),
        scoring=Scoring(
            rating=float(rec.get("scoring", {}).get("rating", 0.0) or 0.0),
            reviews=int(rec.get("scoring", {}).get("reviews", 0) or 0),
        ),
        metadata=Metadata(source="osm_v2_unified"),
        embedding=rec.get("embedding"),
    )


class OverpassProviderAdapter(IPoiProvider):
    """Unified adapter implementing IPoiProvider via osm_city_ingest."""

    async def fetch_restaurants(
        self, city: str, limit: int = 15, cuisine: str | None = None
    ) -> list[Attraction]:
        try:
            geo = await geocode_city(city)
            records = await fetch_city_records(geo, use_pbf=False)
            dining_records = [
                r
                for r in records
                if r.get("stream") in (3, 4, 5)
                or r.get("category") in ("restaurant", "cafe", "bar")
            ]
            if cuisine:
                cuisine_lower = cuisine.lower()
                dining_records = [
                    r
                    for r in dining_records
                    if cuisine_lower
                    in str(r.get("metadata", {}).get("cuisine", "")).lower()
                ]
            return [_record_to_attraction(r) for r in dining_records[:limit]]
        except Exception as exc:
            logger.error(
                f"OverpassProviderAdapter.fetch_restaurants failed for {city}: {exc}"
            )
            return []

    async def fetch_attractions(
        self, city_name: str, limit: int = 50, mandatory_names: list[str] | None = None
    ) -> list[Attraction]:
        try:
            geo = await geocode_city(city_name)
            records = await fetch_city_records(geo, use_pbf=False)
            sight_records = [
                r
                for r in records
                if r.get("stream") in (1, 2, 6)
                or r.get("category") not in ("restaurant", "cafe", "bar")
            ]
            return [_record_to_attraction(r) for r in sight_records[:limit]]
        except Exception as exc:
            logger.error(
                f"OverpassProviderAdapter.fetch_attractions failed for {city_name}: {exc}"
            )
            return []
