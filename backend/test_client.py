import asyncio
import websockets
import json
import sys
from rich.console import Console

console = Console()

async def test_websocket():
    uri = "ws://127.0.0.1:8000/api/v1/ws/stream"
    try:
        async with websockets.connect(uri, ping_timeout=120, ping_interval=60) as websocket:
            query = "Plan a 3-day trip to Madrid from Barcelona on 2026-08-24. My budget is 2500 USD. I must visit the Prado Museum."
            console.print(f"[bold cyan]Sending query:[/bold cyan] {query}")
            await websocket.send(json.dumps({"action": "chat", "message": query}))
            
            output = []
            
            with console.status("[bold green]Waiting for response...", spinner="dots") as status:
                async for msg in websocket:
                    data = json.loads(msg)
                    event_name = data.get('event')
                    event_status = data.get('status', 'N/A')
                    event_data = data.get('data')
                    
                    status.update(f"[bold green]Processing {event_name}... ([yellow]{event_status}[/yellow])")
                    console.print(f"[bold blue][{event_name}][/bold blue] Status: {event_status}")
                    
                    if event_data:
                        if isinstance(event_data, dict):
                            console.print(f"  [dim]-> Data keys: {list(event_data.keys())}[/dim]")
                        elif isinstance(event_data, str) and len(event_data) > 200:
                            console.print(f"  [dim]-> Data: {event_data[:200]}...[/dim]")
                        else:
                            console.print(f"  [dim]-> Data: {event_data}[/dim]")
                            
                    output.append(data)
                    
                    if data.get("event") == "CLARIFICATION_NEEDED":
                        status.stop()
                        question = data.get("data")
                        thread_id = data.get("thread_id")
                        console.print(f"\n[bold red][AI ASKING FOR CLARIFICATION]:[/bold red] {question}")
                        
                        # Simulate user response
                        clarification = '{"clarification_response": "I meant Madrid in Spain", "origin_city": "Barcelona", "destination_city": "Madrid", "budget_usd": 2500, "start_date": "2026-08-24", "end_date": "2026-08-24"}'
                        console.print(f"[bold magenta][USER RESPONDING]:[/bold magenta] {clarification}\n")
                        await websocket.send(json.dumps({"action": "resume", "message": clarification, "thread_id": thread_id}))
                        status.start()
                        continue
                        
                    if data.get("event") == "DONE":
                        break
                    if data.get("event") == "ERROR":
                        console.print(f"[bold red]Error:[/bold red] {data.get('status')}")
                        break
            
            with open("itinerary_output.json", "w") as f:
                json.dump(output, f, indent=2)
            console.print("[bold green]Output saved to itinerary_output.json[/bold green]")
            
    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
