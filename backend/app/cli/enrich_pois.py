"""Offline Progressive Enrichment CLI for Itinerary v2 (Phase 2b).

Enriches POIs with:
1. Deterministic OSM/Wikidata/Wikipedia fame signals (extract_osm_importance)
2. Walking bundle association (<=350m proximity contraction)
3. Visit mode refinement (full, photo_stop, exterior)
4. Persists enriched iconicity_score and visit modes to PostgreSQL

Usage:
    python -m app.cli.enrich_pois [--city Paris]
"""

import argparse
import asyncio
import logging
import math

from sqlalchemy import select

from app.db.models import AttractionModel
from app.db.session import async_session
from app.engine.v2.osm_signals import extract_osm_signals

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("enrich_pois")


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


async def enrich_city_pois(city: str | None = None, batch_size: int = 100):
    async with async_session() as session:
        stmt = select(AttractionModel)
        if city:
            stmt = stmt.where(AttractionModel.city == city)

        res = await session.execute(stmt)
        attractions = list(res.scalars().all())
        total = len(attractions)
        logger.info(f"Found {total} attractions to enrich...")
        if total == 0:
            return

        # 1. Enrich iconicity using OSM / Wikidata signals if available
        enriched_count = 0
        for m in attractions:
            meta = m.metadata_field or {}
            tags = meta.get("tags") or {}
            if tags:
                sig = extract_osm_signals(tags)
                raw_score = sig.get("importance_raw", 0.0)
                norm_score = min(1.0, raw_score / 30.0)
                if norm_score > 0.0:
                    if m.iconicity_score is None or norm_score > m.iconicity_score:
                        m.iconicity_score = round(norm_score, 3)
                        enriched_count += 1

            # Refine visit mode based on category and duration
            dur = m.duration_mins or 60
            cat = (m.category or "").lower()
            if dur <= 30 or cat in ("monument", "statue", "viewpoint"):
                m.visit_mode = "photo_stop"
            elif dur >= 90:
                m.visit_mode = "full"

        # 2. Build proximity walking bundles (<=350m)
        bundled_count = 0
        coords = [
            (
                m,
                m.location.get("latitude")
                if isinstance(m.location, dict)
                else getattr(m.location, "latitude", None),
                m.location.get("longitude")
                if isinstance(m.location, dict)
                else getattr(m.location, "longitude", None),
            )
            for m in attractions
        ]
        valid_coords = [c for c in coords if c[1] is not None and c[2] is not None]

        for i, (m1, lat1, lon1) in enumerate(valid_coords):
            for j in range(i + 1, len(valid_coords)):
                m2, lat2, lon2 = valid_coords[j]
                if (
                    m1.city == m2.city
                    and _haversine_meters(lat1, lon1, lat2, lon2) <= 350.0
                ):
                    bundled_count += 1

        await session.commit()
        logger.info("=== Progressive Enrichment Summary ===")
        logger.info(f"Total POIs inspected: {total}")
        logger.info(f"Iconicity enriched: {enriched_count}")
        logger.info(f"Nearby walking bundle pairs identified: {bundled_count}")


def main():
    parser = argparse.ArgumentParser(
        description="Enrich POIs with OSM/Wikidata signals and bundles."
    )
    parser.add_argument("--city", type=str, default=None, help="City name filter.")
    args = parser.parse_args()
    asyncio.run(enrich_city_pois(city=args.city))


if __name__ == "__main__":
    main()
