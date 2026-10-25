"""CLI tool to enrich POIs with real Google Maps ratings and review counts without API keys.

Usage:
    python -m app.cli.enrich_ratings --city tokyo --tier 1,2 --limit 20
"""

import argparse
import asyncio
import json
import logging

from sqlalchemy import select, text
from app.db.models import AttractionModel
from app.db.session import async_session
from app.services.google_maps_rating_resolver import GoogleMapsRatingResolver

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("enrich_ratings")


async def enrich_city_ratings(
    city: str,
    tiers: list[int] | None = None,
    limit: int = 25,
    concurrency: int = 2,
):
    """Enriches attractions in a city with real Google Maps review ratings."""
    logger.info(
        f"Starting rating enrichment for city='{city}', tiers={tiers}, limit={limit}..."
    )

    async with async_session() as session:
        stmt = select(AttractionModel).where(AttractionModel.city.ilike(f"%{city}%"))
        if tiers:
            stmt = stmt.where(AttractionModel.tier.in_(tiers))

        stmt = stmt.order_by(
            AttractionModel.tier.asc(),
            AttractionModel.iconicity_score.desc(),
        )

        res = await session.execute(stmt)
        candidates = list(res.scalars().all())

        # Filter for candidates that need rating (rating <= 0)
        target_pois = []
        for p in candidates:
            scoring = p.scoring if isinstance(p.scoring, dict) else {}
            if float(scoring.get("rating", 0.0)) <= 0:
                target_pois.append(p)
            if len(target_pois) >= limit:
                break

        total = len(target_pois)
        logger.info(f"Found {total} target POIs needing real ratings in {city}.")
        if total == 0:
            logger.info("All target POIs already have verified ratings.")
            return

        # Launch a single shared Playwright browser for high speed and token/resource efficiency
        from playwright.async_api import async_playwright

        playwright_obj = await async_playwright().start()
        browser = await playwright_obj.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context = await browser.new_context(
            locale="en-US",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )

        semaphore = asyncio.Semaphore(concurrency)
        success_count = 0
        failed_count = 0

        async def process_poi(poi: AttractionModel, idx: int):
            nonlocal success_count, failed_count
            async with semaphore:
                page = await context.new_page()
                try:
                    data = await GoogleMapsRatingResolver.scrape_rating(
                        name=poi.name,
                        city=poi.city,
                        page=page,
                    )
                    if data and data.get("rating"):
                        # Update DB
                        async with async_session() as update_session:
                            await update_session.execute(
                                text(
                                    "UPDATE attractions SET scoring = :scoring WHERE id = :id"
                                ),
                                {"scoring": json.dumps(data), "id": poi.id},
                            )
                            await update_session.commit()

                        # Cache in Redis
                        await GoogleMapsRatingResolver.set_cached_rating(poi.id, data)

                        success_count += 1
                        logger.info(
                            f"[{idx+1}/{total}] SUCCESS: {poi.name} -> {data['rating']}★ ({data['reviews']:,} reviews) [{data['source']}]"
                        )
                    else:
                        failed_count += 1
                        logger.warning(
                            f"[{idx+1}/{total}] NOT FOUND: {poi.name} in {poi.city}"
                        )
                except Exception as e:
                    failed_count += 1
                    logger.error(f"[{idx+1}/{total}] ERROR for {poi.name}: {e}")
                finally:
                    await page.close()

        tasks = [process_poi(p, i) for i, p in enumerate(target_pois)]
        await asyncio.gather(*tasks)

        await context.close()
        await browser.close()
        await playwright_obj.stop()

        logger.info(
            f"Finished rating enrichment for {city}: {success_count} succeeded, {failed_count} unrated out of {total} processed."
        )


def main():
    parser = argparse.ArgumentParser(
        description="Enrich POIs with real Google Maps ratings."
    )
    parser.add_argument(
        "--city", type=str, required=True, help="City name (e.g. tokyo, madrid)"
    )
    parser.add_argument(
        "--tier",
        type=str,
        default="1,2",
        help="Comma-separated tiers to enrich (default: 1,2)",
    )
    parser.add_argument(
        "--limit", type=int, default=20, help="Max POIs to enrich (default: 20)"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="Number of parallel pages (default: 2)",
    )

    args = parser.parse_args()
    tier_list = None
    if args.tier.lower() != "all":
        tier_list = [
            int(t.strip()) for t in args.tier.split(",") if t.strip().isdigit()
        ]

    asyncio.run(
        enrich_city_ratings(
            city=args.city,
            tiers=tier_list,
            limit=args.limit,
            concurrency=args.concurrency,
        )
    )


if __name__ == "__main__":
    main()
