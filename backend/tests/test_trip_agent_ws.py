from __future__ import annotations

import asyncio
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.models import TripModel, UserModel
from app.main import app
from app.mcp.proposals import create_proposal
from app.agent.runner import TripAgentRunner
from pydantic_ai.models.test import TestModel


@pytest.fixture
async def ws_test_trip(db_session: AsyncSession):
    suffix = uuid.uuid4().hex[:6]
    owner = UserModel(
        id=f"u_ws_owner_{suffix}",
        email=f"ws_owner_{suffix}@paladio.test",
        username=f"wsowner_{suffix}",
        hashed_password="pw",
        role="user",
        is_active=True,
    )
    stranger = UserModel(
        id=f"u_ws_stranger_{suffix}",
        email=f"ws_stranger_{suffix}@paladio.test",
        username=f"wsstranger_{suffix}",
        hashed_password="pw",
        role="user",
        is_active=True,
    )
    db_session.add_all([owner, stranger])
    await db_session.commit()

    trip_id = f"trip_ws_{suffix}"
    initial_itinerary = {
        "days": [
            {
                "day": 1,
                "date": "2026-11-01",
                "itinerary": {
                    "path": [
                        {
                            "stop_id": f"stop_p_{suffix}",
                            "name": "Prado Museum",
                            "duration": 90,
                            "scheduled_start": "10:00",
                        }
                    ]
                },
            },
            {
                "day": 2,
                "date": "2026-11-02",
                "itinerary": {
                    "path": [
                        {
                            "stop_id": f"stop_r_{suffix}",
                            "name": "Retiro Park",
                            "duration": 60,
                            "scheduled_start": "11:00",
                        }
                    ]
                },
            },
        ],
        "title": "Madrid Express",
    }
    trip = TripModel(
        id=trip_id,
        user_id=owner.id,
        destination="Madrid",
        start_date="2026-11-01",
        end_date="2026-11-02",
        itinerary_data=initial_itinerary,
        revision=0,
    )
    db_session.add(trip)
    await db_session.commit()

    owner_token = create_access_token(subject=owner.id)
    stranger_token = create_access_token(subject=stranger.id)

    return {
        "trip_id": trip_id,
        "owner": owner,
        "stranger": stranger,
        "owner_token": owner_token,
        "stranger_token": stranger_token,
        "suffix": suffix,
    }


def test_ws_auth_and_idor_protection(ws_test_trip):
    """Verifies unauthenticated and unauthorized connections are rejected immediately."""
    trip_id = ws_test_trip["trip_id"]
    owner_token = ws_test_trip["owner_token"]
    stranger_token = ws_test_trip["stranger_token"]

    client = TestClient(app)

    # 1. No token -> rejected
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/trip-agent/{trip_id}") as ws:
            pass

    # 2. Invalid token -> rejected
    with pytest.raises(Exception):
        with client.websocket_connect(
            f"/api/ws/trip-agent/{trip_id}?token=invalid.jwt.token"
        ) as ws:
            pass

    # 3. IDOR: stranger accessing someone else's trip -> rejected
    with pytest.raises(Exception):
        with client.websocket_connect(
            f"/api/ws/trip-agent/{trip_id}?token={stranger_token}"
        ) as ws:
            pass

    # 4. Valid owner -> accepted cleanly
    with client.websocket_connect(
        f"/api/ws/trip-agent/{trip_id}?token={owner_token}"
    ) as ws:
        # Connection succeeds
        assert ws is not None


@pytest.mark.asyncio
async def test_ws_proposal_approval_and_undo_flow(ws_test_trip):
    """Verifies approving Tier C proposals and triggering undo over WebSocket."""
    trip_id = ws_test_trip["trip_id"]
    owner_token = ws_test_trip["owner_token"]

    # Create a proposal in Redis first
    proposal = await create_proposal(
        trip_id=trip_id,
        tool="swap_days",
        summary="Swap Day 1 and Day 2",
        arguments={"trip_id": trip_id, "day_a": 1, "day_b": 2},
    )
    prop_id = proposal.proposal_id

    client = TestClient(app)
    with client.websocket_connect(
        f"/api/ws/trip-agent/{trip_id}?token={owner_token}"
    ) as ws:
        # Send approve message
        ws.send_json({"type": "approve", "proposal_id": prop_id})

        # Expect trip_updated event followed by tool_result
        ev1 = ws.receive_json()
        assert ev1["event"] == "trip_updated", f"Got: {ev1}"
        assert ev1["revision"] == 1
        assert 1 in ev1["affected_days"] or 2 in ev1["affected_days"]

        ev2 = ws.receive_json()
        assert ev2["event"] == "tool_result"
        assert ev2["ok"] is True

        # Send undo message
        ws.send_json({"type": "undo"})
        ev_undo = ws.receive_json()
        assert ev_undo["event"] == "trip_updated"
        assert ev_undo["revision"] == 2


@pytest.mark.asyncio
async def test_trip_agent_runner_turn_execution(ws_test_trip, db_session: AsyncSession):
    """Verifies TripAgentRunner executes turn with TestModel and yields proper stream events."""
    trip_id = ws_test_trip["trip_id"]
    owner = ws_test_trip["owner"]

    test_model = TestModel(
        call_tools=[], custom_output_text="Madrid trip overview ready."
    )
    runner = TripAgentRunner(model=test_model)

    events = []
    async for ev in runner.run_turn(
        trip_id=trip_id,
        user=owner,
        session=db_session,
        user_message="What is the overview of my trip?",
    ):
        events.append(ev)

    event_types = [e.event for e in events]
    assert "turn_started" in event_types
    assert "turn_done" in event_types
    turn_done_ev = next(e for e in events if e.event == "turn_done")
    assert turn_done_ev.final_text is not None


@pytest.mark.asyncio
async def test_trip_agent_runner_cancellation(ws_test_trip, db_session: AsyncSession):
    """Verifies that setting a cancellation event stops turn execution immediately."""
    trip_id = ws_test_trip["trip_id"]
    owner = ws_test_trip["owner"]

    cancel_ev = asyncio.Event()
    cancel_ev.set()  # Cancel prior to run

    test_model = TestModel()
    runner = TripAgentRunner(model=test_model)

    events = []
    async for ev in runner.run_turn(
        trip_id=trip_id,
        user=owner,
        session=db_session,
        user_message="Plan my trip",
        cancel_event=cancel_ev,
    ):
        events.append(ev)

    assert any(e.event == "warning" and e.code == "CANCELLED" for e in events)
