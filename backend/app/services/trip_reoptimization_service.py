from __future__ import annotations

import asyncio
import copy
import logging
from typing import Any

import numpy as np
from app.domain.entities.poi import Poi, PoiLocation
from app.infrastructure.engine.struct_mapper import flatten_transit_matrix
from app.services.routing_service import RoutingService
from app.services.transit_service import ensure_walking_legs_populated

logger = logging.getLogger(__name__)

try:
    import paladio_core
except ImportError:
    paladio_core = None


def _format_time_hh_mm(mins: int | float) -> str:
    mins_total = int(round(float(mins)))
    h = (mins_total // 60) % 24
    m = mins_total % 60
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
        target_day: int | None = None,
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
            day_num = int(day_obj.get("day") or (d_idx + 1))
            if target_day is not None and day_num != target_day:
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

            n_pois = len(poi_entities)
            if n_pois <= 1:
                continue

            def is_anchor(idx: int) -> bool:
                raw_item = poi_indices_map[idx]
                raw_p = raw_item.get("poi") or {}
                # Explicit user lock overrides category defaults
                if raw_item.get("locked") is True or raw_p.get("locked") is True:
                    return True
                if raw_item.get("locked") is False or raw_p.get("locked") is False:
                    return False

                p = poi_entities[idx]
                cat = (p.category or "").upper()
                name = (p.name or "").lower()
                return cat in (
                    "HOTEL",
                    "AIRPORT",
                    "FLIGHT",
                    "ACCOMMODATION",
                    "LODGING",
                ) or any(k in name for k in ("hotel", "airport"))

            # Fetch live transit matrix between all POIs in the day
            matrix_pois = [
                {
                    "name": p.name,
                    "location": {
                        "latitude": p.location.latitude,
                        "longitude": p.location.longitude,
                    },
                }
                for p in poi_entities
            ]
            transit_matrix = await RoutingService.get_transit_matrix(
                pois=matrix_pois,
                city_name=city,
                plan_mode=plan_mode,
            )

            if not paladio_core or not hasattr(paladio_core, "solve_tsp_tour"):
                raise RuntimeError(
                    "paladio_core C++ engine is required for tour re-optimization"
                )

            durations, _ = flatten_transit_matrix(transit_matrix)

            # Build TSPTW arrays: dwell times, window starts, and window ends
            dwell_times = np.zeros(n_pois, dtype=np.int32)
            window_starts = np.zeros(n_pois, dtype=np.int32)
            window_ends = np.zeros(n_pois, dtype=np.int32)
            day_end_mins = 1440
            epsilon = 15  # Default +/- 15 min tolerance window for locked POIs

            for i in range(n_pois):
                raw_item = poi_indices_map[i]
                raw_p = raw_item.get("poi") or {}
                p_cat = str(raw_p.get("category") or "").upper()
                p_name = str(raw_p.get("name") or "").lower()
                is_anchor_node = p_cat in ("HOTEL", "AIRPORT", "FLIGHT") or any(
                    k in p_name for k in ("hotel", "airport")
                )

                if is_anchor_node:
                    dwell = (
                        int(raw_p.get("duration_mins") or 0)
                        if (i == 0 or i == n_pois - 1)
                        else int(raw_p.get("duration_mins") or 30)
                    )
                else:
                    dwell = max(15, int(raw_p.get("duration_mins") or 60))
                dwell_times[i] = dwell

                if i == 0:
                    window_starts[0] = day_start_mins
                    window_ends[0] = day_start_mins
                elif i == n_pois - 1 and is_anchor(i):
                    # Final depot of the day: can be reached anytime after visits conclude
                    window_starts[n_pois - 1] = day_start_mins
                    window_ends[n_pois - 1] = day_end_mins
                elif is_anchor(i):
                    sched_str = raw_item.get("scheduled_start")
                    target_time = (
                        _parse_time_to_minutes(sched_str)
                        if sched_str
                        else (day_start_mins + i * 90)
                    )
                    window_starts[i] = max(day_start_mins, target_time - epsilon)
                    window_ends[i] = min(day_end_mins, target_time + epsilon)
                else:
                    sched_str = raw_item.get("scheduled_start")
                    if sched_str:
                        target_time = _parse_time_to_minutes(sched_str)
                        window_starts[i] = max(day_start_mins, target_time - 120)
                        window_ends[i] = min(day_end_mins, target_time + 120)
                    else:
                        open_times = (
                            raw_p.get("open_time_mins_by_day") or [day_start_mins] * 7
                        )
                        close_times = (
                            raw_p.get("close_time_mins_by_day") or [day_end_mins] * 7
                        )
                        w_start = (
                            open_times[0]
                            if isinstance(open_times, list) and open_times
                            else day_start_mins
                        )
                        w_end = (
                            close_times[0]
                            if isinstance(close_times, list) and close_times
                            else day_end_mins
                        )
                        window_starts[i] = max(day_start_mins, int(w_start))
                        window_ends[i] = min(day_end_mins, int(w_end))

            start_node = 0
            fixed_end = is_anchor(n_pois - 1)
            end_node = (n_pois - 1) if fixed_end else -1

            if hasattr(paladio_core, "solve_tsptw"):
                real_indices = await asyncio.to_thread(
                    paladio_core.solve_tsptw,
                    durations,
                    n_pois,
                    dwell_times,
                    window_starts,
                    window_ends,
                    start_node,
                    end_node,
                    fixed_end,
                    100.0,
                )
            else:
                real_indices = await asyncio.to_thread(
                    paladio_core.solve_tsp_tour,
                    durations,
                    n_pois,
                    start_node,
                    end_node,
                    fixed_end,
                )

            # Reconstruct day path with clean sequential timestamps and transit legs
            new_path: list[dict[str, Any]] = []
            cur_clock = day_start_mins

            for step, node_idx in enumerate(real_indices):
                orig_item = poi_indices_map[node_idx]
                cloned_item = copy.deepcopy(orig_item)
                dur = int(dwell_times[node_idx])

                if step > 0:
                    prev_node_idx = real_indices[step - 1]
                    cell = transit_matrix[prev_node_idx][node_idx]
                    t_mins = int(round(float(cell.get("duration_mins", 15))))
                    t_cost = float(cell.get("cost_eur", 0.0))
                    t_dist = float(cell.get("distance_meters", 1000))

                    reach_time = cur_clock + int(t_mins)
                    w_start = int(window_starts[node_idx])
                    cur_clock = max(reach_time, w_start)

                    cloned_item["transit_from_previous"] = {
                        "mode": "walk" if t_mins <= 20 else "transit",
                        "duration_mins": t_mins,
                        "cost_eur": t_cost,
                        "distance_meters": t_dist,
                    }

                cloned_item["scheduled_start"] = _format_time_hh_mm(cur_clock)
                cur_clock += dur
                cloned_item["scheduled_end"] = _format_time_hh_mm(cur_clock)
                new_path.append(cloned_item)

            day_itin["path"] = new_path

        # Enrich walking legs turn-by-turn with geometries
        try:
            itinerary = await ensure_walking_legs_populated(
                itinerary, city=city, target_day=target_day
            )
        except Exception as e:
            logger.warning(
                f"Could not populate walking legs after re-optimization: {e}"
            )

        return itinerary
