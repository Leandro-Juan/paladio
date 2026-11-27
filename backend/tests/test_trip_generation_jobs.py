import asyncio
import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from app.core.security import create_access_token
from app.db.models import TripGenerationJobModel, TripModel, UserModel
from app.domain.interfaces.swarm_session import ISwarmSession
from app.main import app
from app.services.trip_generation_manager import TripGenerationManager
from fastapi.testclient import TestClient
from sqlalchemy import delete, select


class ScriptedSwarmSession(ISwarmSession):
    """Scripted swarm session yielding predetermined events per action/call."""

    def __init__(self, handler):
        self.handler = handler
        self.calls = []

    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ):
        self.calls.append(
            {
                "action": action,
                "data": dict(data),
                "user_msg": user_msg,
                "thread_id": thread_id,
            }
        )
        async for ev in self.handler(action, data, user_msg, thread_id):
            yield ev


@pytest.fixture
def isolated_bg_patches():
    with (
        patch(
            "app.services.transit_service.ensure_walking_legs_populated",
            new=AsyncMock(side_effect=lambda itin, city="": itin),
        ),
        patch(
            "app.engine.city_readiness.ensure_city_ready",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.tasks.async_trigger_city_gtfs_download_if_needed",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.notification_relay_service.NotificationRelayService.dispatch_background",
            new=AsyncMock(return_value=None),
        ),
    ):
        yield


