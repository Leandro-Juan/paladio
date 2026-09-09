import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import AttractionModel
from app.domain.interfaces.poi_repository import IPoiRepository
from app.schemas.scraper import Attraction
from sqlalchemy import select

logger = logging.getLogger(__name__)


class SqlPoiRepository(IPoiRepository):
    """
    SQLAlchemy implementation of the IPoiRepository port.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def find_by_city(self, city_name: str) -> list[Attraction]:
        stmt = select(AttractionModel).where(AttractionModel.city == city_name)
        result = await self.session.execute(stmt)
        models = result.scalars().all()

        attractions = []
        for model in models:
            attraction = Attraction(
                id=model.id,
                type="attraction",
                category=model.category,
                name=model.name,
                location=model.location,
                schedule=model.schedule,
                financials=model.financials,
                scoring=model.scoring,
                metadata=model.metadata_field,
            )
            attractions.append(attraction)

        return attractions

    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float], limit: int = 150
    ) -> list[tuple[Attraction, float]]:
        """
        Retrieves candidate attractions in the city ordered by pgvector cosine similarity (<=>)
        to the user's 768D semantic vector. Returns tuples of (Attraction, semantic_affinity).
        """
        if not user_vector:
            all_pois = await self.find_by_city(city_name)
            return [(p, 0.5) for p in all_pois[:limit]]

        dist_col = AttractionModel.embedding.cosine_distance(user_vector)
        stmt = (
            select(AttractionModel, dist_col.label("distance"))
            .where(AttractionModel.city == city_name)
            .where(AttractionModel.embedding.isnot(None))
            .order_by(dist_col.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        if not rows:
            # Fallback if POIs are not yet hydrated with embeddings
            all_pois = await self.find_by_city(city_name)
            return [(p, 0.5) for p in all_pois[:limit]]

        candidates: list[tuple[Attraction, float]] = []
        for model, dist in rows:
            dist_val = float(dist) if dist is not None else 1.0
            # Cosine similarity in [0.0, 1.0]
            sim = float(max(0.0, min(1.0, 1.0 - dist_val)))
            attraction = Attraction(
                id=model.id,
                type="attraction",
                category=model.category,
                name=model.name,
                location=model.location,
                schedule=model.schedule,
                financials=model.financials,
                scoring=model.scoring,
                metadata=model.metadata_field,
            )
            candidates.append((attraction, sim))

        return candidates

    async def update_poi_embeddings(
        self, updates: list[tuple[str, list[float]]]
    ) -> None:
        """Updates 768D semantic embeddings for attractions in batch."""
        if not updates:
            return

        from sqlalchemy import update

        for poi_id, emb in updates:
            stmt = (
                update(AttractionModel)
                .where(AttractionModel.id == poi_id)
                .values(embedding=emb)
            )
            await self.session.execute(stmt)
        await self.session.commit()
        logger.info(f"Updated embeddings for {len(updates)} attractions in database.")

    async def save_all_for_city(self, city_name: str, pois: list[Attraction]) -> None:
        if not pois:
            return

        values = []
        for parsed in pois:
            values.append(
                {
                    "id": parsed.id,
                    "city": city_name,
                    "name": parsed.name,
                    "category": parsed.category,
                    "location": parsed.location.model_dump(mode="json"),
                    "schedule": parsed.schedule.model_dump(mode="json"),
                    "financials": parsed.financials.model_dump(mode="json"),
                    "scoring": parsed.scoring.model_dump(mode="json"),
                    "metadata_field": parsed.metadata.model_dump(mode="json"),
                }
            )

        from sqlalchemy.dialects.postgresql import insert

        stmt = insert(AttractionModel).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": stmt.excluded.name,
                "category": stmt.excluded.category,
                "location": stmt.excluded.location,
                "schedule": stmt.excluded.schedule,
                "financials": stmt.excluded.financials,
                "scoring": stmt.excluded.scoring,
                "metadata": stmt.excluded.metadata,
            },
        )

        await self.session.execute(stmt)
        await self.session.commit()

        logger.info(f"Saved {len(pois)} fresh POIs to the database for {city_name}.")
