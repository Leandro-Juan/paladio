"""Base class for operator open data transit fare adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.db.models import TransitFareQuoteModel


class BaseFareAdapter(ABC):
    @abstractmethod
    def supports_city(self, city: str, country_code: str | None = None) -> bool:
        """Determines dynamically whether this fare adapter supports the specified city."""

    @abstractmethod
    async def fetch_station_pair_fares(
        self,
        city: str,
        from_station_id: str | None = None,
        to_station_id: str | None = None,
    ) -> list[TransitFareQuoteModel]:
        """Fetches station pair fares from the operator open-data API."""

    @abstractmethod
    async def fetch_city_quotes(self, city: str) -> list[TransitFareQuoteModel]:
        """Fetches all available active quotes for the city."""
