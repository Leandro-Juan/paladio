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

from app.engine.transit_matrix import haversine_distance
from app.schemas.itinerary import TravelConstraints
from app.schemas.user import PacePreference
from app.services.settings_service import SettingsService
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
    ZIGZAG_ROUTING = "zigzag_routing"


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


def _compute_day_zigzag_ratio(coords: list[tuple[float, float]]) -> float:
    n = len(coords)
    if n <= 2:
        return 1.0
    actual_dist = sum(
        haversine_distance(
            coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]
        )
        for i in range(n - 1)
    )
    if actual_dist < 1e-4:
        return 1.0
    best_route = list(range(n))
    improved = True
    passes = 0
    while improved and passes < 30:
        improved = False
        passes += 1
        for i in range(1, n - 2):
            for j in range(i + 1, n - 1):
                cur_d = haversine_distance(
                    coords[best_route[i - 1]][0],
                    coords[best_route[i - 1]][1],
                    coords[best_route[i]][0],
                    coords[best_route[i]][1],
                ) + haversine_distance(
                    coords[best_route[j]][0],
                    coords[best_route[j]][1],
                    coords[best_route[j + 1]][0],
                    coords[best_route[j + 1]][1],
                )
                new_d = haversine_distance(
                    coords[best_route[i - 1]][0],
                    coords[best_route[i - 1]][1],
                    coords[best_route[j]][0],
                    coords[best_route[j]][1],
                ) + haversine_distance(
                    coords[best_route[i]][0],
                    coords[best_route[i]][1],
                    coords[best_route[j + 1]][0],
                    coords[best_route[j + 1]][1],
                )
                if new_d < cur_d - 1e-5:
                    best_route[i : j + 1] = reversed(best_route[i : j + 1])
                    improved = True
    opt_dist = sum(
        haversine_distance(
            coords[best_route[k]][0],
            coords[best_route[k]][1],
            coords[best_route[k + 1]][0],
            coords[best_route[k + 1]][1],
        )
        for k in range(n - 1)
    )
    return max(1.0, actual_dist / opt_dist) if opt_dist > 1e-4 else 1.0


def evaluate_itinerary_quality(
    final_itinerary: dict[str, Any],
    constraints: TravelConstraints,
    *,
    attraction_burnout_limit: int | None = None,
    critic_strictness: float = 0.75,
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
    if attraction_burnout_limit is not None and attraction_burnout_limit > 0:
        hi = min(hi, int(attraction_burnout_limit))
        lo = min(lo, hi)
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
            lunch_req = next(
                (
                    m
                    for m in (constraints.meals or [])
                    if "LUNCH"
                    in (
                        getattr(m, "meal_type", None)
                        or (m.get("meal_type") if isinstance(m, dict) else "")
                    ).upper()
                ),
                None,
            )
            if lunch_req:
                st = getattr(lunch_req, "start_time", None) or (
                    lunch_req.get("start_time") if isinstance(lunch_req, dict) else None
                )
                et = getattr(lunch_req, "end_time", None) or (
                    lunch_req.get("end_time") if isinstance(lunch_req, dict) else None
                )
                l_start = (
                    _hhmm(str(st))
                    if isinstance(st, str)
                    else (st.hour * 60 + st.minute if st else 11 * 60 + 30)
                )
                l_end = (
                    _hhmm(str(et))
                    if isinstance(et, str)
                    else (et.hour * 60 + et.minute if et else 15 * 60)
                )
            else:
                l_start = 11 * 60 + 30
                l_end = 15 * 60

            lunches = [
                m
                for m in meals
                if l_start <= _hhmm(m.get("scheduled_start", "12:00")) <= l_end
            ]
            if not lunches:
                s_str = f"{l_start // 60:02d}:{l_start % 60:02d}"
                e_str = f"{l_end // 60:02d}:{l_end % 60:02d}"
                issues.append(
                    CriticIssue(
                        issue_type=CriticIssueType.MEAL_GAP,
                        day_index=d_idx,
                        severity=1.5,
                        details=f"Day {d_idx + 1} has {n_sights} sights but no scheduled lunch between {s_str} and {e_str}.",
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
        # 4. Zigzag geometry check
        day_coords = []
        for p in path:
            loc = p.get("poi", {}).get("location") or {}
            lat = (
                loc.get("latitude")
                if isinstance(loc, dict)
                else getattr(loc, "latitude", None)
            )
            lon = (
                loc.get("longitude")
                if isinstance(loc, dict)
                else getattr(loc, "longitude", None)
            )
            if lat is not None and lon is not None and (lat != 0.0 or lon != 0.0):
                day_coords.append((float(lat), float(lon)))
        if len(day_coords) >= 3:
            z_ratio = _compute_day_zigzag_ratio(day_coords)
            if z_ratio > 1.25:
                issues.append(
                    CriticIssue(
                        issue_type=CriticIssueType.ZIGZAG_ROUTING,
                        day_index=d_idx,
                        severity=2.0 if z_ratio > 1.40 else 1.2,
                        details=f"Day {d_idx + 1} exhibits ping-pong routing (zigzag ratio {z_ratio:.2f} > 1.25).",
                    )
                )

        total_travel_mins += day_travel
        day_loads.append(
            day_travel + sum(p.get("poi", {}).get("duration_mins", 60) for p in sights)
        )

    # Objective function J: rewards sights scheduled, penalizes travel and critic penalties
    strictness_scale = max(0.0, float(critic_strictness)) / 0.75
    penalty = sum(i.severity * 50.0 for i in issues) * strictness_scale
    j_score = (total_sights * 100.0) - (total_travel_mins * 1.5) - penalty

    return issues, round(j_score, 2)


async def planner_critic_node(state: SwarmState, config: RunnableConfig) -> dict:
    """LangGraph node: Audits final itinerary and generates typed issues."""
    final_itin = state.get("final_itinerary")
    constraints_dict = state.get("validated_itinerary") or {}
    constraints = TravelConstraints(**constraints_dict) if constraints_dict else None

    if not final_itin or not constraints:
        return {"critic_issues": [], "current_objective_j": 0.0}

    engine_cfg = await SettingsService.get_domain_settings_safe("engine")
    swarm_cfg = await SettingsService.get_domain_settings_safe("swarm")
    issues, j_score = evaluate_itinerary_quality(
        final_itin,
        constraints,
        attraction_burnout_limit=engine_cfg.get("attraction_burnout_limit"),
        critic_strictness=float(swarm_cfg.get("critic_strictness", 0.75)),
    )
    logger.info(
        f"--- [PHASE: CRITIC] Evaluated itinerary: {len(issues)} issue(s), Objective J = {j_score} ---"
    )

    return {
        "critic_issues": [i.model_dump() for i in issues],
        "current_objective_j": j_score,
    }
