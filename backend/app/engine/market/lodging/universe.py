"""
Property universe manager for hotel coverage telemetry.
Loads and tracks the known universe of lodging properties per destination
using local OpenStreetMap data and the Paladio relational database.
Zero synthetic numbers; coverage is computed against real known properties.
"""

import logging
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import CityModel, DestinationAirportModel, HotelPropertyModel

logger = logging.getLogger(__name__)


class PropertyUniverseManager:
    """
    Maintains the canonical denominator for hotel coverage scoring.
    """

    @staticmethod
    async def get_city_id_and_bbox(
        session: AsyncSession, destination_code: str
    ) -> tuple[str | None, list[float] | None, str | None]:
        """
        Resolves destination code (IATA or city slug) to city_id, bbox [S, W, N, E], and city name.
        """
        code = destination_code.upper().strip()

        # Try DestinationAirportModel first
        stmt = (
            select(CityModel.id, CityModel.bbox, CityModel.name)
            .join(
                DestinationAirportModel,
                DestinationAirportModel.city_id == CityModel.id,
            )
            .where(DestinationAirportModel.iata == code)
            .limit(1)
        )
        res = await session.execute(stmt)
        row = res.first()
        if row:
            return row[0], row[1], row[2]

        # Try matching CityModel id or name directly
        stmt_city = (
            select(CityModel.id, CityModel.bbox, CityModel.name)
            .where(
                (CityModel.id.ilike(f"{code}%")) | (CityModel.name.ilike(f"{code}%"))
            )
            .limit(1)
        )
        res_city = await session.execute(stmt_city)
        row_city = res_city.first()
        if row_city:
            return row_city[0], row_city[1], row_city[2]

        # Try resolving IATA code to canonical city name via AirportService
        from app.services.airport_service import get_city_from_iata

        city_name = get_city_from_iata(code)
        if city_name and city_name != "Unknown":
            stmt_name = (
                select(CityModel.id, CityModel.bbox, CityModel.name)
                .where(
                    (CityModel.id.ilike(f"{city_name}%"))
                    | (CityModel.name.ilike(f"{city_name}%"))
                )
                .limit(1)
            )
            res_name = await session.execute(stmt_name)
            row_name = res_name.first()
            if row_name:
                return row_name[0], row_name[1], row_name[2]
            return None, None, city_name

        return None, None, code

    @staticmethod
    async def get_universe_size(
        session: AsyncSession, destination_code: str
    ) -> int | None:
        """
        Returns the number of registered canonical properties in hotel_properties for this destination.
        Returns None if no baseline universe has been recorded yet.
        """
        dest = destination_code.upper().strip()
        stmt = select(func.count(HotelPropertyModel.id)).where(
            HotelPropertyModel.destination_code == dest
        )
        res = await session.execute(stmt)
        count = res.scalar_one_or_none() or 0
        return count if count > 0 else None

    @staticmethod
    def calculate_coverage(
        properties_seen: int, universe_size: int | None
    ) -> float | None:
        """
        Calculates ratio of properties seen to known universe size.
        Returns None if universe_size is unknown or zero.
        """
        if not universe_size or universe_size <= 0:
            return None
        return min(round(properties_seen / float(universe_size), 4), 1.0)
