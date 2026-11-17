import argparse
import asyncio
from contextlib import nullcontext
from datetime import datetime, timezone
import logging

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttractionModel
from app.db.session import async_session
from app.engine.hydration.document_builder import DOCUMENT_VERSION, PoiDocumentBuilder
from app.infrastructure.providers.onnx_embedding_provider import (
    OnnxEmbeddingProvider,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


async def hydrate_attractions(
    batch_size: int = 8,
    force_all: bool = False,
    city: str | None = None,
    tier_max: int | None = None,
    session: AsyncSession | None = None,
) -> int:
    """Computes PoiDocumentBuilder texts, SHA-256 hashes, and 768D CPU ONNX embeddings."""
    provider = OnnxEmbeddingProvider()
    ctx = nullcontext(session) if session is not None else async_session()
    own_session = session is None
    async with ctx as active_session:
        stmt = select(AttractionModel)
        if city:
            stmt = stmt.where(AttractionModel.city.ilike(city.strip()))
        if tier_max is not None:
            stmt = stmt.where(AttractionModel.tier <= tier_max)
        if not force_all:
            stmt = stmt.where(
                or_(
                    AttractionModel.embedding.is_(None),
                    AttractionModel.embedding_model.is_(None),
                    AttractionModel.embedding_model != provider.model,
                    AttractionModel.embedding_version < DOCUMENT_VERSION,
                )
            )

        result = await active_session.execute(stmt)
        models = list(result.scalars().all())

        total = len(models)
        logger.info(
            f"Found {total} attractions to hydrate with 768D embeddings (city={city or 'ALL'}, tier_max={tier_max})..."
        )
        if total == 0:
            logger.info("All matching attractions are already hydrated.")
            return 0

        hydrated_count = 0
        for i in range(0, total, batch_size):
            chunk = models[i : i + batch_size]
            docs: list[str] = []
            hashes: list[str] = []
            for m in chunk:
                doc = PoiDocumentBuilder.build_document(m)
                docs.append(doc)
                hashes.append(PoiDocumentBuilder.compute_hash(doc))

            embs = await provider.embed_batch(
                docs, input_type="document", batch_size=batch_size
            )
            now_utc = datetime.now(timezone.utc)
            for m, doc, doc_hash, vec in zip(chunk, docs, hashes, embs):
                m.embedding_text = doc
                m.embedding_text_hash = doc_hash
                m.embedding = vec
                m.embedding_model = provider.model
                m.embedding_version = PoiDocumentBuilder.VERSION
                m.embedded_at = now_utc
                m.hydration_status = "EMBEDDED"
                hydrated_count += 1

            if own_session:
                await active_session.commit()
            else:
                await active_session.flush()
            logger.info(f"Hydrated {min(i + batch_size, total)}/{total} attractions...")

        logger.info("POI Embedding Hydration completed successfully!")
        return hydrated_count


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
