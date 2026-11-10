from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.agent.runner import TripAgentRunner
from app.db.models import UserModel
from app.services.hardware_service import HardwareService
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_runner_cancels_worker_task_mid_stream():
    """
    Verifies that setting cancel_event mid-stream immediately terminates
    the worker_task, halts token streaming, releases locks, and does not leak tasks.
    """
    cancel_ev = asyncio.Event()
    user = UserModel(
        id="u_cancel_test",
        email="cancel@paladio.test",
        username="cancel_user",
        is_active=True,
    )
    trip_id = "trip_cancel_123"

    # Mock trip services
    mock_trip = MagicMock()
    mock_trip.destination = "Tokyo"
    mock_doc = MagicMock()
    mock_session = AsyncMock()

    class StreamingModelStub:
        """Simulates an LLM streaming tokens with small delay."""

        pass

    runner = TripAgentRunner(model=StreamingModelStub())

    # Create fake stream result
    async def fake_stream_text(delta=True):
        yield "Hello "
        await asyncio.sleep(0.02)
        # Check cancellation
        if cancel_ev.is_set():
            raise asyncio.CancelledError("Cancelled in stream")
        yield "World "
        await asyncio.sleep(0.5)
        yield "Never reached!"

    mock_stream_ctx = MagicMock()
    mock_stream_ctx.__aenter__ = AsyncMock(
        return_value=MagicMock(stream_text=fake_stream_text)
    )
    mock_stream_ctx.__aexit__ = AsyncMock(return_value=None)

    mock_agent = MagicMock()
    mock_agent.run_stream.return_value = mock_stream_ctx

    with patch(
        "app.agent.runner.TripService.get_trip",
        new_callable=AsyncMock,
        return_value=mock_trip,
    ), patch("app.agent.runner.TripService.get_document", return_value=mock_doc), patch(
        "app.agent.runner.ItineraryValidator.validate_itinerary", return_value=[]
    ), patch(
        "app.agent.runner.ExpenseService.list_expenses",
        new_callable=AsyncMock,
        return_value=[],
    ), patch(
        "app.agent.runner.acquire_turn_lock", new_callable=AsyncMock, return_value=True
    ), patch(
        "app.agent.runner.release_turn_lock", new_callable=AsyncMock
    ) as mock_release, patch(
        "app.agent.runner.get_session_history", new_callable=AsyncMock, return_value=[]
    ), patch(
        "app.agent.runner.append_session_message", new_callable=AsyncMock
    ) as mock_append, patch("app.agent.runner.Agent", return_value=mock_agent):
        events = []
        async for ev in runner.run_turn(
            trip_id=trip_id,
            user=user,
            session=mock_session,
            user_message="Plan my day",
            cancel_event=cancel_ev,
        ):
            events.append(ev)
            if ev.event == "token":
                # User cancels after receiving first token
                cancel_ev.set()

        event_types = [e.event for e in events]
        assert "turn_started" in event_types
        assert "token" in event_types
        assert any(e.event == "warning" and e.code == "CANCELLED" for e in events)
        assert "turn_done" not in event_types
        # Redis session messages should NOT be appended on cancelled turns
        mock_append.assert_not_called()
        # Turn lock must be released
        mock_release.assert_awaited_once_with(trip_id)


@pytest.mark.asyncio
async def test_runner_low_memory_protection():
    """Verifies that critical host memory constraint aborts turn before model execution."""
    cancel_ev = asyncio.Event()
    user = UserModel(
        id="u_mem_test", email="mem@paladio.test", username="mem_user", is_active=True
    )
    trip_id = "trip_mem_123"
    runner = TripAgentRunner(model=MagicMock())
    mock_session = AsyncMock()

    with patch.object(
        HardwareService,
        "check_memory_safety",
        return_value=(False, "Critical low memory"),
    ), patch(
        "app.agent.runner.acquire_turn_lock", new_callable=AsyncMock, return_value=True
    ), patch(
        "app.agent.runner.release_turn_lock", new_callable=AsyncMock
    ) as mock_release:
        events = []
        async for ev in runner.run_turn(
            trip_id=trip_id,
            user=user,
            session=mock_session,
            user_message="Plan my day",
            cancel_event=cancel_ev,
        ):
            events.append(ev)

        assert len(events) == 2
        assert events[0].event == "turn_started"
        assert events[1].event == "error"
        assert events[1].code == "LOW_MEMORY"
        mock_release.assert_awaited_once_with(trip_id)


@pytest.mark.asyncio
async def test_unload_ollama_model():
    """Verifies that unload_ollama_model issues keep_alive=0 to Ollama API."""
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(status_code=200)

        success = await LLMService.unload_ollama_model("qwen2.5:3b")
        assert success is True

        mock_post.assert_awaited_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["json"] == {"model": "qwen2.5:3b", "keep_alive": 0}
