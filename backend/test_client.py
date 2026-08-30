import asyncio
import json

import websockets
from rich.console import Console

console = Console()


async def test_websocket():
    uri = "ws://127.0.0.1:8000/api/v1/ws/stream"
    try:
        async with websockets.connect(
            uri, ping_timeout=120, ping_interval=60
        ) as websocket:
            console.print(
                "[bold yellow]Enter your travel requirements/prompt (e.g., 'My budget is 2500 USD. I must visit the Louvre.'):[/bold yellow]"
            )
            query = input("> ").strip()

            console.print(
                "[bold yellow]Enter booking details (flights/hotel) (e.g., 'Flight outbound LHR to CDG on 2026-08-24 10:00...'):[/bold yellow]"
            )
            booking_text = input("> ").strip()

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

            with console.status(
                "[bold green]Waiting for response...", spinner="dots"
            ) as status:
                async for msg in websocket:
                    data = json.loads(msg)
                    event_name = data.get("event")
                    event_status = data.get("status", "N/A")
                    event_data = data.get("data")

                    status.update(
                        f"[bold green]Processing {event_name}... ([yellow]{event_status}[/yellow])"
                    )
                    console.print(
                        f"[bold blue][{event_name}][/bold blue] Status: {event_status}"
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
                        status.start()
                        continue

                    if data.get("event") == "DONE":
                        break
                    if data.get("event") == "ERROR":
                        console.print(
                            f"[bold red]Error:[/bold red] {data.get('status')}"
                        )
                        break

            with open("itinerary_output.json", "w") as f:
                json.dump(output, f, indent=2)
            console.print(
                "[bold green]Output saved to itinerary_output.json[/bold green]"
            )

    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}")


if __name__ == "__main__":
    asyncio.run(test_websocket())
