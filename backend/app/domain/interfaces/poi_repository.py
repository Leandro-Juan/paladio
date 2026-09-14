from abc import ABC, abstractmethod

from app.domain.entities.poi import Poi


class IPoiRepository(ABC):
    """
    Abstract port for POI persistence.
    Isolates domain logic from database infrastructure.
    """

    @abstractmethod
    async def find_by_city(self, city_name: str) -> list[Poi]:
        pass

    @abstractmethod
    async def find_semantic_candidates(
        self, city_name: str, user_vector: list[float], limit: int = 150
    ) -> list[tuple[Poi, float]]:
        """
        Retrieves top candidate attractions in the specified city ordered by cosine similarity
        to the user's semantic preference vector. Returns pairs of (Poi, semantic_affinity).
        """

    @abstractmethod
    async def save_all_for_city(self, city_name: str, pois: list[Poi]) -> None:
        pass

    @abstractmethod
    async def update_poi_embeddings(
        self, updates: list[tuple[str, list[float]]]
    ) -> None:
        """
        Updates the 768D semantic embedding for multiple attractions (poi_id, embedding_vector).
        """
