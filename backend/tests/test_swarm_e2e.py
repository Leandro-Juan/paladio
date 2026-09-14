import os

import pytest
from langchain_core.messages import HumanMessage

os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11435")
os.environ.setdefault("ROUTER_MODEL", "llama3.1:latest")
os.environ.setdefault("VALIDATOR_MODEL", "llama3.1:latest")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.swarm.graph import graph
from app.infrastructure.providers.travel_data import DefaultTravelDataProvider


import urllib.request
import urllib.error


def is_ollama_running():
    try:
        urllib.request.urlopen("http://localhost:11435/", timeout=1)
        return True
    except Exception:
        return False


@pytest.mark.asyncio
@pytest.mark.skip(reason="LLM inference too slow for local tests")
@pytest.mark.skipif(
    not is_ollama_running(),
    reason="Requires a live local Ollama container running llama3.1 on port 11435",
)
async def test_full_trip_generation():
    prompt = "Plan a 2 day trip from London to Oporto with a budget of 500 dollars. I want breakfast, lunch, and dinner each day."

    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "intent": "REACTIVE_PLANNING",
        "error_count": 0,
        "test_data": {
            "flights": [
                {"price": 50, "arrival_time": "10:00", "departure_time": "08:00"}
            ],
            "return_flights": [
                {"price": 50, "arrival_time": "20:00", "departure_time": "18:00"}
            ],
            "hotels": [
                {
                    "name": "Test Hotel",
                    "location": {"latitude": 0, "longitude": 0},
                    "financials": {"price_per_night": 100},
                }
            ],
            "restaurants": [
                {"name": "Test Rest", "location": {"latitude": 0, "longitude": 0}}
            ],
            "pois": [
                {
                    "name": "Test POI",
                    "category": "ATTRACTION",
                    "location": {"latitude": 0, "longitude": 0},
                    "financials": {"estimated_cost": 10},
                    "schedule": {"recommended_duration_minutes": 60},
                }
            ],
        },
    }

    # Run graph with test_data injected to bypass actual scraping in CI
    provider = DefaultTravelDataProvider(test_data=initial_state["test_data"])
    final_state = await graph.ainvoke(
        initial_state,
        config={
            "configurable": {"thread_id": "test_e2e", "travel_data_provider": provider}
        },
    )

    assert "final_itinerary" in final_state, "Should generate an itinerary"
    assert "days" in final_state["final_itinerary"]
    assert len(final_state["final_itinerary"]["days"]) == 2
