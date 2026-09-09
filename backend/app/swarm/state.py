from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class SwarmState(TypedDict):
    messages: Annotated[list, add_messages]
    validated_itinerary: dict | None
    error_count: int
    final_itinerary: dict | None
    test_data: dict | None
    daily_pois_data: list | None
    outbound_flight: dict | None
    return_flight: dict | None
    booking_text: str | None
    booking_anchors: dict | None
    manual_constraints: dict | None
    prompt_analysis: dict | None
