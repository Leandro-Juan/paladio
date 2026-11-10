import logging
from datetime import datetime, timezone
from typing import Any
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)


class NotificationRelayService:
    @classmethod
    async def get_config(cls, session: AsyncSession) -> dict[str, Any]:
        """Fetch current notifications domain settings."""
        return await SettingsService.get_domain_settings(session, "notifications")

    @classmethod
    async def _send_pushify(
        cls,
        endpoint_url: str,
        api_key: str,
        channel: str,
        title: str,
        message: str,
        level: str,
        action_url: str | None,
    ) -> dict[str, Any]:
        if not endpoint_url:
            raise ValueError("Pushify endpoint URL is required")
        if not api_key:
            raise ValueError("Pushify API key is required")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "title": title,
            "message": message,
            "body": message,
            "channel": channel or "default",
            "level": level,
            "url": action_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.post(endpoint_url, headers=headers, json=payload)
            if resp.status_code not in (200, 201, 202, 204):
                raise RuntimeError(
                    f"Pushify returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
            return {
                "provider": "pushify",
                "status": "delivered",
                "http_status": resp.status_code,
            }

    @classmethod
    async def _send_pushover(
        cls,
        user_key: str,
        app_token: str,
        priority: int,
        title: str,
        message: str,
        action_url: str | None,
    ) -> dict[str, Any]:
        if not user_key:
            raise ValueError("Pushover user key is required")
        if not app_token:
            raise ValueError("Pushover app token is required")

        pushover_url = "https://api.pushover.net/1/messages.json"
        data = {
            "token": app_token,
            "user": user_key,
            "title": title,
            "message": message,
            "priority": priority,
        }
        if action_url:
            data["url"] = action_url

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.post(pushover_url, data=data)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Pushover returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
            return {"provider": "pushover", "status": "delivered"}

    @classmethod
    async def _send_ntfy(
        cls,
        server_url: str,
        topic: str,
        auth_token: str,
        title: str,
        message: str,
        level: str,
        action_url: str | None,
    ) -> dict[str, Any]:
        if not topic:
            raise ValueError("Ntfy topic is required")

        clean_server = (server_url or "https://ntfy.sh").rstrip("/")
        publish_url = f"{clean_server}/{topic}"

        tag_map = {
            "info": "information_source",
            "success": "white_check_mark",
            "warning": "warning",
            "error": "rotating_light",
        }

        headers: dict[str, str] = {
            "Title": title,
            "Priority": "4" if level in ("error", "warning") else "3",
            "Tags": tag_map.get(level, "bell"),
        }
        if action_url:
            headers["Click"] = action_url
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.post(
                publish_url, headers=headers, content=message.encode("utf-8")
            )
            if resp.status_code not in (200, 201, 202, 204):
                raise RuntimeError(
                    f"Ntfy returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
            return {"provider": "ntfy", "status": "delivered"}

    @classmethod
    async def _send_webhook(
        cls,
        url: str,
        secret_header: str,
        title: str,
        message: str,
        level: str,
        action_url: str | None,
        event_type: str,
    ) -> dict[str, Any]:
        if not url:
            raise ValueError("Webhook URL is required")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Paladio-Notification-Relay",
        }
        if secret_header:
            headers["X-Webhook-Secret"] = secret_header

        payload = {
            "title": title,
            "message": message,
            "level": level,
            "event_type": event_type,
            "action_url": action_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code not in (200, 201, 202, 204):
                raise RuntimeError(
                    f"Webhook returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
            return {
                "provider": "webhook",
                "status": "delivered",
                "http_status": resp.status_code,
            }

    @classmethod
    async def test_relay(cls, provider: str, config: dict[str, Any]) -> dict[str, Any]:
        """Send a live test notification to verify provider configuration."""
        title = "Paladio Test Notification"
        message = f"Diagnostics test ping for {provider.capitalize()} relay."
        action_url = "https://paladio.local"

        try:
            if provider == "pushify":
                res = await cls._send_pushify(
                    endpoint_url=config.get(
                        "endpoint_url", "https://api.pushify.net/api/v1/send"
                    ),
                    api_key=config.get("api_key", ""),
                    channel=config.get("channel", ""),
                    title=title,
                    message=message,
                    level="info",
                    action_url=action_url,
                )
                return {
                    "success": True,
                    "message": "Pushify test ping delivered successfully",
                    "details": res,
                }

            elif provider == "pushover":
                res = await cls._send_pushover(
                    user_key=config.get("user_key", ""),
                    app_token=config.get("app_token", ""),
                    priority=int(config.get("priority", 0)),
                    title=title,
                    message=message,
                    action_url=action_url,
                )
                return {
                    "success": True,
                    "message": "Pushover test alert delivered successfully",
                    "details": res,
                }

            elif provider == "ntfy":
                res = await cls._send_ntfy(
                    server_url=config.get("server_url", "https://ntfy.sh"),
                    topic=config.get("topic", ""),
                    auth_token=config.get("auth_token", ""),
                    title=title,
                    message=message,
                    level="info",
                    action_url=action_url,
                )
                return {
                    "success": True,
                    "message": "Ntfy test notification delivered successfully",
                    "details": res,
                }

            elif provider == "webhook":
                res = await cls._send_webhook(
                    url=config.get("url", ""),
                    secret_header=config.get("secret_header", ""),
                    title=title,
                    message=message,
                    level="info",
                    action_url=action_url,
                    event_type="test",
                )
                return {
                    "success": True,
                    "message": "Webhook test payload delivered successfully",
                    "details": res,
                }

            else:
                return {
                    "success": False,
                    "error": f"Unknown notification provider: {provider}",
                }

        except Exception as e:
            logger.warning(f"Test notification relay failed for {provider}: {e}")
            return {"success": False, "error": str(e), "provider": provider}

    @classmethod
    async def dispatch(
        cls,
        session: AsyncSession,
        title: str,
        message: str,
        level: str = "info",
        action_url: str | None = None,
        event_type: str = "general",
    ) -> dict[str, Any]:
        """
        Dispatches notification across all active channels according to event type filters.
        """
        config = await cls.get_config(session)

        # Check event trigger filters
        if event_type == "deal_alert" and not config.get("notify_on_deal_alert", True):
            return {
                "status": "skipped",
                "reason": "Deal alert notifications are disabled",
            }
        if event_type == "trip_update" and not config.get(
            "notify_on_trip_update", True
        ):
            return {
                "status": "skipped",
                "reason": "Trip update notifications are disabled",
            }
        if event_type == "ticket_parse" and not config.get(
            "notify_on_ticket_parse", True
        ):
            return {
                "status": "skipped",
                "reason": "Ticket parse notifications are disabled",
            }
        if event_type == "photo_sync" and not config.get("notify_on_photo_sync", False):
            return {
                "status": "skipped",
                "reason": "Photo sync notifications are disabled",
            }

        results: dict[str, Any] = {}

        # 1. Pushify
        pushify_cfg = config.get("pushify", {})
        if (
            pushify_cfg.get("enabled")
            and pushify_cfg.get("endpoint_url")
            and pushify_cfg.get("api_key")
        ):
            try:
                res = await cls._send_pushify(
                    endpoint_url=pushify_cfg["endpoint_url"],
                    api_key=pushify_cfg["api_key"],
                    channel=pushify_cfg.get("channel", ""),
                    title=title,
                    message=message,
                    level=level,
                    action_url=action_url,
                )
                results["pushify"] = res
            except Exception as err:
                logger.error(f"Pushify dispatch failed: {err}")
                results["pushify"] = {"status": "failed", "error": str(err)}

        # 2. Pushover
        pushover_cfg = config.get("pushover", {})
        if (
            pushover_cfg.get("enabled")
            and pushover_cfg.get("user_key")
            and pushover_cfg.get("app_token")
        ):
            try:
                res = await cls._send_pushover(
                    user_key=pushover_cfg["user_key"],
                    app_token=pushover_cfg["app_token"],
                    priority=int(pushover_cfg.get("priority", 0)),
                    title=title,
                    message=message,
                    action_url=action_url,
                )
                results["pushover"] = res
            except Exception as err:
                logger.error(f"Pushover dispatch failed: {err}")
                results["pushover"] = {"status": "failed", "error": str(err)}

        # 3. Ntfy
        ntfy_cfg = config.get("ntfy", {})
        if ntfy_cfg.get("enabled") and ntfy_cfg.get("topic"):
            try:
                res = await cls._send_ntfy(
                    server_url=ntfy_cfg.get("server_url", "https://ntfy.sh"),
                    topic=ntfy_cfg["topic"],
                    auth_token=ntfy_cfg.get("auth_token", ""),
                    title=title,
                    message=message,
                    level=level,
                    action_url=action_url,
                )
                results["ntfy"] = res
            except Exception as err:
                logger.error(f"Ntfy dispatch failed: {err}")
                results["ntfy"] = {"status": "failed", "error": str(err)}

        # 4. Webhook
        webhook_cfg = config.get("webhook", {})
        if webhook_cfg.get("enabled") and webhook_cfg.get("url"):
            try:
                res = await cls._send_webhook(
                    url=webhook_cfg["url"],
                    secret_header=webhook_cfg.get("secret_header", ""),
                    title=title,
                    message=message,
                    level=level,
                    action_url=action_url,
                    event_type=event_type,
                )
                results["webhook"] = res
            except Exception as err:
                logger.error(f"Webhook dispatch failed: {err}")
                results["webhook"] = {"status": "failed", "error": str(err)}

        return {
            "status": "completed",
            "event_type": event_type,
            "relays": results,
        }

    @classmethod
    async def dispatch_background(
        cls,
        title: str,
        message: str,
        level: str = "info",
        action_url: str | None = None,
        event_type: str = "general",
    ) -> None:
        """Background worker wrapper opening its own session."""
        try:
            async with async_session() as session:
                await cls.dispatch(
                    session=session,
                    title=title,
                    message=message,
                    level=level,
                    action_url=action_url,
                    event_type=event_type,
                )
        except Exception as e:
            logger.exception(f"Background notification dispatch error: {e}")
