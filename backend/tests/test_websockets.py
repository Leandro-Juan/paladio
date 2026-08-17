import pytest
import json
from fastapi.testclient import TestClient
from app.main import app

# WebSocket tests typically use TestClient since httpx's AsyncClient doesn't fully support WebSockets out-of-the-box in the same way,
# though we can use websockets library directly. For simplicity we will use TestClient context manager for ws.
client = TestClient(app)

def test_websocket_stream():
    """
    Validate that the WebSocket endpoint successfully streams the granular progress states.
    """
    expected_events = [
        {"event": "INICIANDO_INFERENCIA", "status": "pending"},
        {"event": "EXTRAYENDO_RESTRICCIONES", "status": "running"},
        {"event": "SCRAPEANDO_OFERTAS", "status": "running"},
        {"event": "EVALUANDO_RUTAS", "status": "running"},
        {"event": "EVALUANDO_RUTAS", "status": "completed"}
    ]
    
    received_events = []
    
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        for _ in range(len(expected_events)):
            data = websocket.receive_json()
            received_events.append(data)
            
    assert len(received_events) == len(expected_events), "Should receive exactly the expected number of events."
    for i, expected in enumerate(expected_events):
        assert received_events[i] == expected, f"Expected event at index {i} to match."
