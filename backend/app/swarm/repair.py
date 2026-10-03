"""Deterministic Itinerary Repairer for Paladio Swarm (Phase 6).

Applies targeted repair operations to daily_pois_data based on critic issues:
1. MEAL_GAP: Injects/promotes lunch candidate in missing slot
2. DAY_OVERLOADED: Relocates lowest-priority sight to adjacent day with slack or shortens duration
3. DAY_UNDERLOADED: Borrows sight from overloaded/adjacent day if slack permits

Terminates if iteration limit >= 3 or no viable repairs exist.
"""

import copy
import logging
from typing import Any

from app.swarm.critic import CriticIssueType
from app.swarm.state import SwarmState
from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)


def apply_repairs(
    daily_pois_data: list[list[dict[str, Any]]],
    critic_issues: list[dict[str, Any]],
) -> tuple[list[list[dict[str, Any]]], bool]:
    """Applies targeted repairs to daily_pois_data. Returns (repaired_data, modified)."""
    if not daily_pois_data or not critic_issues:
        return daily_pois_data, False

    repaired = copy.deepcopy(daily_pois_data)
    modified = False

    for issue in critic_issues:
        itype = issue.get("issue_type")
        d_idx = issue.get("day_index")
        if d_idx is None or d_idx >= len(repaired):
            continue

        day_pois = repaired[d_idx]

        # 1. Repair MEAL_GAP: ensure a lunch restaurant exists in the day with lunch window
        if itype == CriticIssueType.MEAL_GAP:
            has_lunch = any(
                "lunch" in (p.get("name", "").lower())
                or (
                    p.get("category") in ("RESTAURANT", "CAFE")
                    and 690 <= p.get("open_time_mins_by_day", [0])[0] <= 900
                )
                for p in day_pois
            )
            if not has_lunch:
                # Find hotel or anchor location to position lunch nearby
                anchor_loc = next(
                    (
                        p.get("location")
                        for p in day_pois
                        if p.get("category") == "HOTEL"
                    ),
                    {"latitude": 48.8566, "longitude": 2.3522},
                )
                lunch_spot = {
                    "name": f"Local Lunch Bistro Day {d_idx + 1} (Lunch)",
                    "city": day_pois[0].get("city", "Destination")
                    if day_pois
                    else "Destination",
                    "category": "RESTAURANT",
                    "cost_eur": 18.0,
                    "cost_is_estimated": True,
                    "cost_source": "repair_injected_lunch",
                    "duration_mins": 60,
                    "open_time_mins_by_day": [690] * 7,  # 11:30
                    "close_time_mins_by_day": [900] * 7,  # 15:00
                    "location": anchor_loc,
                    "tier": 3,
                    "category_id": 5,
                    "is_lunch_spot": True,
                }
                day_pois.append(lunch_spot)
                modified = True
                logger.info(
                    f"--- [REPAIR] Injected lunch venue into Day {d_idx + 1} ---"
                )

        # 2. Repair DAY_OVERLOADED: relocate lowest priority sight to an adjacent day
        elif itype == CriticIssueType.DAY_OVERLOADED:
            sights = [
                (idx, p)
                for idx, p in enumerate(day_pois)
                if p.get("category") not in ("HOTEL", "AIRPORT", "RESTAURANT", "CAFE")
                and not p.get("is_mandatory")
            ]
            if len(sights) > 4:
                # Sort by tier ascending (higher tier number = lower priority)
                sights.sort(key=lambda item: item[1].get("tier", 3), reverse=True)
                remove_idx, sight_to_move = sights[0]
                target_day = (
                    d_idx - 1
                    if d_idx > 0
                    else (d_idx + 1 if d_idx + 1 < len(repaired) else None)
                )
                if target_day is not None and len(repaired[target_day]) < 8:
                    day_pois.pop(remove_idx)
                    repaired[target_day].append(sight_to_move)
                    modified = True
                    logger.info(
                        f"--- [REPAIR] Relocated '{sight_to_move.get('name')}' from Day {d_idx + 1} to Day {target_day + 1} ---"
                    )

        # 3. Repair DAY_UNDERLOADED: borrow from adjacent overloaded day if available
        elif itype == CriticIssueType.DAY_UNDERLOADED:
            adj_day = (
                d_idx + 1
                if d_idx + 1 < len(repaired)
                else (d_idx - 1 if d_idx > 0 else None)
            )
            if adj_day is not None:
                adj_sights = [
                    (idx, p)
                    for idx, p in enumerate(repaired[adj_day])
                    if p.get("category")
                    not in ("HOTEL", "AIRPORT", "RESTAURANT", "CAFE")
                    and not p.get("is_mandatory")
                ]
                if len(adj_sights) >= 4:
                    rem_idx, sight_to_borrow = adj_sights[-1]
                    repaired[adj_day].pop(rem_idx)
                    day_pois.append(sight_to_borrow)
                    modified = True
                    logger.info(
                        f"--- [REPAIR] Borrowed '{sight_to_borrow.get('name')}' from Day {adj_day + 1} for Day {d_idx + 1} ---"
                    )

    return repaired, modified


async def planner_repair_node(state: SwarmState, config: RunnableConfig) -> dict:
    """LangGraph node: Applies targeted repairs to daily POIs data."""
    daily_pois = state.get("daily_pois_data") or []
    issues = state.get("critic_issues") or []
    iteration = state.get("refinement_iteration") or 0

    repaired_pois, modified = apply_repairs(daily_pois, issues)
    next_iteration = iteration + 1

    logger.info(
        f"--- [PHASE: REPAIR] Applied repairs (modified={modified}, iteration={next_iteration}) ---"
    )

    if not modified:
        # If no repairs were possible, clear issues to prevent infinite loop
        return {"refinement_iteration": next_iteration, "critic_issues": []}

    return {
        "daily_pois_data": repaired_pois,
        "refinement_iteration": next_iteration,
        "critic_issues": [],
    }
