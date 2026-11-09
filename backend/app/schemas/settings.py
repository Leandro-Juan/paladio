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


DOMAIN_CONFIG_MAP: dict[str, type[BaseModel]] = {
    "engine": EngineConfigPayload,
    "swarm": SwarmConfigPayload,
    "vault": VaultConfigPayload,
}


def get_default_domain_config(domain: str) -> dict[str, Any]:
    """Return default configuration dictionary for a given system domain."""
    schema_cls = DOMAIN_CONFIG_MAP.get(domain)
    if not schema_cls:
        raise ValueError(f"Unknown system settings domain: {domain}")
    return schema_cls().model_dump(mode="json")
