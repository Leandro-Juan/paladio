from abc import ABC, abstractmethod
from typing import List
from app.schemas.scraper import Attraction

class IPoiRepository(ABC):
    """
    Abstract port for POI persistence.
    Isolates domain logic from database infrastructure.
    """
    @abstractmethod
    async def find_by_city(self, city_name: str) -> List[Attraction]:
        pass

    @abstractmethod
    async def save_all_for_city(self, city_name: str, pois: List[Attraction]) -> None:
        pass
