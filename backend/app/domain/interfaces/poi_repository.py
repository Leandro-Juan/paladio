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
    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float], limit: int = 150
    ) -> list[tuple[Attraction, float]]:
        """
        Retrieves top candidate attractions in the specified city ordered by cosine similarity
        to the user's semantic preference vector. Returns pairs of (Attraction, semantic_affinity).
        """
        pass

    @abstractmethod
    async def save_all_for_city(self, city_name: str, pois: list[Attraction]) -> None:
        pass

    @abstractmethod
    async def update_poi_embeddings(
        self, updates: list[tuple[str, list[float]]]
    ) -> None:
        """
        Updates the 768D semantic embedding for multiple attractions (poi_id, embedding_vector).
        """
        pass
