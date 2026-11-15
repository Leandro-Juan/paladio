import argparse
import asyncio
import logging

from sqlalchemy import or_, select

from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
from app.db.models import AttractionModel
from app.db.session import async_session
from app.engine.hydration.document_builder import DOCUMENT_VERSION
from app.engine.hydration.poi_synthesizer import PoiNaturalLanguageSynthesizer
from app.infrastructure.providers.onnx_embedding_provider import (
    OnnxEmbeddingProvider,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


async def hydrate_attractions(
    batch_size: int = 24,
    force_all: bool = False,
    city: str | None = None,
):
    provider = OnnxEmbeddingProvider()
    async with async_session() as session:
        poi_repo = SqlPoiRepository(session)
        stmt = select(AttractionModel)
        if city:
            stmt = stmt.where(AttractionModel.city.ilike(city.strip()))
        if not force_all:
            stmt = stmt.where(
                or_(
                    AttractionModel.embedding.is_(None),
                    AttractionModel.embedding_model.is_(None),
                    AttractionModel.embedding_model != provider.model,
                    AttractionModel.embedding_version < DOCUMENT_VERSION,
                )
            )

        result = await session.execute(stmt)
        models = list(result.scalars().all())

        total = len(models)
        logger.info(f"Found {total} attractions to hydrate with 768D embeddings...")
        if total == 0:
            logger.info("All attractions are already hydrated.")
            return

        for i in range(0, total, batch_size):
            chunk = models[i : i + batch_size]
            synthesized_texts = []
            poi_ids = []
            for m in chunk:
                poi_ids.append(m.id)
                data = {
                    "id": m.id,
                    "name": m.name,
                    "city": m.city,
                    "category": m.category,
                    "metadata": m.metadata_field,
                    "financials": {
                        "cost_eur": getattr(m, "cost_eur", 0.0),
                        "cost_is_estimated": getattr(m, "cost_is_estimated", True),
                    },
                }
                text = PoiNaturalLanguageSynthesizer.synthesize_description(data)
                synthesized_texts.append(text)

            embs = await provider.embed_batch(synthesized_texts)
            updates = list(zip(poi_ids, embs))
            await poi_repo.update_poi_embeddings(updates)
            logger.info(f"Hydrated {min(i + batch_size, total)}/{total} attractions...")

        logger.info("POI Embedding Hydration completed successfully!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Hydrate 768D POI embeddings in PostgreSQL via CPU ONNX."
    )
    parser.add_argument(
        "--city",
        type=str,
        default=None,
        help="Restrict hydration to a single city name (case-insensitive).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed all matching POIs regardless of existing model or version.",
    )
    args = parser.parse_args()
    asyncio.run(hydrate_attractions(force_all=args.force, city=args.city))
