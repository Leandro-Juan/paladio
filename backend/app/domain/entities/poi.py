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
    scoring: PoiScoring = Field(default_factory=PoiScoring)
    metadata: PoiMetadata = Field(default_factory=PoiMetadata)
    open_time_mins_by_day: list[int] = Field(default_factory=lambda: [480] * 7)
    close_time_mins_by_day: list[int] = Field(default_factory=lambda: [1320] * 7)
    duration_mins: int = 60
    cost_eur: float = 0.0
    cost_is_estimated: bool = True
    cost_source: str | None = None
    osm_opening_hours: str | None = None
    embedding: list[float] | None = None

    model_config = ConfigDict(extra="allow")

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    @property
    def open_time_mins(self) -> int:
        """
        Safe legacy property fallback: returns the first day with a valid opening minute
        (protecting callers if closed on Mondays). Falls back to 480 if closed all week.
        """
        for val in self.open_time_mins_by_day:
            if val != -1:
                return val
        return 480

    @property
    def close_time_mins(self) -> int:
        """
        Safe legacy property fallback: returns the first day with a valid closing minute.
        Falls back to 1320 if closed all week.
        """
        for val in self.close_time_mins_by_day:
            if val != -1:
                return val
        return 1320

    @model_validator(mode="before")
    @classmethod
    def normalize_inputs(cls, data: Any) -> Any:
        """
        Parses legacy dictionaries containing 'schedule' or 'financials' into canonical
        scalars and 7-day vectors, and drops the redundant sub-models.
        """
        if not isinstance(data, dict):
            return data

        d = dict(data)
        from app.utils.opening_hours_parser import parse_osm_opening_hours

        if "schedule" in d and isinstance(d["schedule"], dict):
            sched = d.pop("schedule")
            osm_h = sched.get("osm_opening_hours")
            if osm_h and not d.get("open_time_mins_by_day"):
                parsed = parse_osm_opening_hours(osm_h)
                d["open_time_mins_by_day"] = parsed.open_time_mins_by_day
                d["close_time_mins_by_day"] = parsed.close_time_mins_by_day
                d["osm_opening_hours"] = osm_h
            if "open_time_mins" in sched and "open_time_mins" not in d:
                d["open_time_mins"] = sched["open_time_mins"]
            if "close_time_mins" in sched and "close_time_mins" not in d:
                d["close_time_mins"] = sched["close_time_mins"]
            if "recommended_duration_minutes" in sched and "duration_mins" not in d:
                d["duration_mins"] = sched["recommended_duration_minutes"]

        if "financials" in d and isinstance(d["financials"], dict):
            fin = d.pop("financials")
            if (
                "estimated_cost" in fin
                and fin["estimated_cost"] is not None
                and "cost_eur" not in d
            ):
                d["cost_eur"] = fin["estimated_cost"]
            elif "price" in fin and fin["price"] is not None and "cost_eur" not in d:
                d["cost_eur"] = fin["price"]
            if "is_estimated" in fin and "cost_is_estimated" not in d:
                d["cost_is_estimated"] = fin["is_estimated"]
            if "price_source" in fin and "cost_source" not in d:
                d["cost_source"] = fin["price_source"]

        if "open_time_mins" in d:
            val = d.pop("open_time_mins")
            if "open_time_mins_by_day" not in d:
                d["open_time_mins_by_day"] = [int(val)] * 7

        if "close_time_mins" in d:
            val = d.pop("close_time_mins")
            if "close_time_mins_by_day" not in d:
                d["close_time_mins_by_day"] = [int(val)] * 7

        return d

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
    def validate_vectors(self) -> "Poi":
        if (
            len(self.open_time_mins_by_day) != 7
            or len(self.close_time_mins_by_day) != 7
        ):
            raise ValueError(
                "open_time_mins_by_day and close_time_mins_by_day must have length 7"
            )
        for o, c in zip(self.open_time_mins_by_day, self.close_time_mins_by_day):
            if o != -1 and c != -1 and o >= c:
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
