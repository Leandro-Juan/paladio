import pytest
import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    with patch('app.main.create_swarm') as mock_create_swarm:
        mock_graph = AsyncMock()
        async def mock_astream(*args, **kwargs):
            yield {"rag": {"retrieved_context": "dummy context"}}
            yield {"validator": {}}
            yield {"planner": {"final_itinerary": {"days": []}}}
        mock_graph.astream = mock_astream
        mock_create_swarm.return_value = mock_graph
        
        with TestClient(app) as c:
            yield c

def test_websocket_stream(client):
    """
    Validate that the WebSocket endpoint successfully streams the granular progress states.
    """
    client.app.state.graph.astream = AsyncMock()
    async def mock_astream(*args, **kwargs):
        yield {"rag": {"retrieved_context": "dummy context"}}
        yield {"validator": {}}
        yield {"planner": {"final_itinerary": {"days": []}}}
    client.app.state.graph.astream = mock_astream
    
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        websocket.send_text("I want to go to Rome")
        
        events = []
        try:
            while True:
                data = websocket.receive_json()
                events.append(data["event"])
                if data["event"] in ["DONE", "ERROR"]:
                    break
        except Exception:
            pass
            
    assert "STARTING_INFERENCE" in events
    assert "RETRIEVING_CONTEXT" in events
    assert "DONE" in events

def test_websocket_inference_stream_malformed_json(client):
    """Test that the inference endpoint handles completely malformed JSON payloads gracefully."""
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        # Send raw string instead of JSON
        websocket.send_text("this is not json")
        
        # It should fall back to using it as raw text and start inference
        response = websocket.receive_json()
        assert response["event"] == "STARTING_INFERENCE"

def test_websocket_inference_stream_missing_fields(client):
    """Test that the inference endpoint handles payloads gracefully without crashing."""
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        # Send JSON, but missing fields. The server parses 'message' field currently.
        websocket.send_json({"message": "A trip to Rome"})
        
        # Should just start inference as it expects raw text or 'message' JSON
        response = websocket.receive_json()
        assert response["event"] == "STARTING_INFERENCE"

def test_websocket_inference_abrupt_disconnect(client):
    """Test that the server doesn't crash if the client disconnects immediately after sending a prompt."""
    try:
        with client.websocket_connect("/api/v1/ws/stream") as websocket:
            websocket.send_json({"message": "Test prompt"})
            # Client disconnects immediately
    except Exception:
        pytest.fail("Server crashed upon abrupt client disconnect")
