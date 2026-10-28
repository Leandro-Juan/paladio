"""Abstract repository port for Derived Transit data."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ITransitRepository(ABC):
    """Abstract port for accessing derived GTFS transit data and cache state."""

    @abstractmethod
    async def get_transit_cache(self, city: str) -> dict[str, Any] | None:
        """Retrieves the TransitCacheModel record for a city."""
        pass

    @abstractmethod
    async def get_active_build_id(self, city: str) -> str | None:
        """Retrieves active_build_id for a city from transit_cache."""
        pass

    @abstractmethod
    async def get_agencies(self, city: str, build_id: str) -> list[dict[str, Any]]:
        """Retrieves agencies for a city build."""
        pass

    @abstractmethod
    async def get_lines(
        self, city: str, build_id: str, mode: str | None = None
    ) -> list[dict[str, Any]]:
        """Retrieves all lines for a city build, optionally filtered by mode."""
        pass

    @abstractmethod
    async def get_line_detail(
        self, city: str, build_id: str, line_id: str
    ) -> dict[str, Any] | None:
        """Retrieves line metadata, patterns, ordered stations, and geometry."""
        pass

    @abstractmethod
    async def get_stations_by_bbox(
        self,
        city: str,
        build_id: str,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Retrieves stations inside a bounding box with serving line chips."""
        pass

    @abstractmethod
    async def get_station_detail(
        self, city: str, build_id: str, station_id: str
    ) -> dict[str, Any] | None:
        """Retrieves complete station detail: lines, directions, service summary, transfers."""
        pass

    @abstractmethod
    async def get_station_departures(
        self,
        city: str,
        build_id: str,
        station_id: str,
        target_date: str,
        target_seconds: int,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Retrieves scheduled departures for a station at/after target_seconds on target_date."""
        pass

    @abstractmethod
    async def get_osm_stations_by_bbox(
        self,
        city: str,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Limited mode fallback: retrieves stations from attractions table (OSM-transit-*)."""
        pass
