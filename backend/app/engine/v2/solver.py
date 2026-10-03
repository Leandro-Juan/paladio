"""Per-Day C++ Solver Integration and Multi-Day Thread Pool for Itinerary v2.

Integrates paladio_core per-day solver with:
1. Direct consumption of C++ arrival_times (no Python re-simulation)
2. Mandatory feasibility probe preventing solver aborts
3. Localized meal candidate injection
4. Multi-day concurrent execution via asyncio.to_thread (C++ releases Python GIL)
5. Dynamic budget slack redistribution and dropped POI recording
"""

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from app.domain.entities.poi import (
    Itinerary,
    Poi,
    PoiLocation,
    ScheduledPoi,
    ScoredPoi,
    TransitLeg,
)
from app.engine.v2.budget import redistribute_budget_slack
from app.engine.v2.day_assignment import AssignedDay
from app.engine.v2.feasibility import probe_mandatory_feasibility
from app.engine.v2.meals import select_daily_meal_candidates
from app.infrastructure.engine.struct_mapper import (
    build_cpp_pois,
    build_optimization_config,
    flatten_transit_matrix,
)
from app.schemas.itinerary import TravelConstraints
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

try:
    import paladio_core
except ImportError:
    paladio_core = None


class V2SolveError(RuntimeError):
    """Raised when the per-day C++ solve fails. Never masked by an empty itinerary."""


class DaySolveResult(BaseModel):
    """Result of solving a single day with the C++ engine."""

    day_index: int
    itinerary: Itinerary
    theme: str = "City Exploration"
    anchor_name: str | None = None
    committed_pois: list[str] = Field(default_factory=list)
    scheduled_poi_names: list[str] = Field(default_factory=list)
    dropped_poi_names: list[str] = Field(default_factory=list)
    unspent_budget_eur: float = 0.0
    nodes_expanded: int = 0
    timed_out: bool = False


