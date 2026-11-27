import pytest
from app.domain.interfaces.swarm_session import ISwarmSession
from app.main import app
from fastapi.testclient import TestClient


class MockSwarmSession(ISwarmSession):
    def __init__(self, events_to_yield):
        self.events_to_yield = events_to_yield
        self.calls = []

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ):
        self.calls.append({"action": action, "data": data, "user_msg": user_msg})
        for event in self.events_to_yield:
            yield event


@pytest.fixture
def client():
    app.state.swarm_session = MockSwarmSession(
        [
            {"event": "FEEDBACK_PROCESSED", "status": "completed"},
        ]
    )

    with TestClient(app) as c:
        yield c

    if hasattr(app.state, "swarm_session"):
        delattr(app.state, "swarm_session")


def test_websocket_stream_handles_feedback_action(client):
    with client.websocket_connect("/api/ws/stream") as websocket:
        websocket.send_json(
            {
                "action": "feedback",
                "poi": {"name": "Sagrada Familia"},
                "target_score": 90,
            }
        )
        response = websocket.receive_json()
        assert response["event"] == "FEEDBACK_PROCESSED"
        assert response["status"] == "completed"


def test_websocket_stream_handles_malformed_json_and_ping(client):
    with client.websocket_connect("/api/ws/stream") as websocket:
        websocket.send_text("this is not json")
        websocket.send_json({"action": "ping"})
        response = websocket.receive_json()
    assert response.get("event") == "PONG"


def test_websocket_stream_handles_missing_fields_without_crashing(client):
    with client.websocket_connect("/api/ws/stream") as websocket:
        websocket.send_json({"message": "A trip to Rome"})
        websocket.send_json({"action": "ping"})
        response = websocket.receive_json()
    assert response.get("event") == "PONG"


def test_websocket_stream_resists_abrupt_disconnect(client):
    try:
        with client.websocket_connect("/api/ws/stream") as websocket:
            websocket.send_json({"action": "ping"})
    except Exception as e:
        pytest.fail(f"Server crashed upon abrupt client disconnect: {e}")


def test_websocket_feedback_handles_empty_payload(client):
    client.app.state.swarm_session = MockSwarmSession(
        [
            {"event": "FEEDBACK_PROCESSED", "status": "completed"},
        ]
    )

    with client.websocket_connect("/api/ws/stream") as websocket:
        websocket.send_json({"action": "feedback"})
        response = websocket.receive_json()
        assert response["event"] == "FEEDBACK_PROCESSED"
