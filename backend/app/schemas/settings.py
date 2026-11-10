from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class MealWindowMinutes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    breakfast: int = Field(default=45, ge=15, le=120)
    lunch: int = Field(default=60, ge=30, le=180)
    dinner: int = Field(default=90, ge=30, le=240)


class EngineConfigPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    default_max_walking_km: float = Field(
        default=12.0,
        ge=1.0,
        le=50.0,
        description="Daily walking distance cap in kilometers",
    )
    pacing_tempo: Literal["leisurely", "balanced", "intense"] = Field(
        default="balanced", description="Solver pacing tempo"
    )
    meal_windows: MealWindowMinutes = Field(
        default_factory=MealWindowMinutes,
        description="Meal allocation window durations",
    )
    attraction_burnout_limit: int = Field(
        default=6,
        ge=1,
        le=20,
        description="Maximum intensive attractions scheduled per day",
    )
    deal_scraper_cadence_hours: int = Field(
        default=24, ge=1, le=168, description="Background scraping frequency in hours"
    )
    price_alert_threshold_pct: float = Field(
        default=15.0,
        ge=1.0,
        le=90.0,
        description="Minimum drop percentage to trigger a deal alert",
    )


class SwarmConfigPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    critic_strictness: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        description="LangGraph Critic evaluation threshold",
    )
    thinking_token_budget: int = Field(
        default=2048,
        ge=512,
        le=32768,
        description="Extended reasoning token budget for swarm agents",
    )
    auto_ticket_ingestion: bool = Field(
        default=True, description="Automatically trigger ticket parser on file upload"
    )
    require_human_approval_on_repair: bool = Field(
        default=False,
        description="Pause and require explicit approval on swarm repair node",
    )


class VaultConfigPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    auto_snapshot_enabled: bool = Field(
        default=True, description="Create automatic daily database backup snapshots"
    )
    snapshot_retention_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Number of days to retain backup snapshots",
    )
    export_anonymized_trips: bool = Field(
        default=False, description="Strip personal identifiers when exporting trips"
    )

    # Photo Sync: Immich
    immich_enabled: bool = Field(
        default=False, description="Enable automatic sync to an Immich instance"
    )
    immich_url: str = Field(
        default="",
        description="Base URL of the Immich instance (e.g. https://immich.home.arpa)",
    )
    immich_api_key: str = Field(
        default="", description="API key generated in Immich for authentication"
    )
    immich_album_name: str = Field(
        default="Paladio Vault",
        description="Target album name for uploaded itinerary media",
    )

    # Photo Sync: Synology
    synology_enabled: bool = Field(
        default=False, description="Enable automatic sync to Synology Photos or WebDAV"
    )
    synology_url: str = Field(
        default="", description="Endpoint URL for Synology Photos or WebDAV service"
    )
    synology_username: str = Field(
        default="", description="Synology DSM / Photos account username"
    )
    synology_password: str = Field(
        default="", description="Synology account password or application credential"
    )
    synology_destination_path: str = Field(
        default="/photo/Paladio",
        description="Target folder destination path on Synology NAS",
    )

    # Global Vault Sync Rules
    sync_on_upload: bool = Field(
        default=True,
        description="Automatically trigger background sync when photos are uploaded",
    )


class PushifyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(
        default=False, description="Enable Pushify notification delivery"
    )
    endpoint_url: str = Field(
        default="https://api.pushify.net/api/v1/send",
        description="Pushify dispatch endpoint URL",
    )
    api_key: str = Field(
        default="", description="Pushify secret API token or project key"
    )
    channel: str = Field(
        default="", description="Optional Pushify topic or channel name"
    )


class PushoverConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(
        default=False, description="Enable Pushover notification delivery"
    )
    user_key: str = Field(default="", description="Pushover user or group key")
    app_token: str = Field(
        default="", description="Pushover registered application API token"
    )
    priority: int = Field(
        default=0, ge=-2, le=2, description="Pushover delivery priority"
    )


class NtfyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(
        default=False, description="Enable Ntfy notification delivery"
    )
    server_url: str = Field(
        default="https://ntfy.sh", description="Ntfy instance base URL"
    )
    topic: str = Field(
        default="", description="Ntfy topic name to publish notifications to"
    )
    auth_token: str = Field(
        default="", description="Optional Bearer token for protected Ntfy topics"
    )


class WebhookConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(
        default=False, description="Enable Custom Webhook notification delivery"
    )
    url: str = Field(default="", description="HTTP POST endpoint destination URL")
    secret_header: str = Field(
        default="", description="Optional secret key sent as X-Webhook-Secret header"
    )


class NotificationsConfigPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pushify: PushifyConfig = Field(default_factory=PushifyConfig)
    pushover: PushoverConfig = Field(default_factory=PushoverConfig)
    ntfy: NtfyConfig = Field(default_factory=NtfyConfig)
    webhook: WebhookConfig = Field(default_factory=WebhookConfig)

    # Event triggers
    notify_on_deal_alert: bool = Field(
        default=True, description="Send notification on flight and lodging price drops"
    )
    notify_on_trip_update: bool = Field(
        default=True, description="Send notification when trip itineraries are modified"
    )
    notify_on_ticket_parse: bool = Field(
        default=True,
        description="Send notification when flight/train ticket extraction completes",
    )
    notify_on_photo_sync: bool = Field(
        default=False,
        description="Send notification when vault photo synchronization finishes",
    )


DOMAIN_CONFIG_MAP: dict[str, type[BaseModel]] = {
    "engine": EngineConfigPayload,
    "swarm": SwarmConfigPayload,
    "vault": VaultConfigPayload,
    "notifications": NotificationsConfigPayload,
}


def get_default_domain_config(domain: str) -> dict[str, Any]:
    """Return default configuration dictionary for a given system domain."""
    schema_cls = DOMAIN_CONFIG_MAP.get(domain)
    if not schema_cls:
        raise ValueError(f"Unknown system settings domain: {domain}")
    return schema_cls().model_dump(mode="json")