async def solve_day_v2(
    assigned_day: AssignedDay,
    city: str,
    constraints: TravelConstraints,
    depot_poi: Poi,
    candidate_pool: list[Any],
    transit_matrix_fn: Callable[[list[dict[str, Any]], str], list[list[Any]]],
    max_nodes_expanded: int = 50000,
    timeout_ms: int = 500,
) -> DaySolveResult:
    """Solves a single calendar day deterministically using paladio_core."""
    # 1. Gather committed POIs
    committed = [p.poi for p in assigned_day.pois]
    committed_entities: list[Poi] = []
    mandatory_names: list[str] = []

    for p in committed:
        poi_entity = p.poi if hasattr(p, "poi") and isinstance(p.poi, Poi) else None
        if not poi_entity:
            # Construct Poi from CandidatePoi
            lat = (
                p.location.get("latitude", 0.0) if isinstance(p.location, dict) else 0.0
            )
            lon = (
                p.location.get("longitude", 0.0)
                if isinstance(p.location, dict)
                else 0.0
            )
            poi_entity = Poi(
                id=str(p.id or p.name),
                name=p.name,
                city=city,
                category=getattr(p, "category", "attraction"),
                location=PoiLocation(latitude=lat, longitude=lon),
                open_time_mins_by_day=p.open_time_mins_by_day,
                close_time_mins_by_day=p.close_time_mins_by_day,
                duration_mins=p.duration_mins,
                cost_eur=p.cost_eur,
                tier=p.tier,
                iconicity_score=p.iconicity_score,
                taxonomy_category=p.taxonomy_category,
                category_id=p.category_id,
            )
        is_mand = getattr(p, "is_mandatory", False) or getattr(
            p, "is_user_mandatory", False
        )
        poi_entity.is_mandatory = is_mand
        if is_mand:
            mandatory_names.append(poi_entity.name)
        committed_entities.append(poi_entity)

    # 2. Feasibility Probe on Mandatories
    probe_res = probe_mandatory_feasibility(
        committed_entities,
        day_start_mins=assigned_day.start_time_mins,
        day_end_mins=assigned_day.end_time_mins,
        day_weekday=assigned_day.weekday,
    )
    if probe_res.infeasible_mandatory_ids:
        for p in committed_entities:
            p_id = str(p.id or p.name)
            if p_id in probe_res.infeasible_mandatory_ids:
                p.is_mandatory = False
                if p.name in mandatory_names:
                    mandatory_names.remove(p.name)

    # 3. Inject 3-4 meal candidates near anchor / centroid
    anchor_lat = depot_poi.location.latitude or 0.0
    anchor_lon = depot_poi.location.longitude or 0.0
    if assigned_day.anchor_poi:
        loc = assigned_day.anchor_poi.poi.location
        anchor_lat = (
            loc.get("latitude", anchor_lat)
            if isinstance(loc, dict)
            else getattr(loc, "latitude", anchor_lat)
        )
        anchor_lon = (
            loc.get("longitude", anchor_lon)
            if isinstance(loc, dict)
            else getattr(loc, "longitude", anchor_lon)
        )

    slots = (
        [m.lower() for m in constraints.meals]
        if constraints.meals
        else (assigned_day.requested_meals or ["lunch"])
    )
    meal_candidates = select_daily_meal_candidates(
        anchor_lat=anchor_lat,
        anchor_lon=anchor_lon,
        candidate_pool=candidate_pool,
        requested_slots=slots,
        candidates_per_slot=3,
    )

    # 4. Construct complete solver node graph
    # Node 0: Start Depot
    # Nodes 1..M: Committed POIs
    # Nodes M+1..M+R: Meal candidates
    # Node Last: End Depot
    start_depot = depot_poi.model_copy(deep=True)
    start_depot.name = f"{depot_poi.name} (Start)"
    end_depot = depot_poi.model_copy(deep=True)
    end_depot.name = f"{depot_poi.name} (End)"

    all_pois = [start_depot] + committed_entities + meal_candidates + [end_depot]

    # Enforce hard cap <= 64
    if len(all_pois) > 64:
        # Trim meal candidates first
        excess = len(all_pois) - 64
        meal_candidates = (
            meal_candidates[:-excess] if excess < len(meal_candidates) else []
        )
        all_pois = [start_depot] + committed_entities + meal_candidates + [end_depot]

    scored_pois: list[ScoredPoi] = []
    for idx, p in enumerate(all_pois):
        if idx in (0, len(all_pois) - 1):
            score = 0.0
        elif p in committed_entities:
            score = (
                90.0
                if p.is_mandatory
                else max(50.0, float(getattr(p, "iconicity_score", 0.5) * 80.0))
            )
        else:
            score = 65.0  # Meal candidate prize
        scored_pois.append(ScoredPoi(poi=p, score=score))

    # 5. Build transit matrix & C++ structs
    dict_pois = [
        {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "location": {
                "latitude": p.location.latitude or 0.0,
                "longitude": p.location.longitude or 0.0,
            },
        }
        for p in all_pois
    ]
    raw_matrix = transit_matrix_fn(dict_pois, city)
    durations, costs = flatten_transit_matrix(raw_matrix)

    cpp_pois = build_cpp_pois(
        scored_pois,
        day_start_mins=assigned_day.start_time_mins,
        mandatory_names=mandatory_names,
        day_weekday=assigned_day.weekday,
    )

    config = build_optimization_config(
        constraints=constraints,
        day_start_mins=assigned_day.start_time_mins,
        day_end_mins=assigned_day.end_time_mins,
        start_node_index=0,
        end_node_index=len(all_pois) - 1,
        cpp_pois=cpp_pois,
        monotony_threshold=2,
        monotony_multiplier=0.5,
        max_nodes_expanded=max_nodes_expanded,
        max_budget=assigned_day.daily_budget_eur,
        enforce_default_meal_deadlines=bool(
            constraints.meals
            or assigned_day.requested_meals
            or len(committed_entities) >= 3
            or (assigned_day.end_time_mins - assigned_day.start_time_mins >= 360)
        ),
        max_idle_time=120,
    )

    # 6. Execute C++ solve in thread pool (C++ releases GIL)
    try:
        opt_res = await asyncio.to_thread(
            paladio_core.optimize_itinerary,
            cpp_pois,
            durations,
            costs,
            config,
        )
    except (
        RuntimeError,
        ValueError,
        TypeError,
        KeyError,
        AttributeError,
        OSError,
    ) as e:
        raise V2SolveError(
            f"C++ solve failed for day {assigned_day.day_index} in {city}: {e}"
        ) from e

    # 7. Map back using direct arrival times from C++ result
    path_nodes = opt_res.path
    arr_times = getattr(opt_res, "arrival_times", [])
    has_arrival_times = len(arr_times) == len(path_nodes)

    scheduled: list[ScheduledPoi] = []
    scheduled_names: set[str] = set()

    for k_step, node_idx in enumerate(path_nodes):
        node_poi = all_pois[node_idx]
        is_depot = node_idx in (0, len(all_pois) - 1)
        dur = 0 if is_depot else node_poi.duration_mins

        if has_arrival_times:
            arr_m = arr_times[k_step]
            dep_m = arr_m + dur
        else:
            arr_m = assigned_day.start_time_mins
            dep_m = arr_m + dur

        start_h, start_m = arr_m // 60, arr_m % 60
        end_h, end_m = dep_m // 60, dep_m % 60

        leg_transit = None
        if k_step > 0:
            prev_idx = path_nodes[k_step - 1]
            dur_mins = int(durations[prev_idx * len(all_pois) + node_idx])
            cost_transit = float(costs[prev_idx * len(all_pois) + node_idx])
            leg_transit = TransitLeg(
                duration_mins=dur_mins,
                cost_eur=cost_transit,
                mode="transit" if dur_mins > 15 else "pedestrian",
            )

        scheduled.append(
            ScheduledPoi(
                poi=node_poi,
                scheduled_start=f"{start_h:02d}:{start_m:02d}",
                scheduled_end=f"{end_h:02d}:{end_m:02d}",
                transit_from_previous=leg_transit,
            )
        )
        if not is_depot:
            scheduled_names.add(node_poi.name)

    day_itin = Itinerary(
        total_score=float(opt_res.total_score),
        total_cost_eur=float(opt_res.total_cost),
        total_time_mins=int(opt_res.total_time),
        path=scheduled,
        nodes_expanded=int(getattr(opt_res, "nodes_expanded", 0)),
        timed_out=bool(getattr(opt_res, "timed_out", False)),
    )

    committed_names = [p.name for p in committed_entities]
    dropped_names = [name for name in committed_names if name not in scheduled_names]
    unspent = max(
        0.0, round(assigned_day.daily_budget_eur - float(opt_res.total_cost), 2)
    )

    return DaySolveResult(
        day_index=assigned_day.day_index,
        itinerary=day_itin,
        theme=assigned_day.theme,
        anchor_name=assigned_day.anchor_poi.poi.name
        if assigned_day.anchor_poi
        else None,
        committed_pois=committed_names,
        scheduled_poi_names=list(scheduled_names),
        dropped_poi_names=dropped_names,
        unspent_budget_eur=unspent,
        nodes_expanded=day_itin.nodes_expanded,
        timed_out=day_itin.timed_out,
    )


async def solve_trip_v2(
    assigned_days: list[AssignedDay],
    city: str,
    constraints: TravelConstraints,
    depot_poi: Poi,
    candidate_pool: list[Any],
    transit_matrix_fn: Callable[[list[dict[str, Any]], str], list[list[Any]]],
    max_nodes_expanded: int = 50000,
) -> list[DaySolveResult]:
    """Solves all trip days with dynamic slack redistribution across consecutive days."""
    results: list[DaySolveResult] = []
    for i, day in enumerate(assigned_days):
        day_res = await solve_day_v2(
            assigned_day=day,
            city=city,
            constraints=constraints,
            depot_poi=depot_poi,
            candidate_pool=candidate_pool,
            transit_matrix_fn=transit_matrix_fn,
            max_nodes_expanded=max_nodes_expanded,
        )
        results.append(day_res)

        # Dynamic slack redistribution to subsequent days
        if i < len(assigned_days) - 1 and day_res.unspent_budget_eur > 5.0:
            redistribute_budget_slack(
                day_res.unspent_budget_eur, assigned_days[i + 1 :]
            )

    return results
