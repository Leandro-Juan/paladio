import asyncio
import sys
import os
import logging
from datetime import date

# Set environment variables BEFORE importing any app modules
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11435")
os.environ.setdefault("ROUTER_MODEL", "llama3.1:latest")
os.environ.setdefault("VALIDATOR_MODEL", "llama3.1:latest")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.swarm.graph import graph
from langchain_core.messages import HumanMessage

logging.basicConfig(level=logging.INFO)

async def test_full_trip_generation():
    """
    Feeds a natural language prompt into the Swarm, expecting it to:
    1. Extract the destination_city (Oporto).
    2. Fetch real static POIs from the DB.
    3. Fetch dynamic Hotels/Restaurants via scrapers.
    4. Inject them into the C++ Engine via Valhalla transit mapping.
    """
    print("\n=== Starting End-to-End Swarm Run ===\n")
    
    prompt = "Plan a 2 day trip from London to Oporto with a budget of 500 dollars. I want breakfast, lunch, and dinner each day."
    
    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "intent": "REACTIVE_PLANNING",
        "retrieved_context": f"Today is {date.today()}.",
        "error_count": 0
    }
    
    final_state = await graph.ainvoke(initial_state)
    
    if "final_itinerary" in final_state:
        print("\n=== SUCCESS: Generated Itinerary ===")
        import json
        print(json.dumps(final_state["final_itinerary"], indent=2, default=str))
    else:
        print("\n=== FAILED: No itinerary generated ===")
        print(final_state)

if __name__ == "__main__":
    asyncio.run(test_full_trip_generation())
