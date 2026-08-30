from abc import ABC, abstractmethod

from app.schemas.scraper import Attraction


class IPoiProvider(ABC):
    @abstractmethod
    async def fetch_attractions(
        self, city_name: str, limit: int = 50, mandatory_names: list[str] | None = None
    ) -> list[Attraction]:
        """Fetches POIs for a city and parses them into Attraction domain models."""
