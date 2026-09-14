from abc import ABC, abstractmethod

from app.domain.entities.poi import Poi


class IPoiProvider(ABC):
    @abstractmethod
    async def fetch_attractions(
        self, city_name: str, limit: int = 50, mandatory_names: list[str] | None = None
    ) -> list[Poi]:
        """Fetches POIs for a city and parses them into Poi domain entities."""
