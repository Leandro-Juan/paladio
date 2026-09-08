import asyncio
import datetime
import json
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import find_dotenv, load_dotenv
import websockets
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

load_dotenv(find_dotenv(usecwd=True))

console = Console()


def prompt_user(text: str, default: str) -> str:
    console.print(f"[bold yellow]{text}[/bold yellow] [dim]({default})[/dim]:")
    val = input("> ").strip()
    return val if val else default


async def run_standalone_graph(
    origin: str,
    destination: str,
    start_date: str,
    end_date: str,
    budget_usd: float,
    query: str,
    booking_text: str,
    manual_constraints: dict,
):
    """Fallback runner executing the LangGraph pipeline directly in-process."""
    console.print(
        "\n[bold magenta]Running graph directly in-process (standalone mode)...[/bold magenta]\n"
    )

    from langchain_core.messages import HumanMessage
    from app.swarm.graph import graph
    from app.infrastructure.providers.travel_data import (
        LiveTravelDataProvider,
        MockTravelDataProvider,
    )
    from app.infrastructure.engine.bridge_adapter import CppOptimizationAdapter
    from app.infrastructure.engine.ml_scorer import MLScorer

    initial_state = {
        "messages": [HumanMessage(content=query)],
        "booking_text": booking_text,
        "manual_constraints": manual_constraints,
        "error_count": 0,
    }

    use_live = os.getenv("TEST_MODE") != "1"
    travel_provider = LiveTravelDataProvider() if use_live else MockTravelDataProvider()
    ml_scorer = MLScorer(ml_model=None, ml_params=None, user_repo=None)
    engine = CppOptimizationAdapter(ml_scorer=ml_scorer)

    config = {
        "configurable": {
            "thread_id": f"cli-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}",
            "travel_data_provider": travel_provider,
            "engine": engine,
            "user_id": "test_cli_user",
        }
    }

    input_data = initial_state
    final_result = None

    with console.status(
        "[bold green]Executing swarm pipeline...", spinner="dots"
    ) as status:
        from langgraph.types import Command

        while True:
            interrupted = False
            async for chunk in graph.astream(
                input_data, config=config, stream_mode="updates"
            ):
                if "__interrupt__" in chunk:
                    interrupt_val = chunk["__interrupt__"][0].value
                    status.stop()
                    console.print(
                        f"\n[bold red][CLARIFICATION NEEDED][/bold red] {interrupt_val}"
                    )
                    user_answer = input("Your response: ").strip()
                    input_data = Command(resume=user_answer)
                    status.start()
                    interrupted = True
                    break

                for node_name, state_update in chunk.items():
                    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
                    if not isinstance(state_update, dict):
                        continue

                    console.print(
                        f"[dim]{timestamp}[/dim] [bold blue][{node_name.upper()}][/bold blue] completed."
                    )

                    if node_name == "rag":
                        ctx = state_update.get("retrieved_context") or ""
                        val_it = state_update.get("validated_itinerary") or {}
                        nodes = val_it.get("nodes") or []
                        cuisines = val_it.get("preferred_cuisines") or []
                        tastes = val_it.get("travel_tastes") or []
                        console.print(
                            f"  [cyan]Extracted Mandatory POIs:[/cyan] {[n.get('poi_id') for n in nodes if n.get('mandatory')]}"
                        )
                        console.print(
                            f"  [cyan]Extracted Preferences:[/cyan] cuisines={cuisines}, tastes={tastes}"
                        )
                        if ctx:
                            console.print(
                                f"  [dim]Retrieved Context: {ctx[:160]}...[/dim]"
                            )

                    elif node_name == "planner_scrape":
                        daily_pois = state_update.get("daily_pois_data") or []
                        total_pois = sum(len(d) for d in daily_pois)
                        console.print(
                            f"  [green]Scraped Context:[/green] {total_pois} candidates across {len(daily_pois)} days."
                        )

                    elif node_name == "planner_optimize":
                        final_result = state_update.get("final_itinerary")

            if not interrupted:
                break

    return final_result


