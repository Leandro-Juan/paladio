"""Domain entity representing a City in the Paladio Itinerary engine."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class City(BaseModel):
    """Canonical representation of an ingested, planned destination city."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Canonical unique identifier, e.g. 'madrid_es'")
    name: str = Field(
        ..., description="Primary display name of the city, e.g. 'Madrid'"
    )
    aliases: list[str] = Field(
        default_factory=list, description="Alternative names or spellings"
    )
    country_code: str = Field(
        ..., description="ISO 3166-1 alpha-2 country code, e.g. 'ES'"
    )
    center_lat: float = Field(
        ..., description="Tourist-core median / centroid latitude"
    )
    center_lon: float = Field(
        ..., description="Tourist-core median / centroid longitude"
    )
    bbox: list[float] = Field(
        ...,
        description="Bounding box [min_lat, min_lon, max_lat, max_lon]",
    )
    radius_km: float = Field(
        default=15.0, description="Tourist-core operational radius in km"
    )
    timezone: str = Field(
        default="UTC", description="IANA timezone name, e.g. 'Europe/Madrid'"
    )
    currency: str = Field(
        default="EUR", description="ISO 4217 currency code, e.g. 'EUR'"
    )
    profile: dict[str, Any] = Field(
        default_factory=dict,
        description="Dynamic city profile (local meal rhythm, walkability index, etc.)",
    )
    ingested_at: datetime | None = Field(
        default=None, description="Timestamp of last OSM ingestion"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @property
    def center(self) -> tuple[float, float]:
        return (self.center_lat, self.center_lon)
