import pytest
from app.domain.interfaces.swarm_session import ISwarmSession
from app.main import app
from fastapi.testclient import TestClient


class MockSwarmSession(ISwarmSession):
    def __init__(self, events_to_yield):
        self.events_to_yield = events_to_yield

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ):
        for event in self.events_to_yield:
            yield event


@pytest.fixture
def client():
    # No need to mock create_swarm since we mock the session directly
    app.state.swarm_session = MockSwarmSession(
        [
            {"event": "STARTING_INFERENCE", "status": "running"},
            {
                "event": "RETRIEVING_CONTEXT",
                "status": "completed",
                "data": "dummy context",
            },
            {"event": "EVALUATING_ROUTES", "status": "completed", "data": {"days": []}},
            {"event": "DONE", "status": "completed"},
        ]
    )

    with TestClient(app) as c:
        yield c

    if hasattr(app.state, "swarm_session"):
        delattr(app.state, "swarm_session")


def test_websocket_stream_sends_progress_events(client):
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

    assert "STARTING_INFERENCE" in events
    assert "RETRIEVING_CONTEXT" in events
    assert "EVALUATING_ROUTES" in events
    assert "DONE" in events


def test_websocket_stream_handles_malformed_json(client):
    invalid_json = "this is not json"
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        websocket.send_text(invalid_json)
        response = websocket.receive_json()
    assert response.get("event") == "STARTING_INFERENCE"


def test_websocket_stream_handles_missing_fields(client):
    payload_missing_keys = {"message": "A trip to Rome"}
    with client.websocket_connect("/api/v1/ws/stream") as websocket:
        websocket.send_json(payload_missing_keys)
        response = websocket.receive_json()
    assert response.get("event") == "STARTING_INFERENCE"


def test_websocket_stream_resists_abrupt_disconnect(client):
    try:
        with client.websocket_connect("/api/v1/ws/stream") as websocket:
            websocket.send_json({"message": "Test prompt"})
    except Exception as e:
        pytest.fail(f"Server crashed upon abrupt client disconnect: {e}")


def test_websocket_rag_handles_none_context(client):
    # Overwrite the session to return none context
    client.app.state.swarm_session = MockSwarmSession(
        [
            {"event": "STARTING_INFERENCE", "status": "running"},
            {"event": "RETRIEVING_CONTEXT", "status": "completed", "data": ""},
            {"event": "DONE", "status": "completed"},
        ]
    )

    try:
        with client.websocket_connect("/api/v1/ws/stream") as websocket:
            websocket.send_text("hello")

            response1 = websocket.receive_json()
            assert response1["event"] == "STARTING_INFERENCE"

            response2 = websocket.receive_json()
            assert response2["event"] == "RETRIEVING_CONTEXT"
            assert response2["data"] == ""

            response3 = websocket.receive_json()
            assert response3["event"] == "DONE"
    except Exception as e:
        pytest.fail(f"WebSocket closed unexpectedly: {e}")
