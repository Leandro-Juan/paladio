from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.agent.runner import TripAgentRunner
from app.agent.toolsets import (
    CORE_TOOLS,
    detect_domain_toolsets,
    get_allowed_tool_names,
)
from app.mcp.tools.pois import _extract_poi_items
from pydantic_ai.models.test import TestModel


def test_detect_domain_toolsets_does_not_overactivate_on_dining():
    """Verifies meal/dining prompts do not load the bulky itinerary_advanced toolset."""
    prompt = "Recommend and add an authentic local dinner spot near our last stop."
    domains = detect_domain_toolsets(prompt)
    assert "itinerary_advanced" not in domains

    allowed = get_allowed_tool_names(domains)
    assert allowed == set(CORE_TOOLS)
    assert len(allowed) == len(CORE_TOOLS)
    assert len(allowed) <= 22


def test_poi_extraction_compacts_payload():
    """Verifies descriptions are capped and opening hours are compacted to conserve prompt tokens."""
    long_desc = "A" * 300
    mock_raw = [
        {
            "poi_id": "poi_123",
            "name": "Local Ramen",
            "category": "restaurant",
            "lat": 35.68,
            "lng": 139.76,
            "cost_eur": 12.0,
            "description": long_desc,
            "opening_hours": {"monday": "10:00-22:00", "tuesday": "10:00-22:00"},
        }
    ]
    extracted = _extract_poi_items(mock_raw)
    assert len(extracted) == 1
    item = extracted[0]
    assert len(item["description"]) <= 125
    assert item["description"].endswith("...")
    assert isinstance(item["opening_hours"], str)
    assert "get_poi_details" in item["opening_hours"]


@pytest.mark.asyncio
async def test_agent_runner_configures_model_settings_max_tokens(monkeypatch):
    """Verifies TripAgentRunner passes ModelSettings with max_tokens to Agent."""
    monkeypatch.setenv("TRIP_AGENT_MAX_TOKENS", "768")
    runner = TripAgentRunner()
    runner.model = TestModel()

    captured_settings = None

    class MockAgent:
        def __init__(self, *args, **kwargs):
            nonlocal captured_settings
            captured_settings = kwargs.get("model_settings")

        def run_stream(self, *args, **kwargs):
            class StreamCtx:
                async def __aenter__(self):
                    class StreamRes:
                        async def stream_text(self, delta=True):
                            if False:
                                yield ""

                    return StreamRes()

                async def __aexit__(self, *exc):
                    pass

            return StreamCtx()

    mock_trip = MagicMock()
    mock_trip.id = "test_trip"
    mock_trip.destination = "Tokyo"
    mock_trip.revision = 0
    mock_trip.start_date = "2026-11-01"
    mock_trip.end_date = "2026-11-02"

    mock_user = MagicMock()
    mock_user.id = "u_1"

    mock_doc = MagicMock()
    mock_doc.days = []
    mock_doc.currency = "EUR"

    mock_session = AsyncMock()

    with (
        patch("app.agent.runner.acquire_turn_lock", return_value=True),
        patch("app.agent.runner.release_turn_lock", return_value=None),
        patch(
            "app.agent.runner.HardwareService.check_memory_safety",
            return_value=(True, "ok"),
        ),
        patch(
            "app.application.trip_editing.trip_service.TripService.get_trip",
            return_value=mock_trip,
        ),
        patch(
            "app.application.trip_editing.trip_service.TripService.get_document",
            return_value=mock_doc,
        ),
        patch(
            "app.application.trip_editing.expense_service.ExpenseService.list_expenses",
            return_value=[],
        ),
        patch("app.agent.runner.get_session_history", return_value=[]),
        patch("app.agent.runner.append_session_message", return_value=None),
        patch("app.agent.runner.Agent", side_effect=MockAgent),
    ):
        events = []
        async for ev in runner.run_turn(
            trip_id="test_trip",
            user=mock_user,
            session=mock_session,
            user_message="Hello",
        ):
            events.append(ev)

        assert captured_settings is not None
        assert captured_settings.get("max_tokens") == 768
        assert (
            "extra_body" not in captured_settings
            or captured_settings.get("extra_body") is None
        )


