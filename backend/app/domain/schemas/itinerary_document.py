from __future__ import annotations

import uuid
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class TransitStep(BaseModel):
    model_config = ConfigDict(extra="allow")

    instruction: Optional[str] = None
    distance_km: Optional[float] = None
    duration_minutes: Optional[float] = None
    street_name: Optional[str] = None


class TransitLeg(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: str = "walk"
    duration_minutes: float = 0.0
    distance_km: float = 0.0
    cost_usd: float = 0.0
    steps: list[TransitStep | dict[str, Any]] = Field(default_factory=list)
    geometry: Optional[str | list[Any]] = None
    from_poi_name: Optional[str] = None
    to_poi_name: Optional[str] = None
    route_short_name: Optional[str] = None
    headsign: Optional[str] = None
    cost_is_estimated: Optional[bool] = False


class Stop(BaseModel):
    model_config = ConfigDict(extra="allow")

    stop_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    poi: dict[str, Any] = Field(default_factory=dict)
    scheduled_start: Optional[int | str] = None
    scheduled_end: Optional[int | str] = None
    duration: Optional[int] = 60
    transit_from_previous: Optional[TransitLeg | dict[str, Any]] = None
    is_locked: Optional[bool] = False
    is_fixed: Optional[bool] = False
    notes: Optional[str] = None
    custom_stop: Optional[bool] = False

    @model_validator(mode="before")
    @classmethod
    def ensure_stop_id(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if not values.get("stop_id"):
                values["stop_id"] = str(uuid.uuid4())
        return values


class DayItinerary(BaseModel):
    model_config = ConfigDict(extra="allow")

    path: list[Stop] = Field(default_factory=list)
    total_time: Optional[float | int] = 0
    total_cost: Optional[float | int] = 0.0
    total_distance_km: Optional[float | int] = 0.0


class DayPlan(BaseModel):
    model_config = ConfigDict(extra="allow")

    day: int = 1
    date: Optional[str] = None
    itinerary: DayItinerary = Field(default_factory=DayItinerary)
    flight_info: Optional[dict[str, Any]] = None
    lodging: Optional[dict[str, Any]] = None
    hotel_depot: Optional[dict[str, Any]] = None
    locked_stops: Optional[list[str]] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_day(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if "day" not in values and "day_number" in values:
                values["day"] = values["day_number"]
            if "day" not in values:
                values["day"] = 1
        return values


class ItineraryDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    days: list[DayPlan] = Field(default_factory=list)
    travel_constraints: Optional[dict[str, Any]] = None
    photos: Optional[list[dict[str, Any] | str]] = None
    participants: Optional[list[dict[str, Any] | str]] = None
    metadata: Optional[dict[str, Any]] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_document(cls, values: Any) -> Any:
        if isinstance(values, dict):
            days_val = values.get("days")
            if isinstance(days_val, int):
                values["days"] = [{"day": i + 1} for i in range(days_val)]
            elif not isinstance(days_val, list):
                values["days"] = []
        return values

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> tuple[ItineraryDocument, bool]:
        """
        Parses itinerary dictionary into ItineraryDocument.
        Returns a tuple of (ItineraryDocument, was_modified).
        was_modified is True if any stop was missing a stop_id and had one generated.
        """
        was_modified = False
        if not isinstance(data, dict):
            return cls(), False

        days = data.get("days", [])
        if isinstance(days, list):
            for d in days:
                if isinstance(d, dict):
                    itin = d.get("itinerary")
                    if isinstance(itin, dict):
                        path = itin.get("path")
                        if isinstance(path, list):
                            for s in path:
                                if isinstance(s, dict) and not s.get("stop_id"):
                                    was_modified = True
                                    s["stop_id"] = str(uuid.uuid4())

        doc = cls.model_validate(data)
        return doc, was_modified

    def to_dict(self) -> dict[str, Any]:
        """Serializes back to a clean dictionary matching JSONB requirements."""
        return self.model_dump(mode="json", exclude_none=False)

    def find_stop(
        self, stop_id: str
    ) -> tuple[Optional[int], Optional[int], Optional[Stop]]:
        """
        Finds a stop by its stop_id.
        Returns (day_index, stop_index, Stop) or (None, None, None).
        """
        for d_idx, day_plan in enumerate(self.days):
            for s_idx, stop in enumerate(day_plan.itinerary.path):
                if stop.stop_id == stop_id:
                    return d_idx, s_idx, stop
        return None, None, None
