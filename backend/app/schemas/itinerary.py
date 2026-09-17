import json
from datetime import date, time

from pydantic import BaseModel, Field, model_validator


class FlightSegment(BaseModel):
    origin_iata: str = Field(..., description="3-letter IATA code of origin airport")
    destination_iata: str = Field(
        ..., description="3-letter IATA code of destination airport"
    )
    departure_time: str = Field(
        ..., description="Local departure time: YYYY-MM-DD HH:MM or ISO 8601"
    )
    arrival_time: str | None = Field(
        None,
        description="Local arrival time: YYYY-MM-DD HH:MM or ISO 8601, if available",
    )
    flight_duration_minutes: int | None = Field(
        None, description="Duration of the flight in minutes, if available"
    )
    flight_number: str | None = None
    airline: str | None = None

    direction: str | None = Field(
        None,
        description="'arrival' for trip inbound arrival flight, 'departure' for trip outbound return flight",
    )

    @model_validator(mode="after")
    def resolve_arrival_and_duration(self) -> "FlightSegment":
        from app.utils.timezone_utils import (
            calculate_timezone_aware_arrival,
            get_timezone_for_iata,
            parse_flexible_datetime,
        )

        if self.arrival_time is None and self.flight_duration_minutes is not None:
            self.arrival_time = calculate_timezone_aware_arrival(
                self.departure_time,
                self.flight_duration_minutes,
                self.origin_iata,
                self.destination_iata,
            )
        elif self.flight_duration_minutes is None and self.arrival_time is not None:
            try:
                dep_dt, _ = parse_flexible_datetime(self.departure_time)
                arr_dt, _ = parse_flexible_datetime(self.arrival_time)
                orig_tz = get_timezone_for_iata(self.origin_iata)
                dest_tz = get_timezone_for_iata(self.destination_iata)
                dep_aware = dep_dt.replace(tzinfo=orig_tz)
                arr_aware = arr_dt.replace(tzinfo=dest_tz)
                dur = int((arr_aware - dep_aware).total_seconds() // 60)
                if dur > 0:
                    self.flight_duration_minutes = dur
                else:
                    self.flight_duration_minutes = 120
            except Exception:
                self.flight_duration_minutes = 120
        elif self.arrival_time is None and self.flight_duration_minutes is None:
            # Default reasonable estimate if neither provided
            self.flight_duration_minutes = 120
            self.arrival_time = calculate_timezone_aware_arrival(
                self.departure_time,
                self.flight_duration_minutes,
                self.origin_iata,
                self.destination_iata,
            )
        return self


class HotelAnchor(BaseModel):
    name: str = Field(..., description="Name of the accommodation")
    address: str | None = Field(None, description="Full street address")
    city: str = Field(..., description="City name")
    check_in_date: str | None = None
    check_in_time: str | None = Field(None, description="HH:MM (24h format)")
    check_out_date: str | None = None


class BookingAnchors(BaseModel):
    outbound_flight: FlightSegment | None = None
    return_flight: FlightSegment | None = None
    hotel: HotelAnchor | None = None


class NodeConstraint(BaseModel):
    poi_id: str = Field(
        ..., description="Unique identifier or name of the Point of Interest."
    )
    mandatory: bool = Field(
        default=False, description="Whether visiting this node is strictly required."
    )
    min_duration_minutes: int = Field(
        default=60, description="Minimum time to spend at this node in minutes."
    )


class MealRequirement(BaseModel):
    meal_type: str = Field(
        ..., description="Type of meal (e.g., BREAKFAST, LUNCH, DINNER)."
    )
    start_time: time = Field(..., description="Earliest time the meal can start.")
    end_time: time = Field(..., description="Latest time the meal must end by.")


class TravelConstraints(BaseModel):
    origin_city: str | None = Field(
        default="Unknown", description="The city where the trip originates from."
    )
    destination_city: str | None = Field(
        default="Unknown", description="The city where the trip takes place."
    )
    budget_usd: float = Field(
        default=0.0, description="Maximum budget for the entire trip in USD.", ge=0
    )
    flight_cost: float = Field(default=0.0, description="Cost of the flight.")
    start_date: date | None = Field(
        default=None, description="Start date of the itinerary."
    )
    end_date: date | None = Field(
        default=None, description="End date of the itinerary."
    )
    nodes: list[NodeConstraint] | None = Field(
        default_factory=list,
        description="List of POIs or destinations to visit. Can be empty.",
    )
    meals: list[MealRequirement] | None = Field(
        default_factory=list,
        description="Mandatory meal windows. Must be empty unless the user explicitly asks for meals.",
    )
    clarification_needed: str | None = Field(
        default=None,
        description="Question to ask the user if their input is ambiguous.",
    )
    booking_anchors: BookingAnchors | None = Field(
        default=None, description="Extracted flight and hotel bookings"
    )
    preferred_cuisines: list[str] | None = Field(
        default_factory=list,
        description="User preferred cuisines extracted from human prompt (e.g. ['indian']).",
    )
    travel_tastes: list[str] | None = Field(
        default_factory=list,
        description="User travel styles, activity preferences, or tastes (e.g. ['bar', 'cultural']).",
    )
    tag_affinities: dict[str, float] | None = Field(
        default_factory=dict,
        description="Estimated tag affinities extracted from user prompt (art_culture, food_culinary, etc.).",
    )
    cuisine_target_frequency: int = Field(
        default=1,
        description="Target number of meal slots for preferred cuisine.",
    )

    @model_validator(mode="before")
    @classmethod
    def parse_stringified_lists(cls, values):
        if isinstance(values, dict):
            for field in ["nodes", "meals", "preferred_cuisines", "travel_tastes"]:
                if field in values:
                    if values[field] is None:
                        values[field] = []
                    elif isinstance(values[field], str):
                        try:
                            values[field] = json.loads(values[field])
                        except json.JSONDecodeError:
                            pass
            if "tag_affinities" in values and isinstance(values["tag_affinities"], str):
                try:
                    values["tag_affinities"] = json.loads(values["tag_affinities"])
                except json.JSONDecodeError:
                    pass
        return values
