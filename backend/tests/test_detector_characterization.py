"""
Characterization tests for Deal Engine detector funnel (Phase 0.3).
Locks in baseline behavior and guards against regressions during refactoring.
"""

import pytest
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock
from app.engine.market.detector import run_deal_detection_scan


@pytest.mark.asyncio
async def test_detector_empty_alerts():
    mock_session = AsyncMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = []
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    mock_session.execute.return_value = mock_result

    results = await run_deal_detection_scan(mock_session)
    assert results == []


@pytest.mark.asyncio
async def test_detector_no_candidates_returns_empty():
    mock_session = AsyncMock()
    fake_alert = MagicMock()
    fake_alert.id = "alert-123"
    fake_alert.is_active = True
    fake_alert.origin_iata = "MAD"
    fake_alert.destinations = ["FCO"]
    today = date.today()
    fake_alert.earliest_date = today
    fake_alert.latest_date = today + timedelta(days=30)
    fake_alert.user_id = "user-123"

    mock_scalars = MagicMock()
    # First call: active_alerts = [fake_alert]
    # Second call: fl_query candidates = []
    mock_scalars.all.side_effect = [[fake_alert], []]
    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    results = await run_deal_detection_scan(mock_session)
    assert results == []
