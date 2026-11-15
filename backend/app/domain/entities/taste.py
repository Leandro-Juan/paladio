from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.engine.scoring.features import TAG_KEYS
from pydantic import BaseModel, Field


class TasteSignalType(str, Enum):
    STOP_KEPT = "STOP_KEPT"
    STOP_LOCKED = "STOP_LOCKED"
    STOP_UNLOCKED = "STOP_UNLOCKED"
    STOP_ADDED = "STOP_ADDED"
    STOP_REMOVED = "STOP_REMOVED"
    STOP_MOVED = "STOP_MOVED"
    STOP_REORDERED = "STOP_REORDERED"
    COLLECTION_SAVED = "COLLECTION_SAVED"
    COLLECTION_REMOVED = "COLLECTION_REMOVED"
    VISIT_COMPLETED = "VISIT_COMPLETED"
    VISIT_SKIPPED = "VISIT_SKIPPED"
    TICKET_BOOKED = "TICKET_BOOKED"
    DEAL_ACCEPTED = "DEAL_ACCEPTED"
    DEAL_DISCARDED = "DEAL_DISCARDED"
    PACE_CHANGED = "PACE_CHANGED"
    BOUNDS_CHANGED = "BOUNDS_CHANGED"
    CHAT_PREFERENCE = "CHAT_PREFERENCE"
    PROMPT_ANALYZED = "PROMPT_ANALYZED"
    UNDO_CORRECTION = "UNDO_CORRECTION"


class InferredReason(str, Enum):
    TASTE_MATCH = "TASTE_MATCH"
    TASTE_DISLIKE = "TASTE_DISLIKE"
    SAME_CATEGORY_SWAP = "SAME_CATEGORY_SWAP"
    PACE_OVERLOAD = "PACE_OVERLOAD"
    DISTANCE_OUTLIER = "DISTANCE_OUTLIER"
    SCHEDULE_ADJUSTMENT = "SCHEDULE_ADJUSTMENT"
    EXPLICIT_CONSTRAINT = "EXPLICIT_CONSTRAINT"
    REPEAT_VISIT = "REPEAT_VISIT"
    PRICE_SENSITIVITY = "PRICE_SENSITIVITY"


class BetaPosterior(BaseModel):
    """Bayesian Beta(alpha, beta) posterior over preference affinity in [0, 1]."""

    alpha: float = Field(default=2.0, gt=0.0)
    beta: float = Field(default=2.0, gt=0.0)

    @property
    def mean(self) -> float:
        total = self.alpha + self.beta
        return self.alpha / total if total > 0 else 0.5

    @property
    def sample_size(self) -> float:
        return max(0.0, (self.alpha + self.beta) - 4.0)

    @property
    def uncertainty(self) -> float:
        total = self.alpha + self.beta
        denom = (total**2) * (total + 1.0)
        if denom <= 0:
            return 0.25
        return math.sqrt((self.alpha * self.beta) / denom)

    @property
    def is_hard_dislike(self) -> bool:
        return self.mean <= 0.18 and (self.alpha + self.beta) >= 6.0


class PoiPrior(BaseModel):
    """Per-POI learned preference and visit history memory."""

    score_delta: float = 0.0
    hard_veto: bool = False
    visited_count: int = 0
    last_visited_at: str | None = None
    locked_count: int = 0
    category: str | None = None


class BehavioralParams(BaseModel):
    """Learned behavioral pacing, walking tolerance, and chronotype parameters."""

    walking_tolerance_km: float = 8.0
    preferred_stops_per_day: float = 3.5
    start_time_mins: int = 510
    end_time_mins: int = 1320
    chronotype: str = "balanced"  # "early_bird", "balanced", "night_owl"
    crowd_tolerance: float = Field(default=0.5, ge=0.0, le=1.0)
    pace: str = "balanced"


class EconomicProfile(BaseModel):
    """Learned budget elasticity, lodging, flight, and deal responsiveness."""

    budget_tier: str = "balanced"
    price_sensitivity: float = Field(default=0.5, ge=0.0, le=1.0)
    category_elasticity: dict[str, float] = Field(
        default_factory=lambda: {
            "food": 0.5,
            "attractions": 0.5,
            "lodging": 0.5,
            "transport": 0.5,
        }
    )
    lodging_preferences: dict[str, Any] = Field(
        default_factory=lambda: {
            "preferred_types": {},
            "preferred_stars": None,
            "amenity_affinities": {},
            "free_cancellation_bias": 0.5,
            "location_vs_price_weight": 0.5,
            "discarded_property_ids": [],
        }
    )
    flight_preferences: dict[str, Any] = Field(
        default_factory=lambda: {
            "preferred_departure_window": None,  # e.g. [start_hour, end_hour]
            "airline_affinities": {},
            "direct_flight_bias": 0.5,
        }
    )
    deal_responsiveness: dict[str, Any] = Field(
        default_factory=lambda: {
            "accepted_count": 0,
            "discarded_count": 0,
            "target_discount_pct": 15.0,
            "preferred_destinations": {},
        }
    )


