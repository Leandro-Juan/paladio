"""Pydantic schemas defining the .trip file package format and manifest."""

from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class FileManifestItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sha256: str
    size_bytes: int


class BoundingBox(BaseModel):
    model_config = ConfigDict(extra="ignore")

    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float


class GeneratorInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = "Paladio Backend"
    version: str = "1.0.0"


class TripPackageManifest(BaseModel):
    """Schema for root paladio.json inside the .trip archive."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    schema_url: str = Field(
        default="https://paladio.app/schemas/v1/trip-package.json",
        alias="$schema",
    )
    format_version: str = "1.0.0"
    generator: GeneratorInfo = Field(default_factory=GeneratorInfo)
    trip_id: str
    export_profile: str = "full_vault"  # "full_vault" | "community_shareable"
    created_at: str
    title: str
    destination: str
    destination_timezone: str | None = None
    start_date: str
    end_date: str
    bounding_box: BoundingBox | None = None
    file_manifest: dict[str, FileManifestItem] = Field(default_factory=dict)


class TripItineraryPackage(BaseModel):
    """Schema for itinerary.json."""

    model_config = ConfigDict(extra="ignore")

    trip_id: str
    destination: str
    start_date: str
    end_date: str
    days: list[dict[str, Any]] = Field(default_factory=list)
    routes: list[dict[str, Any]] = Field(default_factory=list)
    travel_constraints: dict[str, Any] = Field(default_factory=dict)


class TripWalletPackage(BaseModel):
    """Schema for wallet.json."""

    model_config = ConfigDict(extra="ignore")

    tickets: list[dict[str, Any]] = Field(default_factory=list)
    booking_anchors: dict[str, Any] = Field(default_factory=dict)
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class TripExpensePackage(BaseModel):
    """Schema for expenses.json."""

    model_config = ConfigDict(extra="ignore")

    currency: str = "EUR"
    participants: list[dict[str, Any]] = Field(default_factory=list)
    expenses: list[dict[str, Any]] = Field(default_factory=list)
    settlement: dict[str, Any] = Field(default_factory=dict)


class TripCollectionPackage(BaseModel):
    """Schema for collections.json."""

    model_config = ConfigDict(extra="ignore")

    collections: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[dict[str, Any]] = Field(default_factory=list)
