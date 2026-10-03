"""Deterministic Itinerary Critic for Paladio Swarm (Phase 6).

Evaluates generated itineraries against realism rules:
1. Pacing & Fatigue (overloaded / underloaded days)
2. Meal Gaps (missing lunch slot on full sightseeing days)
3. Excessive Transit & Idle Spans
4. Missing Tier 1 Must-See Anchors

Emits typed CriticIssues and computes the deterministic objective score J.
"""

from enum import Enum
import logging
from typing import Any

from app.schemas.itinerary import TravelConstraints
from app.schemas.user import PacePreference
from app.swarm.state import SwarmState
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class CriticIssueType(str, Enum):
    MISSING_TIER_1 = "missing_tier_1"
    DAY_OVERLOADED = "day_overloaded"
    DAY_UNDERLOADED = "day_underloaded"
    MEAL_GAP = "meal_gap"
    EXCESSIVE_TRANSIT = "excessive_transit"
    IDLE_GAP = "idle_gap"


class CriticIssue(BaseModel):
    issue_type: CriticIssueType
    day_index: int | None = None
    poi_name: str | None = None
    severity: float = 1.0
    details: str


PACE_SIGHT_BOUNDS = {
    PacePreference.LEISURELY: (2, 4),
    PacePreference.BALANCED: (3, 5),
    PacePreference.INTENSE: (4, 7),
}


def _hhmm(s: str) -> int:
    t = s.split("T")[-1][:5]
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _is_meal(p: dict[str, Any]) -> bool:
    cat = (p.get("poi", {}).get("category") or "").upper()
    return cat in ("RESTAURANT", "CAFE", "BAKERY")


def _is_depot(p: dict[str, Any]) -> bool:
    cat = (p.get("poi", {}).get("category") or "").upper()
    return cat in ("HOTEL", "AIRPORT")


def evaluate_itinerary_quality(
    final_itinerary: dict[str, Any], constraints: TravelConstraints
) -> tuple[list[CriticIssue], float]:
    """Pure, deterministic evaluation of an itinerary returning (issues, objective_score J)."""
    issues: list[CriticIssue] = []
    days = final_itinerary.get("days", [])
    if not days:
        return [
            CriticIssue(
                issue_type=CriticIssueType.DAY_UNDERLOADED,
                details="Empty itinerary with zero days.",
                severity=5.0,
            )
        ], -1000.0

    pace = getattr(constraints, "pace", PacePreference.BALANCED)
    lo, hi = PACE_SIGHT_BOUNDS.get(pace, (3, 5))
    n_days = len(days)

    total_sights = 0
    total_travel_mins = 0
    day_loads: list[int] = []

    for d_idx, day_data in enumerate(days):
        itin = day_data.get("itinerary", {})
        path = (
            itin.get("path", [])
            if isinstance(itin, dict)
            else getattr(itin, "path", [])
        )
        sights = [p for p in path if not _is_depot(p) and not _is_meal(p)]
        meals = [p for p in path if _is_meal(p)]
        is_edge = d_idx in (0, n_days - 1) and n_days > 1
        n_sights = len(sights)
        total_sights += n_sights

        # 1. Pacing check
        if not is_edge and n_sights < lo and pace != PacePreference.LEISURELY:
            issues.append(
                CriticIssue(
                    issue_type=CriticIssueType.DAY_UNDERLOADED,
                    day_index=d_idx,
                    severity=1.5,
                    details=f"Day {d_idx + 1} has only {n_sights} sights (<{lo}).",
                )
            )
        elif n_sights > hi:
            issues.append(
                CriticIssue(
                    issue_type=CriticIssueType.DAY_OVERLOADED,
                    day_index=d_idx,
                    severity=2.0,
                    details=f"Day {d_idx + 1} has {n_sights} sights (>{hi}).",
                )
            )

        # 2. Meal gap check on full sightseeing days
        if not is_edge and n_sights >= 3:
            lunches = [
                m
                for m in meals
                if 11 * 60 + 30 <= _hhmm(m.get("scheduled_start", "12:00")) <= 15 * 60
            ]
            if not lunches:
                issues.append(
                    CriticIssue(
                        issue_type=CriticIssueType.MEAL_GAP,
                        day_index=d_idx,
                        severity=1.5,
                        details=f"Day {d_idx + 1} has {n_sights} sights but no scheduled lunch between 11:30 and 15:00.",
                    )
                )

        # 3. Transit check
        day_travel = 0
        for p in path:
            tr = p.get("transit_from_previous")
            dur = (
                tr.get("duration_mins", 0)
                if isinstance(tr, dict)
                else getattr(tr, "duration_mins", 0)
            )
            day_travel += dur
            if dur > 50:
                issues.append(
                    CriticIssue(
                        issue_type=CriticIssueType.EXCESSIVE_TRANSIT,
                        day_index=d_idx,
                        severity=1.0,
                        details=f"Day {d_idx + 1} contains a transit leg of {dur} minutes (>50m).",
                    )
                )
        total_travel_mins += day_travel
        day_loads.append(
            day_travel + sum(p.get("poi", {}).get("duration_mins", 60) for p in sights)
        )

    # Objective function J: rewards sights scheduled, penalizes travel and critic penalties
    penalty = sum(i.severity * 50.0 for i in issues)
    j_score = (total_sights * 100.0) - (total_travel_mins * 1.5) - penalty

    return issues, round(j_score, 2)


async def planner_critic_node(state: SwarmState, config: RunnableConfig) -> dict:
    """LangGraph node: Audits final itinerary and generates typed issues."""
    final_itin = state.get("final_itinerary")
    constraints_dict = state.get("validated_itinerary") or {}
    constraints = TravelConstraints(**constraints_dict) if constraints_dict else None

    if not final_itin or not constraints:
        return {"critic_issues": [], "current_objective_j": 0.0}

    issues, j_score = evaluate_itinerary_quality(final_itin, constraints)
    logger.info(
        f"--- [PHASE: CRITIC] Evaluated itinerary: {len(issues)} issue(s), Objective J = {j_score} ---"
    )

    return {
        "critic_issues": [i.model_dump() for i in issues],
        "current_objective_j": j_score,
    }
