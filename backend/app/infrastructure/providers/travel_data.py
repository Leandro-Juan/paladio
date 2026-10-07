import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class TravelDataProvider(ABC):
    """
    Abstract interface for providing travel-related context data (POIs, Restaurants).
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


class DefaultTravelDataProvider(TravelDataProvider):
    """
    Unified travel data provider that fetches POIs and restaurants from repositories
    and Overpass, with optional in-memory test_data support for tests.
    """

    def __init__(self, test_data: dict[str, Any] | None = None):
        self.test_data = test_data or {}

    async def get_pois(
        self, city: str, mandatory_names: list[str]
    ) -> list[dict[str, Any]]:
        if "pois" in self.test_data:
            return self.test_data["pois"]

        try:
            from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
            from app.db.session import async_session
            from app.engine.v2.city_readiness import ensure_city_ready
            from app.infrastructure.providers.overpass_provider import (
                OverpassProviderAdapter,
            )
            from app.services.poi_service import get_attractions_for_city

            async with async_session() as session:
                repo = SqlPoiRepository(session)
                try:
                    await ensure_city_ready(city, repo)
                except Exception as e:
                    logger.warning(
                        f"Automatic city readiness check for {city} failed: {e}"
                    )

                provider = OverpassProviderAdapter()
                return await get_attractions_for_city(
                    city,
                    poi_repo=repo,
                    poi_provider=provider,
                    mandatory_names=mandatory_names,
                )
        except Exception as e:
            logger.error(f"Could not load POIs for {city}: {e}")
            raise RuntimeError(f"Could not load POIs for {city}: {e}") from e

    async def get_restaurants(
        self,
        city: str,
        preferred_cuisines: list[str] | None = None,
        target_frequency: int = 1,
    ) -> list[dict[str, Any]]:
        if "restaurants" in self.test_data:
            return self.test_data["restaurants"]

        from app.adapters.repositories.sql_poi_repository import SqlPoiRepository
        from app.db.session import async_session
        from app.engine.v2.city_readiness import ensure_city_ready
        from app.services.travel_data_service import fetch_restaurants

        try:
            async with async_session() as session:
                repo = SqlPoiRepository(session)
                try:
                    await ensure_city_ready(city, repo)
                except Exception as e:
                    logger.warning(
                        f"Automatic city readiness check for restaurants in {city} failed: {e}"
                    )

                return await fetch_restaurants(
                    city,
                    poi_repo=repo,
                    test_data=self.test_data,
                    preferred_cuisines=preferred_cuisines,
                    target_frequency=target_frequency,
                )
        except Exception as e:
            logger.error(f"Error fetching restaurants for {city}: {e}")
            raise RuntimeError(f"Could not load restaurants for {city}: {e}") from e


# Backward-compatible alias
LiveTravelDataProvider = DefaultTravelDataProvider
