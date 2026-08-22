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
    print("Welcome to the Paladio Itinerary Tester (Manual Mode)!")
    print("----------------------------------------")
    print("This script will run your request through the entire LangGraph pipeline,")
    print("triggering the router, validator, and C++ optimization engine.")
    print("Note: This version uses FAKE DATA (test_data.json) to bypass live scrapers.\n")
    
    prompt = input("Enter your travel request (e.g., 'I want to go to BCN for 5 days next Friday from LON with 2000 euros'):\n> ")
    
    from rich.console import Console
    console = Console()
    
    if not prompt.strip():
        console.print("[bold red]Empty prompt. Exiting.[/bold red]")
        return
        
    console.print("\n[bold blue][Paladio] Starting inference with fake data...[/bold blue]")
    
    # Load the fake test dataset generated earlier
    try:
        with open("test_data.json", "r") as f:
            test_data = json.load(f)
            
        # Remove fake POIs so the graph fetches REAL attractions from PostgreSQL
        if test_data and "pois" in test_data:
            del test_data["pois"]
            
    except FileNotFoundError:
        console.print("[bold yellow]Warning: test_data.json not found, proceeding without fake data.[/bold yellow]")
        test_data = None

    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "test_data": test_data,
        "error_count": 0
    }
    
    from langgraph.types import Command
    config = {"configurable": {"thread_id": "test-manual-1"}}
    input_data = initial_state
    
    try:
        while True:
            # Determine starting status message based on where the graph is
            state = await graph.aget_state(config)
            if state.next:
                status_msg = f"[bold green]Resuming {state.next[0]} node..."
            else:
                status_msg = "[bold green]Router agent classifying intent..."
                
            # Stream updates to show progress
            with console.status(status_msg, spinner="dots") as status:
                async for chunk in graph.astream(input_data, config, stream_mode="updates"):
                    for node_name, state_update in chunk.items():
                        if node_name == "router":
                            console.print(f"-> [ROUTER] Intent identified: [bold]{state_update.get('intent', 'UNKNOWN')}[/bold]")
                            status.update("[bold cyan]Querying vector database for context...")
                            
                        elif node_name == "rag":
                            console.print("-> [RAG] Database context retrieved.")
                            status.update("[bold magenta]Validator agent analyzing travel constraints (this may take a moment)...")
                            
                        elif node_name == "check_missing":
                            console.print("-> [CHECK] User provided missing constraints.")
                            status.update("[bold yellow]Planner agent orchestrating itinerary and fetching POIs from database...")
                            
                        elif node_name == "validator":
                            from app.schemas.itinerary import TravelConstraints
                            constraints_dict = state_update.get("validated_itinerary")
                            if constraints_dict:
                                constraints = TravelConstraints(**constraints_dict)
                                console.print(f"-> [VALIDATOR] Extracted constraints: [cyan]{constraints.origin_city} -> {constraints.destination_city}[/cyan] | [yellow]{constraints.start_date} to {constraints.end_date}[/yellow] | Budget: [green]${constraints.budget_usd}[/green]")
                                console.print("-> [VALIDATOR] Handing off to planner (Using fake data...)")
                            status.update("[bold yellow]Planner agent orchestrating itinerary and running C++ engine (using fake data)...")
                            
                        elif node_name == "planner":
                            console.print("-> [PLANNER] Itinerary optimization complete.")
                            final_itinerary = state_update.get("final_itinerary", {})
                            
                            if "error" in final_itinerary:
                                console.print(f"\n❌ [ERROR] {final_itinerary['error']}", style="bold red")
                            else:
                                console.print("\n================ FINAL ITINERARY ================\n", style="bold green")
                                # Print the JSON nicely formatted
                                console.print(json.dumps(final_itinerary, indent=2, ensure_ascii=False))
                                console.print("\n=================================================", style="bold green")
            
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
        console.print(f"\n❌ Pipeline crashed: {e}", style="bold red")

if __name__ == "__main__":
    asyncio.run(main())
