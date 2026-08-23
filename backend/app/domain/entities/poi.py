from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Poi(BaseModel):
    id: Optional[str] = None
    city: str
    name: str
    category: str
    location: Dict[str, Any] = Field(default_factory=dict)
    schedule: Dict[str, Any] = Field(default_factory=dict)
    financials: Dict[str, Any] = Field(default_factory=dict)
    scoring: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    duration_mins: int = 60
    cost_eur: float = 0.0
    open_time_mins: int = 480
    close_time_mins: int = 1320

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
    path: List[ScheduledPoi]
