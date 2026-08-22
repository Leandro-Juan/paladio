from typing import TypedDict, Annotated, List, Optional
from langgraph.graph.message import add_messages
from app.schemas.itinerary import TravelConstraints

class SwarmState(TypedDict):
    messages: Annotated[list, add_messages]
    intent: Optional[str]
    retrieved_context: Optional[str]
    validated_itinerary: Optional[dict]
    error_count: int
    final_itinerary: Optional[dict]
    test_data: Optional[dict]
