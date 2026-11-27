import pytest
from app.core.security import create_access_token
from app.domain.interfaces.swarm_session import ISwarmSession
from app.main import app
from fastapi.testclient import TestClient


class MockSwarmSession(ISwarmSession):
    def __init__(self):
        self.received_actions = []

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ):
        self.received_actions.append(
            {"action": action, "data": data, "user_msg": user_msg}
        )
        yield {"event": "FEEDBACK_PROCESSED", "status": "completed"}


@pytest.fixture
def mock_ws_client():
    mock_session = MockSwarmSession()
    app.state.swarm_session = mock_session

    with TestClient(app) as c:
        yield c, mock_session

    if hasattr(app.state, "swarm_session"):
        delattr(app.state, "swarm_session")


def test_websocket_token_query_param_auth(mock_ws_client):
    client, mock_session = mock_ws_client
    token = create_access_token(subject="user-uuid-999")

    with client.websocket_connect(f"/api/ws/stream?token={token}") as ws:
        ws.send_json(
            {"action": "feedback", "poi": {"name": "Louvre"}, "target_score": 80}
        )
        res = ws.receive_json()
        assert res["event"] == "FEEDBACK_PROCESSED"

    assert len(mock_session.received_actions) == 1
    action_data = mock_session.received_actions[0]["data"]
    assert action_data.get("user_id") == "user-uuid-999"


def test_websocket_token_payload_auth(mock_ws_client):
    client, mock_session = mock_ws_client
    token = create_access_token(subject="user-uuid-888")

    with client.websocket_connect("/api/ws/stream") as ws:
        ws.send_json(
            {
                "action": "feedback",
                "poi": {"name": "Prado"},
                "target_score": 95,
                "token": token,
            }
        )
        res = ws.receive_json()
        assert res["event"] == "FEEDBACK_PROCESSED"

    assert len(mock_session.received_actions) == 1
    action_data = mock_session.received_actions[0]["data"]
    assert action_data.get("user_id") == "user-uuid-888"


def test_websocket_unauthenticated_fallback(mock_ws_client):
    client, mock_session = mock_ws_client

    with client.websocket_connect("/api/ws/stream") as ws:
        ws.send_json(
            {"action": "feedback", "poi": {"name": "Park"}, "target_score": 70}
        )
        res = ws.receive_json()
        assert res["event"] == "FEEDBACK_PROCESSED"

    assert len(mock_session.received_actions) == 1
    action_data = mock_session.received_actions[0]["data"]
    assert (
        action_data.get("user_id") is None
        or action_data.get("user_id") == "default_user"
    )
