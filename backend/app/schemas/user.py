from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PacePreference(str, Enum):
    LEISURELY = "leisurely"
    BALANCED = "balanced"
    INTENSE = "intense"


class BudgetTier(str, Enum):
    BUDGET = "budget"
    BALANCED = "balanced"
    LUXURY = "luxury"


DEFAULT_TAG_AFFINITIES: dict[str, float] = {
    "art_culture": 0.5,
    "history_heritage": 0.5,
    "nature_outdoors": 0.5,
    "architecture": 0.5,
    "food_culinary": 0.5,
    "nightlife": 0.5,
    "shopping": 0.5,
    "scenic_views": 0.5,
}


class UserPreferences(BaseModel):
    model_config = ConfigDict(extra="allow")

    pace: PacePreference = PacePreference.BALANCED
    budget_tier: BudgetTier = BudgetTier.BALANCED
    crowd_tolerance: float = Field(default=0.5, ge=0.0, le=1.0)
    dietary: list[str] = Field(default_factory=list)
    tag_affinities: dict[str, float] = Field(
        default_factory=lambda: dict(DEFAULT_TAG_AFFINITIES)
    )
    taste_bio: str = (
        "Balanced traveler enjoying cultural landmarks, local food, and scenic spots."
    )
    disliked_tags: list[str] = Field(default_factory=list)


def get_default_user_preferences() -> dict[str, Any]:
    """Returns a balanced neutral preference dictionary."""
    return UserPreferences().model_dump(mode="json")


def normalize_user_preferences(raw: dict[str, Any] | None) -> UserPreferences:
    """Safely coerces raw JSONB/dict preferences into a validated UserPreferences instance."""
    if not raw:
        return UserPreferences()
    try:
        # Handle pace string mappings if needed
        data = dict(raw)
        if "pace" in data and isinstance(data["pace"], str):
            p = data["pace"].lower()
            if p in ("relaxed", "slow", "leisurely"):
                data["pace"] = PacePreference.LEISURELY
            elif p in ("fast", "packed", "intense"):
                data["pace"] = PacePreference.INTENSE
            else:
                data["pace"] = PacePreference.BALANCED
        if "budget" in data and "budget_tier" not in data:
            b = str(data["budget"]).lower()
            if b in ("low", "cheap", "budget"):
                data["budget_tier"] = BudgetTier.BUDGET
            elif b in ("high", "luxury", "splurge"):
                data["budget_tier"] = BudgetTier.LUXURY
            else:
                data["budget_tier"] = BudgetTier.BALANCED

        # Ensure tag_affinities has standard defaults if not present
        if "tag_affinities" not in data or not isinstance(data["tag_affinities"], dict):
            affinities = dict(DEFAULT_TAG_AFFINITIES)
            # Map simple boolean flags from legacy tests if present
            if data.get("nature") is True:
                affinities["nature_outdoors"] = 0.9
            if data.get("culinary") is True:
                affinities["food_culinary"] = 0.9
            data["tag_affinities"] = affinities
        else:
            # Merge with default keys to ensure completeness
            merged_affinities = dict(DEFAULT_TAG_AFFINITIES)
            merged_affinities.update(data["tag_affinities"])
            data["tag_affinities"] = merged_affinities

        return UserPreferences(**data)
    except Exception:
        return UserPreferences()


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class SetupStatusResponse(BaseModel):
    setup_required: bool
    user_count: int


class MasterAdminSetup(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    role: str | None = "user"
    preferences: dict[str, Any] | None = None


class UserAdminUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=6, max_length=128)


class UserLogin(BaseModel):
    username_or_email: str
    password: str


class UserPreferencesUpdate(BaseModel):
    preferences: dict[str, Any]


class UserEmbeddingUpdate(BaseModel):
    embedding: list[float]


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str = "user"
    is_active: bool
    preferences: dict[str, Any] | None = None
    has_embedding: bool = False
    created_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