async def test_websocket():
    console.print(
        Panel.fit(
            "[bold cyan]Paladio Itinerary Swarm Client[/bold cyan]\n"
            "[dim]Interactive end-to-end trip creation and testing tool[/dim]",
            border_style="cyan",
        )
    )

    # 1. Interactive Inputs with intelligent defaults
    origin = prompt_user("Enter origin city", "Madrid")
    destination = prompt_user("Enter destination city", "Paris")
    start_date = prompt_user("Enter start date (YYYY-MM-DD)", "2026-09-10")
    end_date = prompt_user("Enter end date (YYYY-MM-DD)", "2026-09-15")
    hotel_name = prompt_user("Enter accommodation / hotel name", "The Grand Hotel")

    budget_input = prompt_user("Enter trip budget in USD", "1500")
    try:
        budget_usd = float(budget_input)
    except ValueError:
        budget_usd = 1500.0

    query = prompt_user(
        "Enter your POI preferences / RAG prompt",
        "I need to visit the Louvre and Eiffel Tower. i love french and indian cuisine with relaxed bars",
    )

    from app.utils.iata_mapping import get_iata_code

    orig_iata = get_iata_code(origin)
    dest_iata = get_iata_code(destination)

    # 2. Build mock tickets
    booking_text = (
        f"Flight outbound {orig_iata} to {dest_iata} on {start_date} 10:00 (duration 180m). "
        f"Flight return {dest_iata} to {orig_iata} on {end_date} 14:00 (duration 180m). "
        f"{hotel_name} booked in {destination} from {start_date} to {end_date}."
    )

    manual_constraints = {
        "origin_city": origin,
        "destination_city": destination,
        "start_date": start_date,
        "end_date": end_date,
        "budget_usd": budget_usd,
        "meals": [
            {"meal_type": "LUNCH", "start_time": "12:00", "end_time": "14:30"},
            {"meal_type": "DINNER", "start_time": "19:30", "end_time": "22:00"},
        ],
    }

    # Summary Panel
    summary_table = Table(
        title="Generated Trip Configuration", border_style="bright_blue"
    )
    summary_table.add_column("Property", style="bold cyan")
    summary_table.add_column("Value", style="white")
    summary_table.add_row(
        "Route", f"{origin} ({orig_iata}) ➔ {destination} ({dest_iata})"
    )
    summary_table.add_row("Dates", f"{start_date} to {end_date}")
    summary_table.add_row("Budget", f"${budget_usd:,.2f} USD")
    summary_table.add_row("Accommodation", f"{hotel_name} ({destination})")
    summary_table.add_row("Prompt", query)
    summary_table.add_row("Mock Ticket", booking_text)
    console.print(summary_table)

    uri = os.getenv("PALADIO_WS_URL", "ws://127.0.0.1:8000/api/v1/ws/stream")
    output = []
    final_itinerary = None

    try:
        console.print(f"\n[cyan]Connecting to WebSocket:[/cyan] {uri} ...")
        async with websockets.connect(
            uri, ping_timeout=None, ping_interval=None
        ) as websocket:
            console.print("[bold green]Connected successfully![/bold green]\n")

            payload = {
                "action": "chat",
                "message": query,
                "booking_text": booking_text,
                "manual_constraints": manual_constraints,
            }

            await websocket.send(json.dumps(payload))

            current_event = "Starting inference"
            current_state = "starting"
            last_update_time = asyncio.get_event_loop().time()

            async def update_spinner(status_obj):
                while True:
                    elapsed = int(asyncio.get_event_loop().time() - last_update_time)
                    mins, secs = divmod(elapsed, 60)
                    time_str = f"{mins:02d}:{secs:02d}" if mins > 0 else f"{secs}s"
                    status_obj.update(
                        f"[bold green]Pipeline: {current_event}... ([yellow]{current_state}[/yellow]) [dim]Elapsed: {time_str}[/dim]"
                    )
                    await asyncio.sleep(0.5)

            with console.status(
                "[bold green]Waiting for response...", spinner="bouncingBar"
            ) as status:
                spinner_task = asyncio.create_task(update_spinner(status))

                try:
                    async for msg in websocket:
                        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
                        data = json.loads(msg)
                        event_name = data.get("event")
                        event_status = data.get("status", "N/A")
                        event_data = data.get("data")

                        current_event = event_name
                        current_state = event_status
                        last_update_time = asyncio.get_event_loop().time()

                        console.print(
                            f"[dim]{timestamp}[/dim] [bold blue][{event_name}][/bold blue] Status: {event_status}"
                        )

                        if event_data:
                            if isinstance(event_data, dict):
                                if "days" in event_data:
                                    final_itinerary = event_data
                                console.print(
                                    f"  [dim]-> Details: {list(event_data.keys())}[/dim]"
                                )
                            elif isinstance(event_data, str) and len(event_data) > 180:
                                console.print(
                                    f"  [dim]-> Info: {event_data[:180]}...[/dim]"
                                )
                            else:
                                console.print(f"  [dim]-> Info: {event_data}[/dim]")

                        output.append(data)

                        if event_name == "CLARIFICATION_NEEDED":
                            status.stop()
                            spinner_task.cancel()
                            question = data.get("data")
                            thread_id = data.get("thread_id")
                            console.print(
                                f"\n[bold red][AI CLARIFICATION REQUEST]:[/bold red] {question}"
                            )

                            console.print(
                                "[bold yellow]Enter your clarification response:[/bold yellow]"
                            )
                            user_clarification = input("> ").strip()

                            clarification_msg = {
                                "action": "resume",
                                "thread_id": thread_id,
                                "clarification_response": user_clarification,
                            }
                            await websocket.send(json.dumps(clarification_msg))
                            current_event = "Resuming after clarification"
                            current_state = "running"
                            last_update_time = asyncio.get_event_loop().time()
                            spinner_task = asyncio.create_task(update_spinner(status))
                            status.start()
                            continue

                        if event_name == "DONE":
                            break
                        if event_name == "ERROR":
                            console.print(
                                f"[bold red]Error event received:[/bold red] {event_status}"
                            )
                            break
                finally:
                    spinner_task.cancel()

    except (ConnectionRefusedError, OSError) as conn_err:
        console.print(
            f"\n[bold yellow]WebSocket server at {uri} is unreachable ({conn_err}).[/bold yellow]"
        )
        console.print(
            "[bold cyan]Falling back to running the full swarm pipeline in-process...[/bold cyan]"
        )
        final_itinerary = await run_standalone_graph(
            origin=origin,
            destination=destination,
            start_date=start_date,
            end_date=end_date,
            budget_usd=budget_usd,
            query=query,
            booking_text=booking_text,
            manual_constraints=manual_constraints,
        )
        output.append({"event": "STANDALONE_RUN", "final_itinerary": final_itinerary})

    # Output formatting & saving
    if final_itinerary:
        console.print("\n" + "=" * 50)
        console.print(
            "[bold green]✅ FINAL ITINERARY GENERATED SUCCESSFULLY[/bold green]"
        )
        console.print("=" * 50)

        # Print JSON nicely formatted
        console.print(json.dumps(final_itinerary, indent=2, ensure_ascii=False))

    output_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "itinerary_output.json"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    console.print(
        f"\n[bold green]Complete execution trace saved to {output_path}[/bold green]"
    )


if __name__ == "__main__":
    try:
        asyncio.run(test_websocket())
    except KeyboardInterrupt:
        console.print("\n[yellow]Execution cancelled by user.[/yellow]")
