import pytest
import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    """Mock the Swarm graph so WebSocket tests can run independently of the LLM pipeline."""
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

def test_websocket_stream_sends_progress_events(client):
    """Test that the WebSocket endpoint successfully streams the granular progress states."""
    # Arrange
    client.app.state.graph.astream = AsyncMock()
    async def mock_astream(*args, **kwargs):
        yield {"rag": {"retrieved_context": "dummy context"}}
        yield {"validator": {}}
        yield {"planner": {"final_itinerary": {"days": []}}}
    client.app.state.graph.astream = mock_astream
    
    # Act
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        websocket.send_text("I want to go to Rome")
        
        events = []
        try:
            while True:
                data = websocket.receive_json()
                events.append(data.get("event"))
                if data.get("event") in ["DONE", "ERROR"]:
                    break
        except Exception:
            pass
            
    # Assert
    assert "STARTING_INFERENCE" in events
    assert "RETRIEVING_CONTEXT" in events
    assert "EVALUATING_ROUTES" in events
    assert "DONE" in events

def test_websocket_stream_handles_malformed_json(client):
    """Test that the inference endpoint handles completely malformed JSON payloads gracefully."""
    # Arrange
    invalid_json = "this is not json"
    
    # Act
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        websocket.send_text(invalid_json)
        response = websocket.receive_json()
        
    # Assert
    assert response.get("event") == "STARTING_INFERENCE"

def test_websocket_stream_handles_missing_fields(client):
    """Test that the inference endpoint handles payloads missing expected keys gracefully."""
    # Arrange
    payload_missing_keys = {"message": "A trip to Rome"}
    
    # Act
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        websocket.send_json(payload_missing_keys)
        response = websocket.receive_json()
        
    # Assert
    assert response.get("event") == "STARTING_INFERENCE"

def test_websocket_stream_resists_abrupt_disconnect(client):
    """Test that the server doesn't crash if the client disconnects immediately after sending a prompt."""
    # Arrange & Act
    try:
        with client.websocket_connect("/api/v1/ws/stream") as websocket:
            websocket.send_json({"message": "Test prompt"})
            # Client disconnects immediately upon context exit
    except Exception as e:
        # Assert
        pytest.fail(f"Server crashed upon abrupt client disconnect: {e}")
