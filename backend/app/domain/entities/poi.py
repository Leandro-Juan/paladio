from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class Poi(BaseModel):
    id: str | None = None
    city: str
    name: str
    category: str
    location: dict[str, Any] = Field(default_factory=dict)
    schedule: dict[str, Any] = Field(default_factory=dict)
    financials: dict[str, Any] = Field(default_factory=dict)
    scoring: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    duration_mins: int = 60
    cost_eur: float = 0.0
    open_time_mins: int = 480
    close_time_mins: int = 1320

    @field_validator("duration_mins")
    @classmethod
    def check_duration(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("duration_mins must be strictly positive")
        return v

    @field_validator("cost_eur")
    @classmethod
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


class TransitEdge(BaseModel):
    duration_mins: int
    cost_eur: float = 0.0


class ScheduledPoi(BaseModel):
    poi: Poi
    scheduled_start: str
    scheduled_end: str


class Itinerary(BaseModel):
    total_score: float
    total_cost_eur: float
    total_time_mins: int
    path: list[ScheduledPoi]
