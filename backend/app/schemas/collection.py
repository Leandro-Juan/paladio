from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PoiSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str = "attraction"
    cost_eur: float = 0.0
    duration_mins: int = 60
    lat: float | None = None
    lng: float | None = None
    photo_url: str | None = None
    thumbnail_url: str | None = None
    rating: float | None = None
    formatted_address: str | None = None
    description: str | None = None
    city: str | None = None
    country: str | None = None
    country_code: str | None = None


class CollectionItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    collection_id: str
    poi_id: str
    notes: str | None = None
    visit_status: Literal["want_to_go", "visited", "skipped"] = "want_to_go"
    order_index: int = 0
    created_at: str
    poi: PoiSummary | None = None


class UpdateCollectionItemRequest(BaseModel):
    visit_status: Literal["want_to_go", "visited", "skipped"] | None = None
    notes: str | None = None


class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    color: str | None = Field("#0F4C5C", max_length=30)


class CollectionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    color: str | None = Field(None, max_length=30)


class CollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str | None = None
    name: str
    description: str | None = None
    color: str | None = "#0F4C5C"
    created_at: str
    updated_at: str
    items_count: int = 0
    items: list[CollectionItemResponse] = []
    trip_destination: str | None = None
    trip_title: str | None = None


class AddItemRequest(BaseModel):
    poi_id: str
    notes: str | None = None
    order_index: int | None = None


class PoiCollectionsResponse(BaseModel):
    poi_id: str
    collection_ids: list[str]


class ToggleCollectionRequest(BaseModel):
    collection_id: str


class ToggleCollectionResponse(BaseModel):
    poi_id: str
    collection_id: str
    saved: bool
    collection_ids: list[str]
