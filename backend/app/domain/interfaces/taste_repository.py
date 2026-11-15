from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.entities.taste import TasteEvent, UserTasteProfile


class ITasteProfileRepository(ABC):
    """Domain port for persisting and loading per-user taste profiles and events."""

    @abstractmethod
    async def get_profile(self, user_id: str) -> UserTasteProfile | None:
        pass

    @abstractmethod
    async def get_profiles_for_users(
        self, user_ids: list[str]
    ) -> dict[str, UserTasteProfile]:
        pass

    @abstractmethod
    async def save_profile(self, profile: UserTasteProfile) -> UserTasteProfile:
        pass

    @abstractmethod
    async def append_events(self, events: list[TasteEvent]) -> int:
        pass

    @abstractmethod
    async def list_events(self, user_id: str, limit: int = 200) -> list[TasteEvent]:
        pass

    @abstractmethod
    async def delete_profile_and_events(self, user_id: str) -> bool:
        pass
