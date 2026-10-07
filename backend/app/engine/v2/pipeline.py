"""Master End-to-End Orchestrator for Paladio Itinerary v2.

Chains the 8 deterministic stages:
1. Trip Frame construction (flight windows, depot, pace)
2. Candidate Pool generation (100% T1/T2, taste vectors, mandatories, meals)
3. Trip-level Submodular Selection (iconic forced set + submodular greedy fill)
4. Day Assignment (walking bundles, anchor seeds, regret-2, Hungarian matching)
5. Pro-rata Budget Allocation & FX conversion
6. Multi-day Parallel C++ Solving (paladio_core with arrival_times and meal injection)
7. Dynamic Budget Slack Redistribution
8. Explainable output synthesis (themes, reason codes, dropped list)
"""

import logging
from collections.abc import Callable
from typing import Any

from app.domain.entities.poi import Poi, PoiLocation
from app.domain.interfaces.poi_repository import IPoiRepository
from app.engine.v2.budget import allocate_trip_budget
from app.engine.v2.candidate_pool import CandidatePoi, build_candidate_pool
from app.engine.v2.day_assignment import DayAssignmentResult, assign_pois_to_days
from app.engine.v2.rhythm import compute_city_rhythm_profile
from app.engine.v2.selection import DroppedPoi, SelectedPoi, select_trip_pois
from app.engine.v2.solver import DaySolveResult, solve_trip_v2
from app.engine.v2.trip_frame import TripFrame, build_trip_frame
from app.schemas.itinerary import TravelConstraints
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class TripV2Summary(BaseModel):
    total_cost_eur: float
    total_time_mins: int
    load_variance: float
    closure_violations: int
    total_pois_scheduled: int
    nodes_expanded: int
    timed_out: bool


class ItineraryV2Result(BaseModel):
    """Full travel-agency-grade itinerary output."""

    city: str
    trip_frame: TripFrame
    days: list[dict[str, Any]]
    selected_pois: list[SelectedPoi] = Field(default_factory=list)
    dropped_pois: list[DroppedPoi] = Field(default_factory=list)
    summary: TripV2Summary


def derive_city_center(candidate_pool: list[CandidatePoi]) -> tuple[float, float]:
    """Coordinate-wise median of Tier-1/2 sights (falls back to all sights)."""
    sights = [c for c in candidate_pool if not c.is_meal_spot]
    core = [c for c in sights if c.tier <= 2] or sights
    pts = [
        (float(c.location["latitude"]), float(c.location["longitude"]))
        for c in core
        if c.location.get("latitude") is not None
        and c.location.get("longitude") is not None
    ]
    if not pts:
        return (0.0, 0.0)
    lats = sorted(p[0] for p in pts)
    lons = sorted(p[1] for p in pts)
    mid = len(pts) // 2
    return lats[mid], lons[mid]