async def _wait_for_job_status(
    async_client, headers: dict, job_id: str, targets: set[str], timeout: float = 15.0
) -> dict:
    deadline = asyncio.get_running_loop().time() + timeout
    last_data = None
    while asyncio.get_running_loop().time() < deadline:
        resp = await async_client.get(
            f"/api/trips/generation-jobs/{job_id}", headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        last_data = data
        if data["status"] in targets:
            return data
        if (
            data["status"] in {"failed", "aborted", "cancelled"}
            and data["status"] not in targets
        ):
            raise AssertionError(
                f"Job {job_id} entered unexpected terminal state: {data}"
            )
        await asyncio.sleep(0.05)
    raise AssertionError(
        f"Job {job_id} did not reach {targets} within {timeout}s; last={last_data}"
    )


@pytest.mark.asyncio
async def test_generate_trip_persists_without_websocket_and_preserves_metadata(
    async_client, db_session, isolated_bg_patches
):
    uid = str(uuid.uuid4())
    user = UserModel(
        id=uid,
        username=f"user_{uid[:8]}",
        email=f"user_{uid[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    token = create_access_token(subject=uid)
    headers = {"Authorization": f"Bearer {token}"}

    start_d = (date.today() + timedelta(days=10)).isoformat()
    end_d = (date.today() + timedelta(days=12)).isoformat()

    async def handler(action, data, user_msg, thread_id):
        yield {"event": "STARTING_INFERENCE", "status": "running"}
        yield {"event": "ANALYZING_PROMPT", "status": "running"}
        await asyncio.sleep(0.05)
        yield {
            "event": "EVALUATING_ROUTES",
            "status": "completed",
            "data": {
                "days": [
                    {"day": 1, "date": start_d, "itinerary": {"path": []}},
                    {"day": 2, "date": end_d, "itinerary": {"path": []}},
                ],
                "travel_constraints": {
                    "destination_city": "Barcelona",
                    "start_date": start_d,
                    "end_date": end_d,
                },
            },
        }
        yield {"event": "DONE", "status": "completed"}

    manager = TripGenerationManager(app)
    app.state.trip_generation_manager = manager
    app.state.swarm_session = ScriptedSwarmSession(handler)

    try:
        resp = await async_client.post(
            "/api/trips/generate",
            headers=headers,
            json={
                "prompt": "Visit Sagrada Familia and tapas bars",
                "destination_city": "Barcelona",
                "origin_city": "Madrid",
                "origin_iata": "MAD",
                "destination_iata": "BCN",
                "departure_hour": "09:15",
                "arrival_hour": "19:45",
                "start_date": start_d,
                "end_date": end_d,
                "title": "Barcelona Art & Tapas",
                "description": "Weekend architecture getaway",
                "cover_photo": "data:image/png;base64,AAAA",
                "budget": 0,
                "budget_usd": 0,
                "currency": "EUR",
                "travelers": 2,
            },
        )
        assert resp.status_code == 202
        job = resp.json()
        assert job["status"] == "running"
        assert job["destination"] == "Barcelona"

        completed = await _wait_for_job_status(
            async_client, headers, job["id"], {"completed"}
        )
        trip_id = completed["trip_id"]
        assert trip_id is not None

        trip_resp = await async_client.get(f"/api/trips/{trip_id}", headers=headers)
        assert trip_resp.status_code == 200
        saved = trip_resp.json()
        assert saved["destination"] == "Barcelona"
        itin = saved["itinerary_data"]
        tc = itin["travel_constraints"]
        assert itin["title"] == "Barcelona Art & Tapas"
        assert itin["description"] == "Weekend architecture getaway"
        assert itin["cover_photo"] == "data:image/png;base64,AAAA"
        assert tc["budget"] == 0
        assert tc["budget_usd"] == 0
        assert tc["origin_iata"] == "MAD"
        assert tc["destination_iata"] == "BCN"
        assert tc["departure_hour"] == "09:15"
        assert tc["arrival_hour"] == "19:45"

        ack_resp = await async_client.post(
            f"/api/trips/generation-jobs/{job['id']}/acknowledge", headers=headers
        )
        assert ack_resp.status_code == 204

        list_resp = await async_client.get(
            "/api/trips/generation-jobs", headers=headers
        )
        assert list_resp.status_code == 200
        assert all(j["id"] != job["id"] for j in list_resp.json())
    finally:
        await manager.shutdown()
        if hasattr(app.state, "swarm_session"):
            delattr(app.state, "swarm_session")
        if hasattr(app.state, "trip_generation_manager"):
            delattr(app.state, "trip_generation_manager")
        await db_session.execute(
            delete(TripGenerationJobModel).where(TripGenerationJobModel.user_id == uid)
        )
        await db_session.execute(delete(TripModel).where(TripModel.user_id == uid))
        await db_session.execute(delete(UserModel).where(UserModel.id == uid))
        await db_session.commit()


@pytest.mark.asyncio
async def test_interrupt_resume_preserves_metadata_and_user_isolation(
    async_client, db_session, isolated_bg_patches
):
    uid_a = str(uuid.uuid4())
    uid_b = str(uuid.uuid4())
    db_session.add(
        UserModel(
            id=uid_a,
            username=f"userA_{uid_a[:6]}",
            email=f"a_{uid_a[:6]}@example.com",
            hashed_password="x",
            is_active=True,
        )
    )
    db_session.add(
        UserModel(
            id=uid_b,
            username=f"userB_{uid_b[:6]}",
            email=f"b_{uid_b[:6]}@example.com",
            hashed_password="x",
            is_active=True,
        )
    )
    await db_session.commit()

    headers_a = {"Authorization": f"Bearer {create_access_token(subject=uid_a)}"}
    headers_b = {"Authorization": f"Bearer {create_access_token(subject=uid_b)}"}

    start_d = (date.today() + timedelta(days=20)).isoformat()
    end_d = (date.today() + timedelta(days=21)).isoformat()

    async def handler(action, data, user_msg, thread_id):
        if action == "chat":
            yield {"event": "EVALUATING_GUARDRAILS", "status": "running"}
            yield {
                "event": "TRIP_OVERLAP_WARNING",
                "status": "warning",
                "data": {
                    "type": "TRIP_OVERLAP_WARNING",
                    "warning_title": "[CONFLICT] TRIP DATES OVERLAP",
                    "message": "Dates overlap with another trip.",
                    "overlapping_trip": {
                        "id": "existing-1",
                        "destination": "Madrid",
                        "start_date": start_d,
                        "end_date": end_d,
                    },
                },
            }
            return
        if action == "resume":
            yield {"event": "EVALUATING_ROUTES", "status": "running"}
            yield {
                "event": "EVALUATING_ROUTES",
                "status": "completed",
                "data": {
                    "days": [{"day": 1, "date": start_d, "itinerary": {"path": []}}],
                    "travel_constraints": {
                        "destination_city": "Barcelona",
                        "start_date": start_d,
                        "end_date": end_d,
                    },
                },
            }
            yield {"event": "DONE", "status": "completed"}

    manager = TripGenerationManager(app)
    app.state.trip_generation_manager = manager
    app.state.swarm_session = ScriptedSwarmSession(handler)

    ws_queue_a: asyncio.Queue = asyncio.Queue(maxsize=50)
    ws_queue_b: asyncio.Queue = asyncio.Queue(maxsize=50)
    manager.register_ws(ws_queue_a, uid_a)
    manager.register_ws(ws_queue_b, uid_b)

    try:
        resp = await async_client.post(
            "/api/trips/generate",
            headers=headers_a,
            json={
                "prompt": "Gothic Quarter walk",
                "destination_city": "Barcelona",
                "title": "Preserved Title Across Resume",
                "start_date": start_d,
                "end_date": end_d,
                "budget": 950,
                "budget_usd": 950,
            },
        )
        assert resp.status_code == 202
        job_id = resp.json()["id"]

        paused = await _wait_for_job_status(
            async_client, headers_a, job_id, {"awaiting_input"}
        )
        assert paused["interrupt_type"] == "TRIP_OVERLAP_WARNING"

        # User B cannot view, resume, or cancel User A's job
        assert (
            await async_client.get(
                f"/api/trips/generation-jobs/{job_id}", headers=headers_b
            )
        ).status_code == 404
        assert (
            await async_client.post(
                f"/api/trips/generation-jobs/{job_id}/resume",
                headers=headers_b,
                json={"approved": True, "proceed": True},
            )
        ).status_code == 404
        assert (
            await async_client.post(
                f"/api/trips/generation-jobs/{job_id}/cancel", headers=headers_b
            )
        ).status_code == 404
        assert ws_queue_b.empty()

        # User A resumes and completes
        resume_resp = await async_client.post(
            f"/api/trips/generation-jobs/{job_id}/resume",
            headers=headers_a,
            json={"approved": True, "proceed": True},
        )
        assert resume_resp.status_code == 200
        assert resume_resp.json()["status"] == "running"

        completed = await _wait_for_job_status(
            async_client, headers_a, job_id, {"completed"}
        )
        trip_resp = await async_client.get(
            f"/api/trips/{completed['trip_id']}", headers=headers_a
        )
        assert trip_resp.status_code == 200
        assert (
            trip_resp.json()["itinerary_data"]["title"]
            == "Preserved Title Across Resume"
        )

        # User A's WS queue received TRIP_JOB_COMPLETED while User B's stayed isolated
        events_a = []
        deadline = asyncio.get_running_loop().time() + 2.0
        while asyncio.get_running_loop().time() < deadline:
            while not ws_queue_a.empty():
                events_a.append(ws_queue_a.get_nowait()["event"])
            if "TRIP_JOB_COMPLETED" in events_a:
                break
            await asyncio.sleep(0.02)
        assert "TRIP_JOB_STARTED" in events_a
        assert "TRIP_JOB_AWAITING_INPUT" in events_a
        assert "TRIP_JOB_COMPLETED" in events_a
        assert ws_queue_b.empty()
    finally:
        manager.unregister_ws(ws_queue_a)
        manager.unregister_ws(ws_queue_b)
        await manager.shutdown()
        if hasattr(app.state, "swarm_session"):
            delattr(app.state, "swarm_session")
        if hasattr(app.state, "trip_generation_manager"):
            delattr(app.state, "trip_generation_manager")
        await db_session.execute(
            delete(TripGenerationJobModel).where(
                TripGenerationJobModel.user_id.in_([uid_a, uid_b])
            )
        )
        await db_session.execute(
            delete(TripModel).where(TripModel.user_id.in_([uid_a, uid_b]))
        )
        await db_session.execute(
            delete(UserModel).where(UserModel.id.in_([uid_a, uid_b]))
        )
        await db_session.commit()


@pytest.mark.asyncio
async def test_guardrails_abort_and_cancel_and_startup_reconcile(
    async_client, db_session, isolated_bg_patches
):
    uid = str(uuid.uuid4())
    db_session.add(
        UserModel(
            id=uid,
            username=f"userG_{uid[:6]}",
            email=f"g_{uid[:6]}@example.com",
            hashed_password="x",
            is_active=True,
        )
    )
    await db_session.commit()
    headers = {"Authorization": f"Bearer {create_access_token(subject=uid)}"}

    async def abort_handler(action, data, user_msg, thread_id):
        yield {
            "event": "GUARDRAILS_ABORTED",
            "status": "aborted",
            "data": ["Trip duration exceeds limit."],
        }
        yield {"event": "DONE", "status": "completed"}

    manager = TripGenerationManager(app)
    app.state.trip_generation_manager = manager
    app.state.swarm_session = ScriptedSwarmSession(abort_handler)

    try:
        resp = await async_client.post(
            "/api/trips/generate",
            headers=headers,
            json={"prompt": "Too long", "destination_city": "Tokyo"},
        )
        assert resp.status_code == 202
        aborted_job_id = resp.json()["id"]

        aborted = await _wait_for_job_status(
            async_client, headers, aborted_job_id, {"aborted"}
        )
        assert aborted["guardrail_errors"] == ["Trip duration exceeds limit."]
        assert aborted["trip_id"] is None

        # Now test cancelling a long-running job
        async def slow_handler(action, data, user_msg, thread_id):
            yield {"event": "STARTING_INFERENCE", "status": "running"}
            await asyncio.sleep(30)
            yield {"event": "DONE", "status": "completed"}

        app.state.swarm_session = ScriptedSwarmSession(slow_handler)
        resp2 = await async_client.post(
            "/api/trips/generate",
            headers=headers,
            json={"prompt": "Slow run", "destination_city": "Lisbon"},
        )
        assert resp2.status_code == 202
        cancel_job_id = resp2.json()["id"]

        cancel_resp = await async_client.post(
            f"/api/trips/generation-jobs/{cancel_job_id}/cancel", headers=headers
        )
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "cancelled"

        # Test startup reconciliation of stale running jobs
        stale_id = str(uuid.uuid4())
        db_session.add(
            TripGenerationJobModel(
                id=stale_id,
                user_id=uid,
                thread_id=f"paladio_{stale_id}",
                destination="Rome",
                status="running",
                stage="SCRAPING_DYNAMIC_DATA",
                prompt="Test",
                request_payload={},
                acknowledged=False,
            )
        )
        await db_session.commit()

        count = await manager.reconcile_interrupted_jobs()
        assert count >= 1

        stale_row = (
            await db_session.execute(
                select(TripGenerationJobModel).where(
                    TripGenerationJobModel.id == stale_id
                )
            )
        ).scalar_one()
        await db_session.refresh(stale_row)
        assert stale_row.status == "failed"
        assert "Server restarted" in (stale_row.error_message or "")
    finally:
        await manager.shutdown()
        if hasattr(app.state, "swarm_session"):
            delattr(app.state, "swarm_session")
        if hasattr(app.state, "trip_generation_manager"):
            delattr(app.state, "trip_generation_manager")
        await db_session.execute(
            delete(TripGenerationJobModel).where(TripGenerationJobModel.user_id == uid)
        )
        await db_session.execute(delete(UserModel).where(UserModel.id == uid))
        await db_session.commit()


def test_websocket_disconnect_does_not_cancel_manager_tasks():
    """Closing /api/ws/stream must never cancel background tasks managed by TripGenerationManager."""
    manager = TripGenerationManager(app)
    app.state.trip_generation_manager = manager
    try:
        with TestClient(app) as client:
            with client.websocket_connect("/api/ws/stream") as ws:
                ws.send_json({"action": "ping"})
                assert ws.receive_json()["event"] == "PONG"
        # Disconnecting above must leave manager subscribers clean
        assert len(manager._ws_subscribers) == 0
    finally:
        if hasattr(app.state, "trip_generation_manager"):
            delattr(app.state, "trip_generation_manager")
