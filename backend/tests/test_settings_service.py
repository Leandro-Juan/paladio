import pytest
from app.db.models import SystemConfigModel
from app.schemas.settings import DOMAIN_CONFIG_MAP, get_default_domain_config
from app.services.settings_service import SettingsService
from sqlalchemy import delete


@pytest.mark.asyncio
async def test_domain_config_defaults():
    for domain in ["engine", "swarm", "vault", "notifications"]:
        defaults = get_default_domain_config(domain)
        assert isinstance(defaults, dict)
        schema_cls = DOMAIN_CONFIG_MAP[domain]
        validated = schema_cls(**defaults)
        assert validated is not None

    with pytest.raises(ValueError):
        get_default_domain_config("nonexistent_domain")


@pytest.mark.asyncio
async def test_settings_service_fallback(db_session):
    # Ensure test isolation
    await db_session.execute(
        delete(SystemConfigModel).where(
            SystemConfigModel.key.in_(["engine", "swarm", "vault", "notifications"])
        )
    )
    await db_session.commit()

    # Testing that get_domain_settings returns default values when no record in DB
    config = await SettingsService.get_domain_settings(db_session, "engine")
    assert "default_max_walking_km" in config
    assert config["default_max_walking_km"] == 12.0
    assert config["pacing_tempo"] == "balanced"

    swarm_cfg = await SettingsService.get_domain_settings(db_session, "swarm")
    assert swarm_cfg["critic_strictness"] == 0.75

    vault_cfg = await SettingsService.get_domain_settings(db_session, "vault")
    assert vault_cfg["auto_snapshot_enabled"] is True
    assert vault_cfg["immich_enabled"] is False
    assert vault_cfg["synology_enabled"] is False
    assert vault_cfg["sync_on_upload"] is True

    notif_cfg = await SettingsService.get_domain_settings(db_session, "notifications")
    assert notif_cfg["pushify"]["enabled"] is False
    assert notif_cfg["pushover"]["enabled"] is False
    assert notif_cfg["notify_on_deal_alert"] is True


@pytest.mark.asyncio
async def test_settings_service_update(db_session):
    updated = await SettingsService.update_domain_settings(
        db_session,
        "engine",
        {"default_max_walking_km": 15.5, "pacing_tempo": "intense"},
    )
    assert updated["default_max_walking_km"] == 15.5
    assert updated["pacing_tempo"] == "intense"

    # Verify re-fetching yields the updated values
    refetched = await SettingsService.get_domain_settings(db_session, "engine")
    assert refetched["default_max_walking_km"] == 15.5
    assert refetched["pacing_tempo"] == "intense"
