"""Feed Source abstraction for multi-source GTFS feed resolution.

Fulfills PLAN.md Phase 1:
- IFeedSource interface
- Heterogeneous sources: Mobility Database, Transitland, National Portals, and DB overrides
- Structured feed candidate metadata with license, auth requirements, and coverage bounds.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class FeedCandidate:
    feed_id: str
    source: str  # "mobility_database", "transitland", "national_portal", "db_override"
    name: str
    provider: str
    download_url: str
    country_code: str
    bbox: tuple[float, float, float, float] | None = (
        None  # (min_lat, min_lon, max_lat, max_lon)
    )
    subdivision: str = ""
    municipality: str = ""
    modes: list[str] = field(
        default_factory=list
    )  # ["metro", "bus", "rail", "tram", "ferry"]
    is_official: bool = False
    licence: str = "open"  # "CC-BY", "ODbL", "Proprietary", "Unknown"
    requires_auth: bool = False
    auth_header_or_param: str | None = None
    feed_valid_from: datetime | None = None
    feed_valid_to: datetime | None = None
    raw_metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def bbox_area(self) -> float:
        if not self.bbox:
            return 999.0
        min_lat, min_lon, max_lat, max_lon = self.bbox
        d_lat = max(0.0, max_lat - min_lat)
        d_lon = (
            max_lat - min_lat
            if min_lon <= max_lon
            else (180.0 - min_lon) + (max_lon - (-180.0))
        )
        return d_lat * d_lon


class IFeedSource(abc.ABC):
    """Abstract interface for GTFS feed catalog sources."""

    @property
    @abc.abstractmethod
    def source_name(self) -> str:
        """Name of the feed source."""
        pass

    @abc.abstractmethod
    async def search_feeds(
        self,
        city_key: str,
        name: str,
        country_code: str,
        aliases: list[str],
        center_lat: float | None = None,
        center_lon: float | None = None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> list[FeedCandidate]:
        """Searches for feeds matching the target city."""
        pass