@pytest.mark.asyncio
async def test_agent_runner_configures_extra_body_for_ollama():
    """Verifies TripAgentRunner passes extra_body with options and keep_alive ONLY for OllamaModel."""
    from pydantic_ai.models.ollama import OllamaModel
    from pydantic_ai.providers.ollama import OllamaProvider

    ollama_model = OllamaModel(
        "qwen2.5:3b", provider=OllamaProvider(base_url="http://localhost:11434")
    )
    runner = TripAgentRunner(model=ollama_model)

    captured_settings = None

    class MockAgent:
        def __init__(self, *args, **kwargs):
            nonlocal captured_settings
            captured_settings = kwargs.get("model_settings")

        def run_stream(self, *args, **kwargs):
            class StreamCtx:
                async def __aenter__(self):
                    class StreamRes:
                        async def stream_text(self, delta=True):
                            if False:
                                yield ""

                    return StreamRes()

                async def __aexit__(self, *exc):
                    pass

            return StreamCtx()

    mock_trip = MagicMock()
    mock_trip.id = "test_trip_ollama"
    mock_trip.destination = "Madrid"
    mock_trip.revision = 0
    mock_trip.start_date = "2026-11-01"
    mock_trip.end_date = "2026-11-02"

    mock_user = MagicMock()
    mock_user.id = "u_1"

    mock_doc = MagicMock()
    mock_doc.days = []
    mock_doc.currency = "EUR"

    mock_session = AsyncMock()

    with (
        patch("app.agent.runner.acquire_turn_lock", return_value=True),
        patch("app.agent.runner.release_turn_lock", return_value=None),
        patch(
            "app.agent.runner.HardwareService.check_memory_safety",
            return_value=(True, "ok"),
        ),
        patch(
            "app.application.trip_editing.trip_service.TripService.get_trip",
            return_value=mock_trip,
        ),
        patch(
            "app.application.trip_editing.trip_service.TripService.get_document",
            return_value=mock_doc,
        ),
        patch(
            "app.application.trip_editing.expense_service.ExpenseService.list_expenses",
            return_value=[],
        ),
        patch("app.agent.runner.get_session_history", return_value=[]),
        patch("app.agent.runner.append_session_message", return_value=None),
        patch("app.agent.runner.Agent", side_effect=MockAgent),
    ):
        events = []
        async for ev in runner.run_turn(
            trip_id="test_trip_ollama",
            user=mock_user,
            session=mock_session,
            user_message="Hello",
        ):
            events.append(ev)

        assert captured_settings is not None
        assert "extra_body" in captured_settings
        extra_body = captured_settings["extra_body"]
        assert "options" in extra_body
        assert "keep_alive" in extra_body


@pytest.mark.asyncio
async def test_agent_runner_handles_rate_limit_error():
    """Verifies that HTTP 413 / 429 rate limit exceptions yield a clear RATE_LIMIT_EXCEEDED event."""
    runner = TripAgentRunner()
    runner.model = TestModel()

    mock_trip = MagicMock()
    mock_trip.id = "test_trip"
    mock_trip.destination = "Tokyo"
    mock_trip.revision = 0
    mock_trip.start_date = "2026-11-01"
    mock_trip.end_date = "2026-11-02"

    mock_user = MagicMock()
    mock_user.id = "u_1"

    mock_doc = MagicMock()
    mock_doc.days = []
    mock_doc.currency = "EUR"

    mock_session = AsyncMock()

    with (
        patch("app.agent.runner.acquire_turn_lock", return_value=True),
        patch("app.agent.runner.release_turn_lock", return_value=None),
        patch(
            "app.agent.runner.HardwareService.check_memory_safety",
            return_value=(True, "ok"),
        ),
        patch(
            "app.application.trip_editing.trip_service.TripService.get_trip",
            return_value=mock_trip,
        ),
        patch(
            "app.application.trip_editing.trip_service.TripService.get_document",
            return_value=mock_doc,
        ),
        patch(
            "app.application.trip_editing.expense_service.ExpenseService.list_expenses",
            return_value=[],
        ),
        patch("app.agent.runner.get_session_history", return_value=[]),
    ):

        class FailingAgent:
            def __init__(self, *args, **kwargs):
                pass

            def run_stream(self, *args, **kwargs):
                class StreamCtx:
                    async def __aenter__(self):
                        raise RuntimeError(
                            "statuscode: 413, body: {'message': 'Request too large on tokens per minute (TPM): Limit 8000, Requested 14385'}"
                        )

                    async def __aexit__(self, *exc):
                        pass

                return StreamCtx()

        with patch("app.agent.runner.Agent", side_effect=FailingAgent):
            events = []
            async for ev in runner.run_turn(
                trip_id="test_trip",
                user=mock_user,
                session=mock_session,
                user_message="Recommend dinner",
            ):
                events.append(ev)

            error_events = [e for e in events if e.event == "error"]
            assert len(error_events) == 1
            err = error_events[0]
            assert err.code == "RATE_LIMIT_EXCEEDED"
            assert "Provider token rate limit exceeded" in err.message
