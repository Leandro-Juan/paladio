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
    arrival_time: str = Field(
        ..., description="Local arrival time: YYYY-MM-DD HH:MM or ISO 8601"
    )
    flight_number: str | None = None
    airline: str | None = None


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
    meal_type: str = Field(..., description="Type of meal (e.g., LUNCH, DINNER).")
    start_time: time = Field(..., description="Earliest time the meal can start.")
    end_time: time = Field(..., description="Latest time the meal must end by.")


class TravelConstraints(BaseModel):
    origin_city: str | None = Field(
        default="Unknown", description="The city where the trip originates from."
    )
    destination_city: str | None = Field(
        default="Unknown", description="The city where the trip takes place."
    )
    budget_usd: float | None = Field(
        default=0.0, description="Maximum budget for the entire trip in USD.", ge=0
    )
    flight_cost: float = Field(default=0.0, description="Cost of the flight.")
    start_date: date | None = Field(
        default=None, description="Start date of the itinerary."
    )
    end_date: date | None = Field(
        default=None, description="End date of the itinerary."
    )
    nodes: list[NodeConstraint] = Field(
        default_factory=list, description="List of POIs or destinations to visit."
    )
    meals: list[MealRequirement] = Field(
        default_factory=list,
        description="Mandatory meal windows. Must be an EMPTY list [] unless the user explicitly asks for meals.",
    )
    clarification_needed: str | None = Field(
        default=None,
        description="If the user's input is ambiguous (e.g. Madrid, Spain vs Madrid, New Mexico, currency of budget), provide a question here to ask the user. Leave null if everything is clear.",
    )
    booking_anchors: BookingAnchors | None = Field(
        default=None, description="Extracted flight and hotel bookings"
    )

    @model_validator(mode="before")
    @classmethod
    def parse_stringified_lists(cls, values):
        if isinstance(values, dict):
            for field in ["nodes", "meals"]:
                if field in values and isinstance(values[field], str):
                    try:
                        values[field] = json.loads(values[field])
                    except json.JSONDecodeError:
                        pass
        return values
