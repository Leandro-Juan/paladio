from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class Financials(BaseModel):
    price: float = Field(description="Total price")
    currency: str = Field(description="Currency code (e.g. USD, EUR)")


class Booking(BaseModel):
    provider_url: str = Field(
        description="URL to book the item, must include parameters for 2 adults"
    )


class Metadata(BaseModel):
    scraped_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When this data was scraped",
    )
    source: str = Field(
        description="Source of the data (e.g., 'Skyscanner', 'Booking.com')"
    )


class Location(BaseModel):
    latitude: float
    longitude: float


class Scoring(BaseModel):
    rating: float | None = Field(default=None, description="Rating of the attraction")
    reviews: int | None = Field(default=None, description="Number of reviews")


class Schedule(BaseModel):
    opening_time_local: str = Field(description="Opening time in HH:MM format")
    closing_time_local: str = Field(description="Closing time in HH:MM format")
    recommended_duration_minutes: int = Field(
        description="Recommended visit duration in minutes"
    )


class MealSuitability(BaseModel):
    is_breakfast: bool = False
    is_lunch: bool = False
    is_dinner: bool = False
    is_snack: bool = False


class FoodFinancials(BaseModel):
    price_tier: str = Field(
        description="Exact price tier string from source (e.g., '$', '$$', '$$$')"
    )
    currency: str = Field(
        default="EUR", description="Currency (often inferred/default)"
    )


class FoodAndDrink(BaseModel):
    id: str = Field(description="Unique identifier for the location")
    type: Literal["food_and_drink"] = "food_and_drink"
    category: str = Field(
        description="Main category (e.g. restaurant, cafe_bakery, bar)"
    )
    name: str = Field(description="Name of the establishment")
    location: Location
    schedule: Schedule
    meal_suitability: MealSuitability
    financials: FoodFinancials
    scoring: Scoring
    cuisine: list[str] = Field(
        description="List of cuisines (e.g. ['Indian', 'Vegetarian'])"
    )
    dietary_options: list[str] = Field(
        description="Dietary tags (e.g. 'Vegetarian friendly')"
    )
    metadata: Metadata


class AttractionFinancials(BaseModel):
    is_free: bool = Field(description="Whether the attraction is completely free")
    estimated_cost: float | None = Field(
        description="Estimated cost of entry, if known"
    )
    currency: str | None = Field(
        default="EUR", description="Currency of the estimated cost"
    )


class AttractionSchedule(BaseModel):
    osm_opening_hours: str | None = Field(
        description="Raw OSM opening_hours string (e.g., 'Mo,We-Su 09:00-18:00')"
    )
    recommended_duration_minutes: int = Field(
        description="Recommended visit duration in minutes"
    )


class Attraction(BaseModel):
    id: str = Field(
        description="Unique identifier for the attraction (e.g. OSM node ID)"
    )
    type: Literal["attraction"] = "attraction"
    category: Literal[
        "museum",
        "monument",
        "historic_site",
        "landmark",
        "attraction",
        "restaurant",
        "cafe",
        "bar",
        "pub",
    ]
    name: str = Field(description="Name of the attraction")
    location: Location
    schedule: AttractionSchedule
    financials: AttractionFinancials
    scoring: Scoring
    metadata: Metadata
    embedding: list[float] | None = None
