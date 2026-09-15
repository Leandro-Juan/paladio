import copy
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from app.domain.entities.poi import Poi
from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.schemas.itinerary import TravelConstraints

logger = logging.getLogger(__name__)

HOTEL_CHECKIN_BUFFER_MINS = 45
HOTEL_ARRIVAL_REST_MINS = 60
AIRPORT_TRANSIT_TO_HOTEL_MINS = 20
DEPARTURE_CHECKIN_MINS = 120
HOTEL_TRANSIT_TO_AIRPORT_MINS = 60


class OptimizeDailyItineraryUseCase:
    """
    Use Case responsible for orchestrating the C++ optimization engine over a multi-day trip.
    Abstracts the complex budget math and day-by-day looping logic away from LangGraph.
    """

    def __init__(self, engine: IOptimizationEngine):
        self.engine = engine

    async def execute(
        self,
        constraints: TravelConstraints,
        daily_pois_data: list[list[dict]],
        outbound_flight: dict,
        return_flight: dict,
    ) -> dict[str, Any]:
        city = constraints.destination_city
        mandatory_names = (
            [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
        )

        num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
        multi_day_itinerary = []

        flight_cost = 0.0
        arrival_time = "08:00"
        departure_time = "22:00"

        if outbound_flight and return_flight:
            arrival_time = outbound_flight.get("arrival_time", "08:00")
            departure_time = return_flight.get("departure_time", "22:00")

        local_constraints = copy.deepcopy(constraints)
        local_constraints.budget_usd = max(0.0, constraints.budget_usd - flight_cost)

        def parse_hm(t_str):
            try:
                if "T" in t_str:
                    dt = datetime.fromisoformat(t_str.replace("Z", "+00:00"))
                    return dt.hour, dt.minute
                elif " " in t_str:
                    tp = t_str.split(" ")[1]
                    parts = tp.split(":")
                    return int(parts[0]), int(parts[1])
                else:
                    parts = t_str.split(":")
                    return int(parts[0]), int(parts[1])
            except (ValueError, TypeError, IndexError, AttributeError):
                logger.warning(f"Failed to parse time {t_str}, defaulting to 08:00")
                return 8, 0

        arr_h, arr_m = parse_hm(arrival_time)
        arrival_mins = arr_h * 60 + arr_m
        dep_h, dep_m = parse_hm(departure_time)
        departure_mins = dep_h * 60 + dep_m

        hotel_arrival_time = (
            arrival_mins
            + HOTEL_CHECKIN_BUFFER_MINS
            + HOTEL_ARRIVAL_REST_MINS
            + AIRPORT_TRANSIT_TO_HOTEL_MINS
        )
        hotel_departure_time = (
            departure_mins - DEPARTURE_CHECKIN_MINS - HOTEL_TRANSIT_TO_AIRPORT_MINS
        )

        all_pois_flat = []
        poi_to_index = {}
        for day_list in daily_pois_data:
            for p in day_list:
                key = p.get("name", str(p))
                if key not in poi_to_index:
                    poi_to_index[key] = len(all_pois_flat)
                    all_pois_flat.append(p)

        departure_dt = None
        if constraints.start_date:
            departure_dt = f"{constraints.start_date.isoformat()}T09:00"

        global_matrix = []
        if all_pois_flat:
            global_matrix = await get_transit_matrix(
                all_pois_flat, city, departure_dt=departure_dt
            )
            global_matrix = inject_slack_time(global_matrix, 0.15)

        daily_budget = max(0.0, local_constraints.budget_usd / num_days)

        for day in range(num_days):
            day_pois = daily_pois_data[day] if day < len(daily_pois_data) else []

            day_matrix = []
            for p1 in day_pois:
                row = []
                idx1 = poi_to_index[p1.get("name", str(p1))]
                for p2 in day_pois:
                    idx2 = poi_to_index[p2.get("name", str(p2))]
                    row.append(
                        global_matrix[idx1][idx2]
                        if global_matrix
                        else {"duration_mins": 0, "cost_eur": 0, "mode": "none"}
                    )
                day_matrix.append(row)

            day_constraints = copy.deepcopy(local_constraints)
            day_constraints.budget_usd = daily_budget

            result = await self._optimize_single_day(
                day,
                num_days,
                day_pois,
                day_matrix,
                day_constraints,
                city,
                hotel_arrival_time,
                hotel_departure_time,
                mandatory_names,
            )

            if not result:
                break

            daily_flight = (
                outbound_flight
                if day == 0
                else (return_flight if day == num_days - 1 else None)
            )
            multi_day_itinerary.append(
                {"day": day + 1, "flight_info": daily_flight, "itinerary": result}
            )

            visited_names = {p["poi"]["name"] for p in result["path"]}

            # Remove visited mandatory POIs for subsequent days
            mandatory_names = [
                m
                for m in mandatory_names
                if not any(m in vn.lower() for vn in visited_names)
            ]

        total_trip_cost = 0.0
        for day_dict in multi_day_itinerary:
            itin = day_dict.get("itinerary", {})
            if isinstance(itin, dict):
                total_trip_cost += float(itin.get("total_cost_eur", 0.0))
            elif hasattr(itin, "total_cost_eur"):
                total_trip_cost += float(itin.total_cost_eur)

        return {
            "metadata": {
                "engine": "paladio_core_cpp20",
                "version": "2.0.0",
                "nodes_evaluated": sum(
                    len(d.get("itinerary", {}).get("path", []))
                    for d in multi_day_itinerary
                ),
            },
            "travel_constraints": constraints.model_dump(mode="json"),
            "days": multi_day_itinerary,
            "total_trip_cost": round(total_trip_cost, 2),
        }

    async def _optimize_single_day(
        self,
        day: int,
        num_days: int,
        unvisited_pois: list,
        matrix_dict_full: list,
        constraints: TravelConstraints,
        city: str,
        hotel_arrival_time: int,
        hotel_departure_time: int,
        mandatory_names: list,
    ) -> dict[str, Any]:
        if (
            len(unvisited_pois) <= 1
            and unvisited_pois
            and unvisited_pois[0].get("category") in ("HOTEL", "AIRPORT")
        ):
            return None

        selected_hotel = next(
            (p for p in unvisited_pois if p.get("category") == "HOTEL"), None
        )
        selected_airport = next(
            (p for p in unvisited_pois if p.get("category") == "AIRPORT"), None
        )

        day_pois = []
        matrix_dict = []

        for i, p in enumerate(unvisited_pois):
            if p.get("category") not in ("HOTEL", "AIRPORT") or (
                selected_hotel and p is selected_hotel
            ):
                day_pois.append(p)

        for i, p1 in enumerate(unvisited_pois):
            if p1.get("category") not in ("HOTEL", "AIRPORT") or (
                selected_hotel and p1 is selected_hotel
            ):
                row = []
                for j, p2 in enumerate(unvisited_pois):
                    if p2.get("category") not in ("HOTEL", "AIRPORT") or (
                        selected_hotel and p2 is selected_hotel
                    ):
                        row.append(matrix_dict_full[i][j])
                matrix_dict.append(row)

        if (
            len(day_pois) <= 1
            and day_pois
            and day_pois[0].get("category") in ("HOTEL", "AIRPORT")
        ):
            return None

        day_start_mins, day_end_mins = 480, 1320
        if day == 0:
            day_start_mins = max(480, hotel_arrival_time)
        if day == num_days - 1:
            day_end_mins = min(1320, hotel_departure_time)

        hotel_idx = next(
            (i for i, p in enumerate(day_pois) if p.get("category") == "HOTEL"), -1
        )
        start_idx = hotel_idx
        end_idx = hotel_idx

        if day_start_mins >= day_end_mins:
            logger.info(
                f"Day {day + 1} late arrival ({day_start_mins} >= {day_end_mins}). Setting check-in arrival only."
            )
            hotel_poi = (
                day_pois[hotel_idx]
                if hotel_idx != -1
                else (day_pois[0] if day_pois else None)
            )
            path_details = []
            if hotel_poi:
                sh, sm = day_start_mins // 60, day_start_mins % 60
                path_details.append(
                    {
                        "poi": hotel_poi,
                        "scheduled_start": f"{sh:02d}:{sm:02d}",
                        "scheduled_end": f"{sh:02d}:{sm:02d}",
                    }
                )
            result = {
                "total_score": 0.0,
                "total_cost_eur": 0.0,
                "total_time_mins": 0,
                "path": path_details,
            }
        else:
            # Map raw Dicts to Domain Entities
            domain_pois = [Poi(**p) for p in day_pois]

            try:
                itinerary = await self.engine.run_optimization(
                    constraints=constraints,
                    pois=domain_pois,
                    transit_matrix=matrix_dict,
                    num_days=num_days,
                    day_start_mins=day_start_mins,
                    day_end_mins=day_end_mins,
                    mandatory_names=mandatory_names,
                    start_node_index=start_idx if start_idx != -1 else None,
                    end_node_index=end_idx if end_idx != -1 else None,
                )
            except (RuntimeError, ValueError, TypeError) as e:
                logger.error(f"C++ optimization engine failed: {e}")
                raise RuntimeError(f"C++ optimization engine failed: {e}") from e

            result = itinerary.model_dump()

        if "total_time_mins" not in result and "total_time" in result:
            result["total_time_mins"] = int(result["total_time"])
        if "total_cost_eur" not in result and "total_cost" in result:
            result["total_cost_eur"] = float(result["total_cost"])

        if day == 0 and selected_airport:
            arr_mins = hotel_arrival_time - 105
            result["path"].insert(
                0,
                {
                    "poi": selected_airport,
                    "scheduled_start": f"{arr_mins // 60:02d}:{arr_mins % 60:02d}",
                    "scheduled_end": f"{(arr_mins + 60) // 60:02d}:{(arr_mins + 60) % 60:02d}",
                },
            )
            # Account for arrival airport dwell time (60 mins) and cost
            result["total_time_mins"] = result.get("total_time_mins", 0) + 60
            airport_cost = float(selected_airport.get("cost_eur", 0.0) or 0.0)
            result["total_cost_eur"] = result.get("total_cost_eur", 0.0) + airport_cost

        if day == num_days - 1 and selected_airport and result["path"]:
            last_end = result["path"][-1]["scheduled_end"]
            lh, lm = map(int, last_end.split(":"))
            start_mins = lh * 60 + lm + 45
            result["path"].append(
                {
                    "poi": selected_airport,
                    "scheduled_start": f"{start_mins // 60:02d}:{start_mins % 60:02d}",
                    "scheduled_end": f"{(start_mins + 120) // 60:02d}:{(start_mins + 120) % 60:02d}",
                }
            )
            # Account for departure airport dwell time (120 mins) and cost
            result["total_time_mins"] = result.get("total_time_mins", 0) + 120
            airport_cost = float(selected_airport.get("cost_eur", 0.0) or 0.0)
            result["total_cost_eur"] = result.get("total_cost_eur", 0.0) + airport_cost

        # Enrich each step in path with detailed public transit instructions from the previous POI
        from app.services.transit_service import (
            TransitRoutingError,
            get_detailed_transit_leg,
        )

        path_items = result.get("path", [])
        for k in range(1, len(path_items)):
            prev_poi = path_items[k - 1].get("poi", {})
            curr_poi = path_items[k].get("poi", {})
            scheduled_start = path_items[k].get("scheduled_start", "09:00")
            day_offset = timedelta(days=day)
            day_date = (
                constraints.start_date + day_offset
                if constraints.start_date
                else datetime.now(timezone.utc).date()
            )
            dep_iso = f"{day_date.isoformat()}T{scheduled_start}"

            is_airport_leg = (day == 0 and k == 1 and selected_airport) or (
                day == num_days - 1 and k == len(path_items) - 1 and selected_airport
            )

            leg_dur = 45 if is_airport_leg else 0
            leg_cost = 0.0

            try:
                transit_leg = await get_detailed_transit_leg(
                    origin=prev_poi,
                    destination=curr_poi,
                    departure_iso=dep_iso,
                )
                path_items[k]["transit_from_previous"] = transit_leg.model_dump()
                if is_airport_leg:
                    leg_dur = (
                        transit_leg.duration_mins if transit_leg.duration_mins else 45
                    )
                    leg_cost = float(transit_leg.cost_eur or 0.0)
            except (TransitRoutingError, httpx.HTTPError, ValueError, KeyError) as e:
                logger.debug(f"Could not enrich transit leg: {e}")

            if is_airport_leg:
                result["total_time_mins"] = result.get("total_time_mins", 0) + leg_dur
                result["total_cost_eur"] = result.get("total_cost_eur", 0.0) + leg_cost

        if "total_time" in result:
            result["total_time"] = result["total_time_mins"]
        if "total_cost" in result:
            result["total_cost"] = result["total_cost_eur"]

        return result
