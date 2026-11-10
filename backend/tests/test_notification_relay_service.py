import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.notification_relay_service import NotificationRelayService
from app.db.models import SystemConfigModel
from sqlalchemy import delete


@pytest.mark.asyncio
async def test_notification_relay_config(db_session):
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == "notifications")
    )
    await db_session.commit()

    cfg = await NotificationRelayService.get_config(db_session)
    assert "pushify" in cfg
    assert cfg["pushify"]["enabled"] is False
    assert cfg["pushover"]["enabled"] is False
    assert cfg["ntfy"]["enabled"] is False
    assert cfg["webhook"]["enabled"] is False
    assert cfg["notify_on_deal_alert"] is True


@pytest.mark.asyncio
async def test_pushify_test_relay_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await NotificationRelayService.test_relay(
            provider="pushify",
            config={
                "endpoint_url": "https://api.pushify.net/api/v1/send",
                "api_key": "test-key",
                "channel": "general",
            },
        )
        assert res["success"] is True
        assert "delivered" in res["message"]


@pytest.mark.asyncio
async def test_pushover_test_relay_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await NotificationRelayService.test_relay(
            provider="pushover",
            config={
                "user_key": "user-key-123",
                "app_token": "app-token-456",
                "priority": 0,
            },
        )
        assert res["success"] is True
        assert "delivered" in res["message"]


@pytest.mark.asyncio
async def test_ntfy_test_relay_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await NotificationRelayService.test_relay(
            provider="ntfy",
            config={
                "server_url": "https://ntfy.sh",
                "topic": "my-test-topic",
            },
        )
        assert res["success"] is True
        assert "delivered" in res["message"]


@pytest.mark.asyncio
async def test_webhook_test_relay_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await NotificationRelayService.test_relay(
            provider="webhook",
            config={
                "url": "https://hooks.test.org/webhook",
                "secret_header": "secret-123",
            },
        )
        assert res["success"] is True
        assert "delivered" in res["message"]


@pytest.mark.asyncio
async def test_dispatch_filters_disabled_events(db_session):
    # Testing that disabled event types are skipped
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == "notifications")
    )
    await db_session.commit()

    # notify_on_photo_sync defaults to False
    res = await NotificationRelayService.dispatch(
        session=db_session,
        title="Photo Sync Done",
        message="All photos synced",
        event_type="photo_sync",
    )
    assert res["status"] == "skipped"
