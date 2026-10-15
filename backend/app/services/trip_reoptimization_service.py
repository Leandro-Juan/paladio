from __future__ import annotations

import asyncio
import copy
import logging
from datetime import datetime, timezone
from typing import Any

from app.domain.entities.poi import Poi, PoiLocation, ScoredPoi
from app.infrastructure.engine.struct_mapper import (
    build_cpp_pois,
    build_optimization_config,
    flatten_transit_matrix,
)
from app.schemas.itinerary import TravelConstraints
from app.services.routing_service import RoutingService
from app.services.transit_service import ensure_walking_legs_populated

logger = logging.getLogger(__name__)

try:
    import paladio_core
except ImportError:
    paladio_core = None


def _format_time_hh_mm(mins: int) -> str:
    h = (mins // 60) % 24
    m = mins % 60
    return f"{h:02d}:{m:02d}"


def _parse_time_to_minutes(time_str: str) -> int:
    try:
        parts = time_str.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return 540  # 09:00 default


class TripReoptimizationService:
    """
    Agency-grade trip route re-optimization service powered by C++20 paladio_core.
    Takes user-edited or newly dragged POIs across trip days, computes live transit
    matrices, and invokes the deterministic TSPTW engine to recalculate optimal
    sequences and schedules.
    """

    @classmethod
    async def reoptimize_trip_itinerary(
        cls,
        itinerary_data: dict[str, Any],
        destination_city: str,
        plan_mode: str = "estimated",
    ) -> dict[str, Any]:
        if not isinstance(itinerary_data, dict):
            raise ValueError("itinerary_data must be a dictionary")

        if not destination_city:
            raise ValueError("destination_city must be specified for re-optimization")

        itinerary = copy.deepcopy(itinerary_data)
        days = itinerary.get("days", [])
        if not isinstance(days, list) or not days:
            return itinerary

        city = destination_city.strip()

        for d_idx, day_obj in enumerate(days):
            if not isinstance(day_obj, dict):
                continue
            day_itin = day_obj.get("itinerary", {})
            if not isinstance(day_itin, dict):
                continue
            path = day_itin.get("path", [])
            if not isinstance(path, list) or len(path) < 2:
                # 0 or 1 POI does not require TSPTW combinatorial re-ordering
                if len(path) == 1:
                    first_poi = path[0].get("poi") or {}
                    dur = int(first_poi.get("duration_mins") or 60)
                    start_mins = 540  # 09:00 default
                    path[0]["scheduled_start"] = _format_time_hh_mm(start_mins)
                    path[0]["scheduled_end"] = _format_time_hh_mm(start_mins + dur)
                continue

            day_date_str = day_obj.get("date")
            try:
                base_date = (
                    datetime.fromisoformat(day_date_str).date()
                    if day_date_str
                    else datetime.now(timezone.utc).date()
                )
            except ValueError:
                base_date = datetime.now(timezone.utc).date()
            day_weekday = base_date.weekday()

            # Determine day start time
            first_item = path[0]
            existing_start_str = first_item.get("scheduled_start", "09:00")
            day_start_mins = _parse_time_to_minutes(existing_start_str)

            # Build domain POI list from path items
            poi_entities: list[Poi] = []
            poi_indices_map: list[dict[str, Any]] = []

            for idx, item in enumerate(path):
                raw_p = item.get("poi") or {}
                loc = raw_p.get("location") or {}
                lat = float(loc.get("latitude", raw_p.get("lat", 0.0)) or 0.0)
                lon = float(loc.get("longitude", raw_p.get("lon", 0.0)) or 0.0)
                cat = (raw_p.get("category") or "ATTRACTION").upper()
                is_hotel = cat == "HOTEL" or "hotel" in raw_p.get("name", "").lower()

                dur = 1 if is_hotel else max(15, int(raw_p.get("duration_mins") or 60))
                cost = 0.0 if is_hotel else float(raw_p.get("cost_eur", 0.0) or 0.0)
                open_times = raw_p.get("open_time_mins_by_day") or (
                    [0] * 7 if is_hotel else [480] * 7
                )
                close_times = raw_p.get("close_time_mins_by_day") or (
                    [1440] * 7 if is_hotel else [1320] * 7
                )

                poi_entity = Poi(
                    id=str(raw_p.get("id") or f"poi_{d_idx}_{idx}"),
                    name=raw_p.get("name", f"Waypoint {idx + 1}"),
                    city=city,
                    category="HOTEL"
                    if is_hotel
                    else raw_p.get("category", "attraction"),
                    location=PoiLocation(latitude=lat, longitude=lon),
                    open_time_mins_by_day=open_times
                    if len(open_times) == 7
                    else [480] * 7,
                    close_time_mins_by_day=close_times
                    if len(close_times) == 7
                    else [1320] * 7,
                    duration_mins=dur,
                    cost_eur=cost,
                )
                poi_entities.append(poi_entity)
                poi_indices_map.append(item)

            # Check if there is an explicit hotel at index 0
            has_hotel_at_start = (
                poi_entities[0].category.upper() == "HOTEL"
                or "hotel" in poi_entities[0].name.lower()
            )

            # Setup POI matrix nodes
            if has_hotel_at_start:
                solve_entities = list(poi_entities)
                solve_items = list(poi_indices_map)
                start_node_index = 0
                end_node_index = 0
            else:
                # Add virtual depot at first POI location to enable open TSP tour
                depot_poi = Poi(
                    id=f"depot_start_d{d_idx}",
                    name="Depot Start",
                    city=city,
                    category="HOTEL",
                    location=poi_entities[0].location,
                    open_time_mins_by_day=[0] * 7,
                    close_time_mins_by_day=[1440] * 7,
                    duration_mins=1,
                    cost_eur=0.0,
                )
                end_depot_poi = Poi(
                    id=f"depot_end_d{d_idx}",
                    name="Depot End",
                    city=city,
                    category="HOTEL",
                    location=poi_entities[-1].location,
                    open_time_mins_by_day=[0] * 7,
                    close_time_mins_by_day=[1440] * 7,
                    duration_mins=1,
                    cost_eur=0.0,
                )
                solve_entities = [depot_poi] + poi_entities + [end_depot_poi]
                solve_items = [None] + poi_indices_map + [None]
                start_node_index = 0
                end_node_index = len(solve_entities) - 1

            # Fetch live transit matrix between nodes
            matrix_pois = [
                {
                    "name": p.name,
                    "location": {
                        "latitude": p.location.latitude,
                        "longitude": p.location.longitude,
                    },
                }
                for p in solve_entities
            ]
            transit_matrix = await RoutingService.get_transit_matrix(
                pois=matrix_pois,
                city_name=city,
                plan_mode=plan_mode,
            )

            if not has_hotel_at_start:
                # Cost and duration to end dummy depot are 0
                end_i = end_node_index
                for row in transit_matrix:
                    row[end_i]["duration_mins"] = 0
                    row[end_i]["cost_eur"] = 0.0

            # Execute C++ optimization if paladio_core is compiled
            if paladio_core:
                scored = [ScoredPoi(poi=p, score=1.0) for p in solve_entities]
                mandatory_names = [
                    p.name for p in solve_entities if p.category.upper() != "HOTEL"
                ]
                cpp_pois = build_cpp_pois(
                    scored,
                    day_start_mins=day_start_mins,
                    mandatory_names=mandatory_names,
                    day_weekday=day_weekday,
                )
                durations, costs = flatten_transit_matrix(transit_matrix)
                constraints = TravelConstraints(city=city, destination_city=city)
                config = build_optimization_config(
                    constraints=constraints,
                    day_start_mins=day_start_mins,
                    day_end_mins=1380,  # 23:00 end limit
                    start_node_index=start_node_index,
                    end_node_index=end_node_index,
                    cpp_pois=cpp_pois,
                    monotony_threshold=2,
                    monotony_multiplier=0.5,
                    max_nodes_expanded=50000,
                )

                try:
                    res = await asyncio.to_thread(
                        paladio_core.optimize_itinerary,
                        cpp_pois,
                        durations,
                        costs,
                        config,
                    )
                    solved_path = res.path
                    solved_arrival_times = getattr(res, "arrival_times", [])
                except Exception as e:
                    logger.warning(
                        f"paladio_core optimize_itinerary failed for day {d_idx + 1}: {e}. Retaining original sequence with smoothed timestamps."
                    )
                    solved_path = []
                    solved_arrival_times = []
            else:
                solved_path = []
                solved_arrival_times = []

            # Reconstruct day path
            new_path: list[dict[str, Any]] = []
            visited_indices: set[int] = set()

            if solved_path and len(solved_arrival_times) == len(solved_path):
                for node_idx, arr_m in zip(solved_path, solved_arrival_times):
                    # Filter out dummy depots if present
                    if not has_hotel_at_start and (
                        node_idx == 0 or node_idx == end_node_index
                    ):
                        continue
                    real_item = solve_items[node_idx]
                    if real_item is not None:
                        real_poi_entity = solve_entities[node_idx]
                        dur = (
                            0
                            if real_poi_entity.category.upper() == "HOTEL"
                            else int(real_poi_entity.duration_mins)
                        )
                        cloned_item = copy.deepcopy(real_item)
                        cloned_item["scheduled_start"] = _format_time_hh_mm(arr_m)
                        cloned_item["scheduled_end"] = _format_time_hh_mm(arr_m + dur)
                        new_path.append(cloned_item)
                        visited_indices.add(node_idx)

            # In case any POI was skipped by C++ solver due to strict deadlines, append it
            for idx, orig_item in enumerate(poi_indices_map):
                corr_idx = idx if has_hotel_at_start else idx + 1
                if corr_idx not in visited_indices:
                    cloned_item = copy.deepcopy(orig_item)
                    new_path.append(cloned_item)

            # Cascade and compute transit between sequential stops
            cur_clock = day_start_mins
            for k in range(len(new_path)):
                curr_item = new_path[k]
                poi_dict = curr_item.get("poi") or {}
                dur = int(poi_dict.get("duration_mins") or 60)

                if k > 0:
                    prev_item = new_path[k - 1]
                    prev_poi_dict = prev_item.get("poi") or {}
                    p_name = prev_poi_dict.get("name")
                    c_name = poi_dict.get("name")
                    p_idx = next(
                        (i for i, p in enumerate(solve_entities) if p.name == p_name), 0
                    )
                    c_idx = next(
                        (i for i, p in enumerate(solve_entities) if p.name == c_name), 0
                    )

                    t_mins = transit_matrix[p_idx][c_idx].get("duration_mins", 15)
                    t_cost = transit_matrix[p_idx][c_idx].get("cost_eur", 0.0)
                    t_dist = transit_matrix[p_idx][c_idx].get("distance_meters", 1000)

                    cur_clock += int(t_mins)
                    curr_item["transit_from_previous"] = {
                        "mode": "walk" if t_mins <= 20 else "transit",
                        "duration_mins": float(t_mins),
                        "cost_eur": float(t_cost),
                        "distance_meters": float(t_dist),
                    }

                # Set scheduled start / end
                curr_item["scheduled_start"] = _format_time_hh_mm(cur_clock)
                cur_clock += dur
                curr_item["scheduled_end"] = _format_time_hh_mm(cur_clock)

            day_itin["path"] = new_path

        # Enrich walking legs turn-by-turn with geometries
        try:
            itinerary = await ensure_walking_legs_populated(itinerary, city=city)
        except Exception as e:
            logger.warning(
                f"Could not populate walking legs after re-optimization: {e}"
            )

        return itinerary
