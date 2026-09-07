import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import websockets
from rich.console import Console

console = Console()


async def test_websocket():
    uri = "ws://127.0.0.1:8000/api/v1/ws/stream"
    try:
        async with websockets.connect(
            uri, ping_timeout=None, ping_interval=None
        ) as websocket:
            console.print("[bold yellow]Enter origin city:[/bold yellow]")
            origin = input("> ").strip()

            console.print("[bold yellow]Enter destination city:[/bold yellow]")
            destination = input("> ").strip()

            console.print(
                "[bold yellow]Enter your travel requirements/prompt (e.g., 'My budget is 2500 USD. I must visit the Louvre.'):[/bold yellow]"
            )
            query = input("> ").strip()

            from app.utils.iata_mapping import get_iata_code

            orig_iata = get_iata_code(origin)
            dest_iata = get_iata_code(destination)

            # Auto-generated mock booking data with real IATA codes
            booking_text = f"Flight outbound {orig_iata} to {dest_iata} on 2026-09-10 10:00 (duration 420m). Flight return {dest_iata} to {orig_iata} on 2026-09-15 10:00 (duration 480m). The Grand Hotel booked in {destination} from 2026-09-10 to 2026-09-15."

            console.print(f"[bold cyan]Sending query:[/bold cyan] {query}")
            console.print(
                f"[bold cyan]Sending booking_text:[/bold cyan] {booking_text}"
            )
            await websocket.send(
                json.dumps(
                    {"action": "chat", "message": query, "booking_text": booking_text}
                )
            )

            output = []

            current_event = "Waiting for response"
            current_state = "starting"
            last_update_time = asyncio.get_event_loop().time()

            async def update_spinner(status_obj):
                while True:
                    elapsed = int(asyncio.get_event_loop().time() - last_update_time)
                    mins, secs = divmod(elapsed, 60)
                    time_str = f"{mins:02d}:{secs:02d}" if mins > 0 else f"{secs}s"
                    status_obj.update(
                        f"[bold green]Processing {current_event}... ([yellow]{current_state}[/yellow]) [dim]Elapsed: {time_str}[/dim]"
                    )
                    await asyncio.sleep(0.5)

            with console.status(
                "[bold green]Waiting for response...", spinner="bouncingBar"
            ) as status:
                spinner_task = asyncio.create_task(update_spinner(status))

                try:
                    async for msg in websocket:
                        import datetime

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
                                console.print(
                                    f"  [dim]-> Data keys: {list(event_data.keys())}[/dim]"
                                )
                            elif isinstance(event_data, str) and len(event_data) > 200:
                                console.print(
                                    f"  [dim]-> Data: {event_data[:200]}...[/dim]"
                                )
                            else:
                                console.print(f"  [dim]-> Data: {event_data}[/dim]")

                        output.append(data)

                        if data.get("event") == "CLARIFICATION_NEEDED":
                            status.stop()
                            spinner_task.cancel()
                            question = data.get("data")
                            thread_id = data.get("thread_id")
                            console.print(
                                f"\n[bold red][AI ASKING FOR CLARIFICATION]:[/bold red] {question}"
                            )

                            # Ask the user for clarification dynamically
                            console.print(
                                "[bold yellow]Enter your clarification response:[/bold yellow]"
                            )
                            user_clarification = input("> ").strip()

                            clarification = {
                                "action": "resume",
                                "thread_id": thread_id,
                                "clarification_response": user_clarification,
                            }
                            console.print(
                                f"[bold magenta][USER RESPONDING]:[/bold magenta] {json.dumps(clarification)}\n"
                            )
                            await websocket.send(json.dumps(clarification))
                            current_event = "Resuming after clarification"
                            current_state = "running"
                            last_update_time = asyncio.get_event_loop().time()
                            spinner_task = asyncio.create_task(update_spinner(status))
                            status.start()
                            continue

                        if data.get("event") == "DONE":
                            break
                        if data.get("event") == "ERROR":
                            console.print(
                                f"[bold red]Error:[/bold red] {data.get('status')}"
                            )
                            break
                finally:
                    spinner_task.cancel()

            with open("itinerary_output.json", "w") as f:
                json.dump(output, f, indent=2)
            console.print(
                "[bold green]Output saved to itinerary_output.json[/bold green]"
            )

    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}")


if __name__ == "__main__":
    asyncio.run(test_websocket())
