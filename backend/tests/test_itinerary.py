import asyncio
import json
import os
from dotenv import load_dotenv, find_dotenv
from langchain_core.messages import HumanMessage

# Find and load the root .env file automatically
load_dotenv(find_dotenv(usecwd=True))

# Set local fallback URLs to point to your Docker containers from the host machine
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11435")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/paladio")

from app.swarm.graph import graph

async def main():
    print("Welcome to the Paladio Itinerary Tester!")
    print("----------------------------------------")
    print("This script will run your request through the entire LangGraph pipeline,")
    print("triggering the router, validator, scrapers, and C++ optimization engine.")
    print("Note: With strict real-data enforcement, this may take a moment or crash if data is unfound.\n")
    
    prompt = input("Enter your travel request (e.g., 'I want to go to OPO for 3 days next Friday from MAD with 1000 euros'):\n> ")
    
    if not prompt.strip():
        print("Empty prompt. Exiting.")
        return
        
    print("\n[Paladio] Starting inference...")
    
    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "error_count": 0
    }
    
    from langgraph.types import Command
    config = {"configurable": {"thread_id": "test-1"}}
    input_data = initial_state
    
    try:
        while True:
            # Stream updates to show progress
            async for chunk in graph.astream(input_data, config, stream_mode="updates"):
                for node_name, state_update in chunk.items():
                    if node_name == "router":
                        print(f"-> [ROUTER] Intent identified: {state_update.get('intent', 'UNKNOWN')}")
                        
                    elif node_name == "rag":
                        print("-> [RAG] Database context retrieved.")
                        
                    elif node_name == "validator":
                        constraints = state_update.get("validated_itinerary")
                        if constraints:
                            print(f"-> [VALIDATOR] Extracted constraints: {constraints.origin_city} -> {constraints.destination_city} | {constraints.start_date} to {constraints.end_date} | Budget: {constraints.budget_usd}")
                            print("-> [VALIDATOR] Handing off to planner (Scraping real data...)")
                            
                    elif node_name == "planner":
                        print("-> [PLANNER] Itinerary optimization complete.")
                        final_itinerary = state_update.get("final_itinerary", {})
                        
                        if "error" in final_itinerary:
                            print(f"\n❌ [ERROR] {final_itinerary['error']}")
                        else:
                            print("\n================ FINAL ITINERARY ================\n")
                            # Print the JSON nicely formatted
                            print(json.dumps(final_itinerary, indent=2, ensure_ascii=False))
                            print("\n=================================================")
            
            # Check if the graph is paused due to an interrupt
            state = await graph.aget_state(config)
            if state.next:
                task = state.tasks[0]
                interrupts = task.interrupts
                if interrupts:
                    question = interrupts[0].value
                    answer = input(f"\n[Paladio] {question}\n> ")
                    input_data = Command(resume=answer)
            else:
                # Graph finished completely
                break
                        
    except Exception as e:
        print(f"\n❌ Pipeline crashed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
