"""CLI script to hydrate POI tiering, taxonomy, and iconicity in PostgreSQL.

Usage:
    python -m app.cli.tier_pois [--city Paris]
"""

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.db.models import AttractionModel
from app.db.session import async_session
from app.engine.v2.tiering import classify_poi_tier, get_seed_store

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


async def tier_attractions(city: str | None = None, batch_size: int = 100):
    seed_store = get_seed_store()
    async with async_session() as session:
        stmt = select(AttractionModel)
        if city:
            stmt = stmt.where(AttractionModel.city == city)

        result = await session.execute(stmt)
        attractions = list(result.scalars().all())
        total = len(attractions)

        logger.info(
            f"Found {total} attractions to evaluate for tiering and taxonomy..."
        )
        if total == 0:
            return

        tier_counts: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0}
        source_counts: dict[str, int] = {"seed": 0, "heuristic": 0}
        tax_counts: dict[str, int] = {}

        for i, m in enumerate(attractions):
            poi_dict = {
                "id": m.id,
                "name": m.name,
                "category": m.category,
                "duration_mins": m.duration_mins,
                "cost_eur": m.cost_eur,
                "metadata": m.metadata_field,
            }
            res = classify_poi_tier(poi_dict, m.city, seed_store)

            m.tier = res["tier"]
            m.tier_confidence = res["tier_confidence"]
            m.tier_source = res["tier_source"]
            m.iconicity_score = res["iconicity_score"]
            m.taxonomy_category = res["taxonomy_category"]
            m.category_id = res["category_id"]
            m.visit_mode = res["visit_mode"]

            tier_counts[m.tier] = tier_counts.get(m.tier, 0) + 1
            source_counts[m.tier_source] = source_counts.get(m.tier_source, 0) + 1
            tax_counts[m.taxonomy_category] = tax_counts.get(m.taxonomy_category, 0) + 1

            if (i + 1) % batch_size == 0 or (i + 1) == total:
                await session.commit()
                logger.info(f"Committed {i + 1}/{total} attractions...")

        await session.commit()
        logger.info("=== Tiering Hydration Summary ===")
        logger.info(f"Total processed: {total}")
        logger.info(f"Tier distribution: {tier_counts}")
        logger.info(f"Source distribution: {source_counts}")
        logger.info(f"Taxonomy distribution: {tax_counts}")


def main():
    parser = argparse.ArgumentParser(
        description="Hydrate POI tiering, taxonomy, and iconicity."
    )
    parser.add_argument(
        "--city",
        type=str,
        default=None,
        help="City name filter (e.g. Paris, Tokyo).",
    )
    args = parser.parse_args()
    asyncio.run(tier_attractions(city=args.city))


if __name__ == "__main__":
    main()
