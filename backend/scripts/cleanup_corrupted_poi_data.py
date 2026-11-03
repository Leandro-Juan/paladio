"""Remediation script to purge corrupted POI cache and database records.

Flushes contaminated Redis photo/extract keys and resets corrupted
descriptions in PostgreSQL, triggering fresh, authentic resolution.
"""

import asyncio
import logging

from app.db.session import async_session
from app.db.models import AttractionModel
from app.services.wikimedia_photo_resolver import WikimediaPhotoResolver

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cleanup_corrupted_poi_data")


async def main():
    logger.info("Starting POI cleanup and re-resolution...")

    # 1. Clean Redis cache for affected POIs
    try:
        import redis.asyncio as aioredis
        import os

        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url, decode_responses=True)
        keys_to_delete = [
            "poi:photos:OSM-way-43935790",
            "poi:extract:OSM-way-43935790",
            "poi:photos:poi_04a8577a",
            "poi:extract:poi_04a8577a",
            "poi:photos:fukuya azabu",
            "poi:extract:fukuya azabu",
            "poi:photos:OSM-node-260752586",
            "poi:extract:OSM-node-260752586",
        ]
        # Also find any keys with beatles or hanazawa
        all_photo_keys = await r.keys("poi:photos:*")
        for k in all_photo_keys:
            val = await r.get(k)
            if val and (
                "Beatles" in val or "Hanazawa" in val or "photos.app.goo.gl" in val
            ):
                keys_to_delete.append(k)

        all_extract_keys = await r.keys("poi:extract:*")
        for k in all_extract_keys:
            val = await r.get(k)
            if val and ("Beatles" in val or "花澤" in val):
                keys_to_delete.append(k)

        deleted_count = 0
        for k in set(keys_to_delete):
            if await r.delete(k):
                deleted_count += 1
                logger.info(f"Deleted Redis cache key: {k}")
        logger.info(f"Purged {deleted_count} contaminated Redis cache keys.")
        await r.aclose()
    except Exception as err:
        logger.warning(f"Redis cache purge encountered error: {err}")

    # 2. Reset and re-resolve in PostgreSQL
    async with async_session() as session:
        # Check Shimizu Gate
        shimizu = await session.get(AttractionModel, "OSM-way-43935790")
        if shimizu:
            tags = dict((shimizu.metadata_field or {}).get("tags") or {})
            shimizu.description = None
            shimizu.description_source = None
            if not shimizu.wikidata_id and tags.get("wikidata"):
                shimizu.wikidata_id = str(tags["wikidata"]).strip().upper()
            if not shimizu.wikipedia_title and tags.get("wikipedia"):
                shimizu.wikipedia_title = tags["wikipedia"]

            photos, extract = await WikimediaPhotoResolver.resolve_photos(
                poi_id=shimizu.id,
                name=shimizu.name,
                city=shimizu.city,
                wikipedia_title=shimizu.wikipedia_title,
                wikidata_id=shimizu.wikidata_id,
                osm_tags=tags,
            )
            shimizu.description = extract
            shimizu.description_source = "wikipedia" if extract else None
            logger.info("Re-resolved Shimizu Gate:")
            logger.info(f"  Photos count: {len(photos)}")
            logger.info(f"  First photo: {photos[0]['url'] if photos else 'None'}")
            logger.info(
                f"  Desc: {shimizu.description[:100] if shimizu.description else 'None'}"
            )

        # Check Great Buddha
        buddha = await session.get(AttractionModel, "OSM-node-260752586")
        if buddha:
            tags = dict((buddha.metadata_field or {}).get("tags") or {})
            if not buddha.wikidata_id and tags.get("wikidata"):
                buddha.wikidata_id = str(tags["wikidata"]).strip().upper()
            if not buddha.wikipedia_title and tags.get("wikipedia"):
                buddha.wikipedia_title = tags["wikipedia"]

            photos, extract = await WikimediaPhotoResolver.resolve_photos(
                poi_id=buddha.id,
                name=buddha.name,
                city=buddha.city,
                wikipedia_title=buddha.wikipedia_title,
                wikidata_id=buddha.wikidata_id,
                osm_tags=tags,
            )
            logger.info("Re-resolved Great Buddha:")
            logger.info(f"  Photos count: {len(photos)}")
            logger.info(f"  First photo: {photos[0]['url'] if photos else 'None'}")

        await session.commit()
        logger.info("Successfully committed cleaned POIs to database.")


if __name__ == "__main__":
    asyncio.run(main())
