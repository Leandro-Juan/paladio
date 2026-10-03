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
    async def find_tiered_pois(self, city_name: str, max_tier: int = 2) -> list[Poi]:
        """
        Retrieves candidate attractions in the specified city up to max_tier (e.g. 1 and 2),
        ordered by tier and iconicity.
        """
        pass

    @abstractmethod
    async def find_meal_spots(self, city_name: str, limit: int = 400) -> list[Poi]:
        """
        Retrieves dining venues (restaurants, cafes) known for the city.
        Returns an empty list when the city has no ingested dining venues.
        """
        pass

    @abstractmethod
    async def save_tiered_for_city(self, city_name: str, records: list[dict]) -> None:
        """Upserts freshly ingested POI records including v2 tier/taxonomy fields."""
        pass

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