def _default_category_posteriors() -> dict[str, BetaPosterior]:
    return {tag: BetaPosterior() for tag in TAG_KEYS}


class UserTasteProfile(BaseModel):
    """Complete per-user learned taste profile across all travel dimensions."""

    user_id: str
    version: int = 1
    event_count: int = 0
    is_neutral: bool = True
    embedding: list[float] | None = None
    category_posteriors: dict[str, BetaPosterior] = Field(
        default_factory=_default_category_posteriors
    )
    cuisine_posteriors: dict[str, BetaPosterior] = Field(default_factory=dict)
    poi_priors: dict[str, PoiPrior] = Field(default_factory=dict)
    contextual_profiles: dict[str, dict[str, BetaPosterior]] = Field(
        default_factory=dict
    )
    behavioral_params: BehavioralParams = Field(default_factory=BehavioralParams)
    economic_profile: EconomicProfile = Field(default_factory=EconomicProfile)
    disliked_tags: list[str] = Field(default_factory=list)
    ranker_weights: dict[str, Any] | None = None
    last_event_at: str | None = None

    def get_tag_affinities(self) -> dict[str, float]:
        affs: dict[str, float] = {}
        for tag in TAG_KEYS:
            if tag in self.disliked_tags:
                affs[tag] = 0.05
            elif tag in self.category_posteriors:
                affs[tag] = round(self.category_posteriors[tag].mean, 4)
            else:
                affs[tag] = 0.50
        return affs

    def get_tag_uncertainties(self) -> dict[str, float]:
        uncs: dict[str, float] = {}
        for tag in TAG_KEYS:
            post = self.category_posteriors.get(tag) or BetaPosterior()
            uncs[tag] = round(post.uncertainty, 4)
        return uncs


class MergedTripTasteProfile(BaseModel):
    """Aggregated taste profile combining all participants of a trip."""

    version: int = 1
    traveler_count: int = 1
    active_profile_count: int = 0
    embedding: list[float] | None = None
    tag_affinities: dict[str, float] = Field(
        default_factory=lambda: {t: 0.5 for t in TAG_KEYS}
    )
    tag_uncertainties: dict[str, float] = Field(
        default_factory=lambda: {t: 0.2236 for t in TAG_KEYS}
    )
    vetoed_categories: list[str] = Field(default_factory=list)
    preferred_cuisines: list[str] = Field(default_factory=list)
    poi_priors: dict[str, PoiPrior] = Field(default_factory=dict)
    contextual_profiles: dict[str, dict[str, float]] = Field(default_factory=dict)
    behavioral_params: BehavioralParams = Field(default_factory=BehavioralParams)
    economic_profile: EconomicProfile = Field(default_factory=EconomicProfile)
    traveler_affinities: dict[str, dict[str, float]] = Field(default_factory=dict)
    traveler_vectors: dict[str, list[float]] = Field(default_factory=dict)
    ranker_weights: dict[str, Any] | None = None

    def to_market_preferences(self) -> dict[str, Any]:
        """Formats merged taste profile into dictionary consumed by market & lodging rankers."""
        return {
            "pace": self.behavioral_params.pace,
            "budget_tier": self.economic_profile.budget_tier,
            "tag_affinities": dict(self.tag_affinities),
            "disliked_tags": list(self.vetoed_categories),
            "economic_profile": self.economic_profile.model_dump(mode="json"),
            "behavioral_params": self.behavioral_params.model_dump(mode="json"),
        }


class TasteEvent(BaseModel):
    """Immutable implicit or explicit user taste signal."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    trip_id: str | None = None
    entity_type: str
    entity_id: str
    event_type: TasteSignalType
    polarity: float = Field(default=0.0, ge=-1.0, le=1.0)
    weight: float = Field(default=1.0, ge=0.0)
    inferred_reason: InferredReason | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
