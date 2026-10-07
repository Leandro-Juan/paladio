"""Abstract repository port for City domain entities."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.entities.city import City


class ICityRepository(ABC):
    """Abstract port for City persistence and resolution."""

    @abstractmethod
    async def get_by_id(self, city_id: str) -> City | None:
        """Finds a city by its canonical ID (e.g. 'madrid_es')."""
        pass

    @abstractmethod
    async def find_by_name_or_alias(self, query: str) -> City | None:
        """Finds a city matching by name or alias (case-insensitive)."""
        pass

    @abstractmethod
    async def save_city(self, city: City) -> City:
        """Upserts a City entity in the store."""
        pass

    @abstractmethod
    async def list_cities(self) -> list[City]:
        """Lists all indexed cities."""
        pass
