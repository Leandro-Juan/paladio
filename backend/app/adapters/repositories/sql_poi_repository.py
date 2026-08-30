import logging

from app.db.models import AttractionModel
from app.db.session import async_session
from app.domain.interfaces.poi_repository import IPoiRepository
from app.schemas.scraper import Attraction
from sqlalchemy import select

logger = logging.getLogger(__name__)


class SqlPoiRepository(IPoiRepository):
    """
    SQLAlchemy implementation of the IPoiRepository port.
    """

    async def find_by_city(self, city_name: str) -> list[Attraction]:
        async with async_session() as session:
            stmt = select(AttractionModel).where(AttractionModel.city == city_name)
            result = await session.execute(stmt)
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

    async def save_all_for_city(self, city_name: str, pois: list[Attraction]) -> None:
        db_models = []
        for parsed in pois:
            db_model = AttractionModel(
                id=parsed.id,
                city=city_name,
                name=parsed.name,
                category=parsed.category,
                location=parsed.location.model_dump(mode="json"),
                schedule=parsed.schedule.model_dump(mode="json"),
                financials=parsed.financials.model_dump(mode="json"),
                scoring=parsed.scoring.model_dump(mode="json"),
                metadata_field=parsed.metadata.model_dump(mode="json"),
            )
            db_models.append(db_model)

        async with async_session() as session:
            for model in db_models:
                await session.merge(model)
            await session.commit()

        logger.info(f"Saved {len(pois)} fresh POIs to the database for {city_name}.")
