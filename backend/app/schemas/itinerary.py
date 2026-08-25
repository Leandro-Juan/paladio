import json
from datetime import date, time
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator

class NodeConstraint(BaseModel):
    poi_id: str = Field(..., description="Unique identifier or name of the Point of Interest.")
    mandatory: bool = Field(default=False, description="Whether visiting this node is strictly required.")
    min_duration_minutes: int = Field(default=60, description="Minimum time to spend at this node in minutes.")

class MealRequirement(BaseModel):
    meal_type: str = Field(..., description="Type of meal (e.g., LUNCH, DINNER).")
    start_time: time = Field(..., description="Earliest time the meal can start.")
    end_time: time = Field(..., description="Latest time the meal must end by.")

class TravelConstraints(BaseModel):
    origin_city: Optional[str] = Field(default="Unknown", description="The city where the trip originates from.")
    destination_city: Optional[str] = Field(default="Unknown", description="The city where the trip takes place.")
    budget_usd: Optional[float] = Field(default=0.0, description="Maximum budget for the entire trip in USD.", ge=0)
    flight_cost: float = Field(default=0.0, description="Cost of the flight.")
    start_date: Optional[date] = Field(default=None, description="Start date of the itinerary.")
    end_date: Optional[date] = Field(default=None, description="End date of the itinerary.")
    nodes: List[NodeConstraint] = Field(default_factory=list, description="List of POIs or destinations to visit.")
    meals: List[MealRequirement] = Field(default_factory=list, description="Mandatory meal windows.")
    clarification_needed: Optional[str] = Field(default=None, description="If the user's input is ambiguous (e.g. Madrid, Spain vs Madrid, New Mexico, currency of budget), provide a question here to ask the user. Leave null if everything is clear.")

    @model_validator(mode='before')
    @classmethod
    def parse_stringified_lists(cls, values):
        if isinstance(values, dict):
            for field in ['nodes', 'meals']:
                if field in values and isinstance(values[field], str):
                    try:
                        values[field] = json.loads(values[field])
                    except json.JSONDecodeError:
                        pass
        return values
