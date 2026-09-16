from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PoiLocation(BaseModel):
    latitude: float | None = None
    longitude: float | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class PoiMetadata(BaseModel):
    scraped_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class PoiSchedule(BaseModel):
    osm_opening_hours: str | None = None
    opening_time_local: str | None = None
    closing_time_local: str | None = None
    recommended_duration_minutes: int | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class PoiFinancials(BaseModel):
    is_free: bool | None = None
    estimated_cost: float | None = None
    currency: str | None = None
    price_tier: str | None = None
    is_estimated: bool = True
    price_source: str | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class PoiScoring(BaseModel):
    rating: float | None = None
    reviews: int | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)


class Poi(BaseModel):
    id: str | None = None
    city: str
    name: str
    category: str
    location: PoiLocation = Field(default_factory=PoiLocation)
    schedule: PoiSchedule = Field(default_factory=PoiSchedule)
    financials: PoiFinancials = Field(default_factory=PoiFinancials)
    scoring: PoiScoring = Field(default_factory=PoiScoring)
    metadata: PoiMetadata = Field(default_factory=PoiMetadata)
    duration_mins: int = 60
    cost_eur: float = 0.0
    cost_is_estimated: bool = True
    cost_source: str | None = None
    open_time_mins: int = 480
    close_time_mins: int = 1320
    embedding: list[float] | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    @field_validator("duration_mins")
    def check_duration(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("duration_mins must be strictly positive")
        return v

    @field_validator("cost_eur")
    def check_cost(cls, v: float) -> float:
        if v < 0:
            raise ValueError("cost_eur must be greater than or equal to 0")
        return v

    @model_validator(mode="after")
    def check_time_bounds(self) -> "Poi":
        if self.open_time_mins >= self.close_time_mins:
            raise ValueError("open_time_mins must be before close_time_mins")
        return self


class ScoredPoi(BaseModel):
    poi: Poi
    score: float


TransitCell = tuple[int, float]  # (duration_mins, cost_eur)
TransitMatrix = list[list[TransitCell]]


class TransitStep(BaseModel):
    type: str  # "walk", "transit_board", "transit_alight", "transfer"
    instruction: str
    duration_mins: int
    distance_km: float = 0.0
    transit_line: str | None = None
    headsign: str | None = None
    station_name: str | None = None


class TransitLeg(BaseModel):
    duration_mins: int
    cost_eur: float = 0.0
    cost_is_estimated: bool = False
    price_source: str | None = None
    mode: str = "multimodal"  # "multimodal", "pedestrian", "transit"
    steps: list[TransitStep] = Field(default_factory=list)
    airport_surcharge_eur: float = 0.0


class TransitRecommendation(BaseModel):
    type: str  # "24H_PASS_RECOMMENDED" | "SINGLE_TICKETS_OPTIMAL"
    single_tickets_total_eur: float
    pass_name: str | None = None
    pass_price_eur: float | None = None
    savings_eur: float = 0.0
    includes_airport: bool = False
    message: str | None = None


class ScheduledPoi(BaseModel):
    poi: Poi
    scheduled_start: str
    scheduled_end: str
    transit_from_previous: TransitLeg | None = None


class Itinerary(BaseModel):
    total_score: float
    total_cost_eur: float
    total_time_mins: int
    path: list[ScheduledPoi]
    transit_recommendation: TransitRecommendation | None = None
