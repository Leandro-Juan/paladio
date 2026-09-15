import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from app.db.models import TransitCacheStatus
from app.engine.transit_matrix import (
    ensure_transit_ready,
    get_transit_matrix,
    haversine_distance,
)
from app.services.transit_service import get_detailed_transit_leg
from app.tasks import extract_gtfs_expiry


def test_haversine_distance():
    # Distance between Puerta del Sol and Prado Museum in Madrid (~1.2 km)
    dist = haversine_distance(40.4168, -3.7038, 40.4138, -3.6922)
    assert 0.8 < dist < 1.5


def test_extract_gtfs_expiry_from_feed_info():
    with tempfile.TemporaryDirectory() as tmpdir:
        feed_info_path = os.path.join(tmpdir, "feed_info.txt")
        with open(feed_info_path, "w", encoding="utf-8") as f:
            f.write("feed_publisher_name,feed_end_date\nCRTM,20261130\n")

        expiry = extract_gtfs_expiry(tmpdir)
        assert expiry.year == 2026
        assert expiry.month == 11
        assert expiry.day == 30


def test_extract_gtfs_expiry_from_calendar():
    with tempfile.TemporaryDirectory() as tmpdir:
        calendar_path = os.path.join(tmpdir, "calendar.txt")
        with open(calendar_path, "w", encoding="utf-8") as f:
            f.write("service_id,monday,end_date\n1,1,20261015\n2,1,20261201\n")

        expiry = extract_gtfs_expiry(tmpdir)
        assert expiry.year == 2026
        assert expiry.month == 12
        assert expiry.day == 1


def test_extract_gtfs_expiry_fallback():
    with tempfile.TemporaryDirectory() as tmpdir:
        expiry = extract_gtfs_expiry(tmpdir)
        now = datetime.now(timezone.utc)
        # Should default to roughly 90 days
        diff_days = (expiry - now).days
        assert 88 <= diff_days <= 92


@pytest.mark.asyncio
async def test_ensure_transit_ready_cache_hit():
    mock_entry = MagicMock()
    mock_entry.status = TransitCacheStatus.READY.value
    mock_entry.valid_until = datetime.now(timezone.utc) + timedelta(days=30)

    with patch("app.db.session.async_session") as mock_session_ctx:
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_entry
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session_ctx.return_value.__aenter__.return_value = mock_session

        ready = await ensure_transit_ready("madrid", max_wait_secs=5)
        assert ready is True


@pytest.mark.asyncio
async def test_ensure_transit_ready_cache_miss_trigger_celery():
    mock_entry_ready = MagicMock()
    mock_entry_ready.status = TransitCacheStatus.READY.value
    mock_entry_ready.valid_until = datetime.now(timezone.utc) + timedelta(days=30)

    with (
        patch("app.db.session.async_session") as mock_session_ctx,
        patch("app.tasks.build_city_map_task.delay") as mock_delay,
    ):
        mock_session = AsyncMock()
        # First call is None (miss), second call returns READY
        mock_result1 = MagicMock()
        mock_result1.scalar_one_or_none.return_value = None
        mock_result2 = MagicMock()
        mock_result2.scalar_one_or_none.return_value = mock_entry_ready

        mock_session.execute = AsyncMock(side_effect=[mock_result1, mock_result2])
        mock_session_ctx.return_value.__aenter__.return_value = mock_session

        ready = await ensure_transit_ready("madrid", max_wait_secs=10)
        assert ready is True
        assert mock_delay.called


@pytest.mark.asyncio
async def test_get_transit_matrix_multimodal():
    pois = [
        {"name": "Sol", "location": {"latitude": 40.4168, "longitude": -3.7038}},
        {"name": "Prado", "location": {"latitude": 40.4138, "longitude": -3.6922}},
    ]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "sources_to_targets": [
            [{"time": 0, "distance": 0.0}, {"time": 720, "distance": 1.4}],
            [{"time": 720, "distance": 1.4}, {"time": 0, "distance": 0.0}],
        ]
    }

    with (
        patch(
            "app.engine.transit_matrix.ensure_transit_ready", new_callable=AsyncMock
        ) as mock_ready,
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        mock_ready.return_value = True
        mock_post.return_value = mock_resp

        matrix = await get_transit_matrix(
            pois, city_name="madrid", departure_dt="2026-09-10T10:00"
        )

        assert len(matrix) == 2
        assert len(matrix[0]) == 2
        assert matrix[0][0]["duration_mins"] == 0
        assert matrix[0][1]["duration_mins"] == 12
        assert matrix[0][1]["mode"] == "transit"
        assert matrix[0][1]["cost_eur"] == 1.50

        # Verify request parameters
        call_kwargs = mock_post.call_args[1]
        req_json = call_kwargs["json"]
        assert req_json["costing"] == "multimodal"
        assert req_json["date_time"]["value"] == "2026-09-10T10:00"


@pytest.mark.asyncio
async def test_get_detailed_transit_leg():
    origin = {
        "name": "Sol",
        "city": "madrid",
        "location": {"latitude": 40.4168, "longitude": -3.7038},
    }
    dest = {
        "name": "Prado",
        "city": "madrid",
        "location": {"latitude": 40.4138, "longitude": -3.6922},
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "trip": {
            "summary": {"time": 900, "length": 1.5},
            "legs": [
                {
                    "maneuvers": [
                        {
                            "instruction": "Walk to Metro Sol",
                            "time": 180,
                            "length": 0.2,
                        },
                        {
                            "instruction": "Take Metro Line 1 towards Atocha",
                            "time": 420,
                            "length": 1.0,
                            "transit_info": {
                                "short_name": "1",
                                "headsign": "Atocha",
                                "description": "Metro Sol",
                            },
                        },
                        {
                            "instruction": "Walk to Museo del Prado",
                            "time": 300,
                            "length": 0.3,
                        },
                    ]
                }
            ],
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        leg = await get_detailed_transit_leg(origin, dest, "2026-09-10T10:00")

        assert leg.mode == "transit"
        assert leg.duration_mins == 15
        assert leg.cost_eur == 1.50
        assert leg.cost_is_estimated is False
        assert leg.price_source == "official_crtm_tariff"
        assert len(leg.steps) == 3
        assert leg.steps[0].type == "walk"
        assert leg.steps[1].type == "transit"
        assert leg.steps[1].transit_line == "1"
        assert leg.steps[1].headsign == "Atocha"
        assert leg.steps[2].type == "walk"


@pytest.mark.asyncio
async def test_get_detailed_transit_leg_failure_raises():
    from app.services.transit_service import TransitRoutingError

    origin = {"name": "Sol", "location": {"latitude": 40.4168, "longitude": -3.7038}}
    dest = {"name": "Prado", "location": {"latitude": 40.4138, "longitude": -3.6922}}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.ConnectError("Connection refused")

        with pytest.raises(TransitRoutingError):
            await get_detailed_transit_leg(origin, dest, "2026-09-10T10:00")
