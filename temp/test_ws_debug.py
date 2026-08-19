import asyncio
import websockets
import json
import time

async def test():
    uri = "ws://localhost:8000/api/v1/ws/stream"
    print("Connecting...")
    try:
        async with websockets.connect(uri, ping_interval=None, ping_timeout=None) as websocket:
            print("Connected.")
            req = {"message": "I want to plan a 3-day trip to Madrid visiting museums and eating tapas."}
            await websocket.send(json.dumps(req))
            start = time.time()
            
            while True:
                print(f"[{time.time()-start:.1f}s] Waiting for message...")
                response = await websocket.recv()
                print(f"[{time.time()-start:.1f}s] Received: {response}")
                try:
                    data = json.loads(response)
                    if data.get("event") in ["DONE", "ERROR"]:
                        break
                except Exception as e:
                    print("Parse error:", e)
                    break
    except Exception as e:
        print(f"Connection error: {e}")

asyncio.run(test())
