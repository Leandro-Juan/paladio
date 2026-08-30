import asyncio
import json
import sys

import websockets


async def spinner():
    chars = ["|", "/", "-", "\\"]
    i = 0
    try:
        while True:
            sys.stdout.write(
                f"\rThinking (this may take 1-2 mins on local LLM)... {chars[i % len(chars)]}"
            )
            sys.stdout.flush()
            i += 1
            await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        # Clear the spinner line
        sys.stdout.write("\r" + " " * 60 + "\r")
        sys.stdout.flush()
        raise


async def test_trip_planning():
    uri = "ws://localhost:8000/api/v1/ws/stream"

    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Sending trip request...")

            request = {
                "message": "I want to plan a 3-day trip to Madrid visiting museums and eating tapas."
            }
            await websocket.send(json.dumps(request))

            print("Message sent. Waiting for stream...\n")

            spinner_task = None

            while True:
                try:
                    if spinner_task is None:
                        spinner_task = asyncio.create_task(spinner())

                    response = await websocket.recv()

                    if spinner_task:
                        spinner_task.cancel()
                        try:
                            await spinner_task
                        except asyncio.CancelledError:
                            pass
                        spinner_task = None

                    data = json.loads(response)

                    event = data.get("event")
                    status = data.get("status")

                    print(f"\n[PHASE EVENT] {event}: {status}")

                    # Print the data payload if it exists for debugging purposes
                    if "data" in data:
                        if event == "EVALUATING_ROUTES":
                            print(
                                f"[SUCCESS] Final Itinerary Received:\n{json.dumps(data['data'], indent=2)}"
                            )
                        else:
                            print("[DEBUG DATA]:")
                            if isinstance(data["data"], str):
                                print(data["data"])
                            else:
                                print(json.dumps(data["data"], indent=2))
                    print("-" * 50)

                    if event == "DONE" or event == "ERROR":
                        break

                except websockets.exceptions.ConnectionClosed as e:
                    if spinner_task:
                        spinner_task.cancel()
                    print(
                        f"Connection closed by server. Code: {e.code}, Reason: {e.reason}"
                    )
                    break

    except Exception as e:
        print(f"Error: Could not connect. {e}")


if __name__ == "__main__":
    asyncio.run(test_trip_planning())
