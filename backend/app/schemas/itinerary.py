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
    budget_usd: float = Field(..., description="Maximum budget for the entire trip in USD.", gt=0)
    start_date: date = Field(..., description="Start date of the itinerary.")
    end_date: date = Field(..., description="End date of the itinerary.")
    nodes: List[NodeConstraint] = Field(default_factory=list, description="List of POIs or destinations to visit.")
    meals: List[MealRequirement] = Field(default_factory=list, description="Mandatory meal windows.")

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
