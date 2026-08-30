from abc import ABC, abstractmethod

from app.schemas.scraper import Attraction


class IPoiRepository(ABC):
    """
    Abstract port for POI persistence.
    Isolates domain logic from database infrastructure.
    """

    @abstractmethod
    async def find_by_city(self, city_name: str) -> list[Attraction]:
        pass

    @abstractmethod
    async def save_all_for_city(self, city_name: str, pois: list[Attraction]) -> None:
        pass
