import logging
from abc import ABC, abstractmethod
from typing import Any
import datetime

logger = logging.getLogger(__name__)


class TravelDataProvider(ABC):
    """
    Abstract interface for providing travel-related context data (POIs, Restaurants, etc.)
    """

    @abstractmethod
    async def get_pois(
        self, city: str, mandatory_names: list[str]
    ) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    async def get_restaurants(
        self,
        city: str,
        preferred_cuisines: list[str] | None = None,
        target_frequency: int = 1,
    ) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    async def generate_mock_context(
        self,
        city: str,
        center_lat: float,
        center_lon: float,
        start_date: datetime.date,
        end_date: datetime.date,
    ) -> dict[str, Any]:
        pass


class LiveTravelDataProvider(TravelDataProvider):
    """
    Production provider that fetches real data from repositories and scraping services.
    """

    async def get_pois(
        self, city: str, mandatory_names: list[str]
    ) -> list[dict[str, Any]]:
        from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
        from app.infrastructure.providers.overpass_provider import (
            OverpassProviderAdapter,
        )
        from app.services.poi_service import get_attractions_for_city

        from app.db.session import async_session

        async with async_session() as session:
            repo = SqlPoiRepository(session)
            provider = OverpassProviderAdapter()
            return await get_attractions_for_city(
                city,
                poi_repo=repo,
                poi_provider=provider,
                mandatory_names=mandatory_names,
            )

    async def get_restaurants(
        self,
        city: str,
        preferred_cuisines: list[str] | None = None,
        target_frequency: int = 1,
    ) -> list[dict[str, Any]]:
        from app.services.travel_data_service import fetch_restaurants

        return await fetch_restaurants(
            city,
            test_data=None,
            preferred_cuisines=preferred_cuisines,
            target_frequency=target_frequency,
        )

    async def generate_mock_context(
        self,
        city: str,
        center_lat: float,
        center_lon: float,
        start_date: datetime.date,
        end_date: datetime.date,
    ) -> dict[str, Any]:
        return {}


class MockTravelDataProvider(TravelDataProvider):
    """
    Test provider that returns procedurally generated mock data for safe, isolated testing.
    """

    def __init__(self, test_data: dict[str, Any] = None):
        self.test_data = test_data or {}
        self.dynamic_data_cache = {}

    async def _ensure_dynamic_data(
        self,
        city: str,
        center_lat: float,
        center_lon: float,
        start_date: datetime.date,
        end_date: datetime.date,
    ):
        if not self.dynamic_data_cache:
            logger.info(
                "Generating dynamic mocked data for flights, hotels, and restaurants via MockTravelDataProvider."
            )
            from app.utils.mock_generator import generate_dynamic_mock_data

            self.dynamic_data_cache = generate_dynamic_mock_data(
                city, center_lat, center_lon, start_date, end_date
            )

    async def get_pois(
        self, city: str, mandatory_names: list[str]
    ) -> list[dict[str, Any]]:
        from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
        from app.infrastructure.providers.overpass_provider import (
            OverpassProviderAdapter,
        )
        from app.services.poi_service import get_attractions_for_city

        from app.db.session import async_session

        async with async_session() as session:
            repo = SqlPoiRepository(session)
            provider = OverpassProviderAdapter()
            return await get_attractions_for_city(
                city,
                poi_repo=repo,
                poi_provider=provider,
                mandatory_names=mandatory_names,
            )

    async def get_restaurants(
        self,
        city: str,
        preferred_cuisines: list[str] | None = None,
        target_frequency: int = 1,
    ) -> list[dict[str, Any]]:
        if "restaurants" in self.test_data:
            return self.test_data["restaurants"]
        if "restaurants" in self.dynamic_data_cache:
            return self.dynamic_data_cache["restaurants"]
        from app.services.travel_data_service import fetch_restaurants

        return await fetch_restaurants(
            city,
            test_data=self.test_data,
            preferred_cuisines=preferred_cuisines,
            target_frequency=target_frequency,
        )

    async def generate_mock_context(
        self,
        city: str,
        center_lat: float,
        center_lon: float,
        start_date: datetime.date,
        end_date: datetime.date,
    ) -> dict[str, Any]:
        await self._ensure_dynamic_data(
            city, center_lat, center_lon, start_date, end_date
        )
        return self.dynamic_data_cache