async def run_itinerary_v2_pipeline(
    city: str,
    constraints: TravelConstraints,
    poi_repo: IPoiRepository,
    transit_matrix_fn: Callable[[list[dict[str, Any]], str], list[list[Any]]],
    depot_poi: Poi | None = None,
    outbound_flight: dict[str, Any] | None = None,
    return_flight: dict[str, Any] | None = None,
    max_nodes_expanded: int = 50000,
    user_vector: list[float] | None = None,
) -> ItineraryV2Result:
    """Executes the complete v2 itinerary pipeline autonomously."""
    # Stage 2 (first): Candidate Pool - also yields the city centre used as default depot
    candidate_pool = await build_candidate_pool(
        city=city,
        poi_repo=poi_repo,
        user_vector=user_vector,
        constraints=constraints,
    )
    if depot_poi and depot_poi.location and depot_poi.location.latitude:
        city_center = (
            float(depot_poi.location.latitude),
            float(depot_poi.location.longitude),
        )
    else:
        city_center = derive_city_center(candidate_pool)

    # Derive local circadian rhythm and dining windows from city dining venues
    dining_venues = [c for c in candidate_pool if c.is_meal_spot]
    rhythm_profile = compute_city_rhythm_profile(dining_venues)

    # Stage 1: Trip Frame
    trip_frame = build_trip_frame(
        constraints=constraints,
        outbound_flight=outbound_flight,
        return_flight=return_flight,
        city_center=city_center,
        rhythm=rhythm_profile,
    )

    # Stage 3: Submodular Selection
    selection_res = select_trip_pois(
        candidate_pool=candidate_pool,
        trip_frame=trip_frame,
    )
    selected_pois = selection_res.selected_pois
    dropped_pois = selection_res.dropped_pois

    # Stage 4: Day Assignment
    assignment_res: DayAssignmentResult = assign_pois_to_days(
        selected_pois=selected_pois,
        trip_frame=trip_frame,
        candidate_pool=candidate_pool,
    )

    # Stage 5: Budget Allocation
    budgeted_days = allocate_trip_budget(
        assigned_days=assignment_res.assigned_days,
        total_budget_usd=constraints.budget_usd,
    )

    # Depot fallback: the city's tourist centre (median of its Tier-1/2 sights)
    if not depot_poi:
        depot_poi = Poi(
            id="default_hotel_depot",
            name="Accommodations / Hotel Depot",
            city=city,
            category="HOTEL",
            location=PoiLocation(latitude=city_center[0], longitude=city_center[1]),
            open_time_mins_by_day=[0] * 7,
            close_time_mins_by_day=[1440] * 7,
            duration_mins=1,
            cost_eur=0.0,
            tier=3,
            iconicity_score=0.0,
            taxonomy_category="art_culture",
            category_id=255,
        )
    elif not depot_poi.location or not depot_poi.location.latitude:
        depot_poi.location = PoiLocation(
            latitude=city_center[0], longitude=city_center[1]
        )

    # Stage 6 & 7: Multi-Day Parallel C++ Solve with Slack Redistribution
    solve_results: list[DaySolveResult] = await solve_trip_v2(
        assigned_days=budgeted_days,
        city=city,
        constraints=constraints,
        depot_poi=depot_poi,
        candidate_pool=candidate_pool,
        transit_matrix_fn=transit_matrix_fn,
        max_nodes_expanded=max_nodes_expanded,
        rhythm=rhythm_profile,
    )

    # Stage 8: Explainable Output Assembly
    days_output: list[dict[str, Any]] = []
    total_cost = 0.0
    total_time = 0
    total_nodes = 0
    any_timeout = False
    daily_loads = []
    total_scheduled = 0

    for d_res in solve_results:
        itin = d_res.itinerary
        total_cost += itin.total_cost_eur
        total_time += itin.total_time_mins
        total_nodes += d_res.nodes_expanded
        if d_res.timed_out:
            any_timeout = True
        daily_loads.append(itin.total_time_mins)

        # Count non-depot scheduled POIs
        non_depots = [
            p for p in itin.path if p.poi.category.upper() not in ("HOTEL", "AIRPORT")
        ]
        total_scheduled += len(non_depots)

        import copy

        daily_flight = None
        if d_res.day_index == 0 and outbound_flight:
            daily_flight = copy.deepcopy(outbound_flight)
            daily_flight["direction"] = "arrival"
        elif d_res.day_index == len(solve_results) - 1 and return_flight:
            daily_flight = copy.deepcopy(return_flight)
            daily_flight["direction"] = "departure"

        days_output.append(
            {
                "day": d_res.day_index + 1,
                "day_index": d_res.day_index,
                "flight_info": daily_flight,
                "inbound_flight": copy.deepcopy(outbound_flight)
                if d_res.day_index == 0 and outbound_flight
                else None,
                "outbound_flight": copy.deepcopy(return_flight)
                if d_res.day_index == len(solve_results) - 1 and return_flight
                else None,
                "theme": d_res.theme,
                "anchor": d_res.anchor_name,
                "itinerary": itin,
                "committed_pois": d_res.committed_pois,
                "scheduled_pois": d_res.scheduled_poi_names,
                "dropped_pois": d_res.dropped_poi_names,
                "unspent_budget_eur": d_res.unspent_budget_eur,
            }
        )

    import numpy as np

    load_variance = float(np.var(daily_loads)) if len(daily_loads) > 1 else 0.0

    summary = TripV2Summary(
        total_cost_eur=round(total_cost, 2),
        total_time_mins=total_time,
        load_variance=round(load_variance, 2),
        closure_violations=assignment_res.closure_violations,
        total_pois_scheduled=total_scheduled,
        nodes_expanded=total_nodes,
        timed_out=any_timeout,
    )

    return ItineraryV2Result(
        city=city,
        trip_frame=trip_frame,
        days=days_output,
        selected_pois=selected_pois,
        dropped_pois=dropped_pois,
        summary=summary,
    )
