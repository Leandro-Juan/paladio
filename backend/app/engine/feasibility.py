"""Feasibility Probe for Mandatory Nodes in Paladio Itinerary v2.

Evaluates mandatory POIs against daily calendar windows, opening hours,
and transit constraints before setting is_mandatory=True in the C++ solver.
Prevents solver infeasibility aborts while maximizing mandatory coverage.
"""

import logging
from collections.abc import Sequence

from app.domain.entities.poi import Poi
from app.engine.transit_matrix import haversine_distance

logger = logging.getLogger(__name__)


class FeasibilityCheckResult:
    """Outcome of feasibility evaluation for a daily POI set."""

    def __init__(self):
        self.feasible_mandatory_ids: set[str] = set()
        self.infeasible_mandatory_ids: set[str] = set()
        self.warnings: list[str] = []


def probe_mandatory_feasibility(
    pois: Sequence[Poi],
    day_start_mins: int,
    day_end_mins: int,
    day_weekday: int = 0,
) -> FeasibilityCheckResult:
    """Quick heuristic probe before setting is_mandatory=True in C++ optimization."""
    result = FeasibilityCheckResult()
    available_duration = max(0, day_end_mins - day_start_mins)

    mandatory_pois = [p for p in pois if getattr(p, "is_mandatory", False)]
    if not mandatory_pois:
        return result

    total_mandatory_duration = 0
    valid_mandatories: list[Poi] = []

    for p in mandatory_pois:
        p_id = str(p.id or p.name)
        open_vec = getattr(p, "open_time_mins_by_day", None)
        close_vec = getattr(p, "close_time_mins_by_day", None)

        if open_vec and len(open_vec) == 7 and 0 <= day_weekday < 7:
            o_min = open_vec[day_weekday]
            c_min = close_vec[day_weekday]
            if o_min == -1 or c_min == -1:
                o_min, c_min = p.open_time_mins, p.close_time_mins
        else:
            o_min, c_min = p.open_time_mins, p.close_time_mins

        # 1. Closed venue check
        if open_vec and len(open_vec) == 7 and open_vec[day_weekday] == -1:
            result.infeasible_mandatory_ids.add(p_id)
            result.warnings.append(
                f"Mandatory POI '{p.name}' is closed on weekday {day_weekday}."
            )
            continue

        # 2. Window overlap check
        earliest = max(o_min, day_start_mins)
        latest = c_min
        if (
            earliest >= day_end_mins
            or latest <= day_start_mins
            or (latest - earliest) < p.duration_mins
        ):
            result.infeasible_mandatory_ids.add(p_id)
            result.warnings.append(
                f"Mandatory POI '{p.name}' opening window [{o_min}, {c_min}] does not accommodate "
                f"duration {p.duration_mins}m within day window [{day_start_mins}, {day_end_mins}]."
            )
            continue

        total_mandatory_duration += p.duration_mins
        valid_mandatories.append(p)

    # 3. Aggregate capacity check (duration + rough transit)
    # Estimate minimum walking transit between consecutive mandatories
    transit_estimate = 0
    for i in range(len(valid_mandatories) - 1):
        p1 = valid_mandatories[i]
        p2 = valid_mandatories[i + 1]
        lat1 = p1.location.latitude or 0.0
        lon1 = p1.location.longitude or 0.0
        lat2 = p2.location.latitude or 0.0
        lon2 = p2.location.longitude or 0.0
        dist_km = haversine_distance(lat1, lon1, lat2, lon2)
        transit_estimate += int((dist_km / 4.5) * 60) + 10  # ~4.5 km/h + 10m buffer

    if total_mandatory_duration + transit_estimate > available_duration:
        # All mandatories cannot fit simultaneously. Keep the ones that fit, demote excess.
        accumulated_time = 0
        for p in valid_mandatories:
            p_id = str(p.id or p.name)
            if accumulated_time + p.duration_mins <= available_duration:
                accumulated_time += p.duration_mins + 20  # duration + transit allowance
                result.feasible_mandatory_ids.add(p_id)
            else:
                result.infeasible_mandatory_ids.add(p_id)
                result.warnings.append(
                    f"Mandatory POI '{p.name}' demoted to high-prize optional: aggregate duration exceeds available day time."
                )
    else:
        for p in valid_mandatories:
            result.feasible_mandatory_ids.add(str(p.id or p.name))

    return result
