import copy
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from app.domain.entities.poi import Poi
from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.schemas.itinerary import TravelConstraints
from sqlalchemy.exc import SQLAlchemyError

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
        if city:
            try:
                from app.tasks import async_trigger_city_gtfs_download_if_needed

                await async_trigger_city_gtfs_download_if_needed(city_name=city)
            except (SQLAlchemyError, OSError, RuntimeError) as e:
                logger.warning(
                    f"Could not auto-trigger GTFS download during itinerary optimization for {city}: {e}"
                )

        mandatory_names = (
            [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
        )

        num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
        multi_day_itinerary = []

        flight_cost = 0.0
        arrival_time = None
        departure_time = None

        if outbound_flight:
            arrival_time = outbound_flight.get("arrival_time")
            if not arrival_time:
                dep_t = outbound_flight.get("departure_time")
                dur = outbound_flight.get("flight_duration_minutes") or 120
                if dep_t:
                    from app.utils.timezone_utils import (
                        calculate_timezone_aware_arrival,
                    )

                    arrival_time = calculate_timezone_aware_arrival(
                        dep_t,
                        dur,
                        outbound_flight.get("origin_iata"),
                        outbound_flight.get("destination_iata"),
                    )
                    outbound_flight["arrival_time"] = arrival_time
            if not outbound_flight.get("direction"):
                outbound_flight["direction"] = "arrival"

        if return_flight:
            departure_time = return_flight.get("departure_time")
            if not return_flight.get("arrival_time"):
                dur = return_flight.get("flight_duration_minutes") or 120
                if departure_time:
                    from app.utils.timezone_utils import (
                        calculate_timezone_aware_arrival,
                    )

                    return_flight["arrival_time"] = calculate_timezone_aware_arrival(
                        departure_time,
                        dur,
                        return_flight.get("origin_iata"),
                        return_flight.get("destination_iata"),
                    )
            if not return_flight.get("direction"):
                return_flight["direction"] = "departure"

        if not arrival_time:
            arrival_time = "12:00"
        if not departure_time:
            departure_time = "18:00"

        local_constraints = copy.deepcopy(constraints)
        local_constraints.budget_usd = max(0.0, constraints.budget_usd - flight_cost)

        def parse_hm(t_str):
            try:
                if not t_str:
                    return 12, 0
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
                logger.warning(f"Failed to parse time {t_str}, defaulting to 12:00")
                return 12, 0

        arr_h, arr_m = parse_hm(arrival_time)
        arrival_mins = arr_h * 60 + arr_m
        dep_h, dep_m = parse_hm(departure_time)
        departure_mins = dep_h * 60 + dep_m

        if outbound_flight:
            AIRPORT_DEPLANING_BUFFER_MINS = 60
            hotel_arrival_time = (
                arrival_mins
                + AIRPORT_DEPLANING_BUFFER_MINS
                + AIRPORT_TRANSIT_TO_HOTEL_MINS
                + HOTEL_CHECKIN_BUFFER_MINS
                + HOTEL_ARRIVAL_REST_MINS
            )
        else:
            hotel_arrival_time = 480

        if return_flight:
            hotel_departure_time = (
                departure_mins - DEPARTURE_CHECKIN_MINS - HOTEL_TRANSIT_TO_AIRPORT_MINS
            )
        else:
            hotel_departure_time = 1320

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
                flight_arrival_mins=arrival_mins,
                flight_departure_mins=departure_mins,
            )

            if not result:
                result = {
                    "total_score": 0.0,
                    "total_cost_eur": 0.0,
                    "total_time_mins": 0,
                    "path": [],
                }

            daily_flight = None
            if day == 0 and outbound_flight:
                daily_flight = copy.deepcopy(outbound_flight)
                daily_flight["direction"] = "arrival"
            elif day == num_days - 1 and return_flight:
                daily_flight = copy.deepcopy(return_flight)
                daily_flight["direction"] = "departure"

            multi_day_itinerary.append(
                {
                    "day": day + 1,
                    "flight_info": daily_flight,
                    "inbound_flight": copy.deepcopy(outbound_flight)
                    if day == 0 and outbound_flight
                    else None,
                    "outbound_flight": copy.deepcopy(return_flight)
                    if day == num_days - 1 and return_flight
                    else None,
                    "itinerary": result,
                }
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
        flight_arrival_mins: int = 720,
        flight_departure_mins: int = 1080,
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

        # Determine exact day weekday (0 = Monday, ..., 6 = Sunday)
        day_offset = timedelta(days=day)
        current_date = (
            constraints.start_date + day_offset if constraints.start_date else None
        )
        day_weekday = current_date.weekday() if current_date else (day % 7)

        day_pois = []
        name_to_full_idx = {p.get("name"): idx for idx, p in enumerate(unvisited_pois)}

        for p in unvisited_pois:
            cat = p.get("category")
            if cat in ("HOTEL", "AIRPORT"):
                if selected_hotel and p is selected_hotel:
                    day_pois.append(p)
                continue

            # Pre-filter closed POIs for day_weekday (e.g. museums closed on Mondays/Tuesdays)
            open_vec = p.get("open_time_mins_by_day")
            if open_vec and len(open_vec) == 7 and open_vec[day_weekday] == -1:
                logger.info(
                    f"POI '{p.get('name')}' is closed on weekday {day_weekday}. Excluding from Day {day + 1}."
                )
                continue

            day_pois.append(p)

        matrix_dict = []
        for p1 in day_pois:
            row = []
            idx1 = name_to_full_idx[p1.get("name")]
            for p2 in day_pois:
                idx2 = name_to_full_idx[p2.get("name")]
                row.append(matrix_dict_full[idx1][idx2])
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
                    day_weekday=day_weekday,
                )
            except (RuntimeError, ValueError, TypeError) as e:
                logger.error(f"C++ optimization engine failed: {e}")
                raise RuntimeError(f"C++ optimization engine failed: {e}") from e

            result = itinerary.model_dump(mode="json")

        if "total_time_mins" not in result and "total_time" in result:
            result["total_time_mins"] = int(result["total_time"])
        if "total_cost_eur" not in result and "total_cost" in result:
            result["total_cost_eur"] = float(result["total_cost"])

        if day == 0 and selected_airport:
            arr_mins = flight_arrival_mins
            airport_node = {
                "poi": selected_airport,
                "scheduled_start": f"{arr_mins // 60:02d}:{arr_mins % 60:02d}",
                "scheduled_end": f"{(arr_mins + 60) // 60:02d}:{(arr_mins + 60) % 60:02d}",
            }
            if not result.get("path"):
                result["path"] = [airport_node]
                if selected_hotel:
                    ch_h, ch_m = hotel_arrival_time // 60, hotel_arrival_time % 60
                    result["path"].append(
                        {
                            "poi": selected_hotel,
                            "scheduled_start": f"{ch_h:02d}:{ch_m:02d}",
                            "scheduled_end": f"{ch_h:02d}:{ch_m:02d}",
                        }
                    )
            else:
                result["path"].insert(0, airport_node)

            # Account for arrival airport dwell time (60 mins) and cost
            result["total_time_mins"] = result.get("total_time_mins", 0) + 60
            airport_cost = float(selected_airport.get("cost_eur", 0.0) or 0.0)
            result["total_cost_eur"] = result.get("total_cost_eur", 0.0) + airport_cost

        if day == num_days - 1 and selected_airport:
            airport_arr = max(0, flight_departure_mins - 120)
            airport_dep = flight_departure_mins
            if not result.get("path"):
                if selected_hotel:
                    dep_h, dep_m = hotel_departure_time // 60, hotel_departure_time % 60
                    result["path"] = [
                        {
                            "poi": selected_hotel,
                            "scheduled_start": f"{dep_h:02d}:{dep_m:02d}",
                            "scheduled_end": f"{dep_h:02d}:{dep_m:02d}",
                        }
                    ]
                else:
                    result["path"] = []
                result["path"].append(
                    {
                        "poi": selected_airport,
                        "scheduled_start": f"{airport_arr // 60:02d}:{airport_arr % 60:02d}",
                        "scheduled_end": f"{airport_dep // 60:02d}:{airport_dep % 60:02d}",
                    }
                )
            else:
                last_end = result["path"][-1]["scheduled_end"]
                lh, lm = map(int, last_end.split(":"))
                last_end_mins = lh * 60 + lm
                start_mins = min(
                    max(last_end_mins + 45, airport_arr), max(0, airport_dep - 30)
                )
                end_mins = max(start_mins + 15, airport_dep)
                result["path"].append(
                    {
                        "poi": selected_airport,
                        "scheduled_start": f"{start_mins // 60:02d}:{start_mins % 60:02d}",
                        "scheduled_end": f"{end_mins // 60:02d}:{end_mins % 60:02d}",
                    }
                )
            # Account for departure airport dwell time (120 mins) and cost
            dwell_mins = max(30, airport_dep - airport_arr)
            result["total_time_mins"] = result.get("total_time_mins", 0) + dwell_mins
            airport_cost = float(selected_airport.get("cost_eur", 0.0) or 0.0)
            result["total_cost_eur"] = result.get("total_cost_eur", 0.0) + airport_cost

        # Enrich each step in path with detailed public transit instructions from the previous POI
        from app.services.transit_fare_service import TransitFareService
        from app.services.transit_service import (
            TransitRoutingError,
            get_detailed_transit_leg,
            synthesize_fallback_transit_leg,
        )

        path_items = result.get("path", [])
        transit_leg_costs: list[float] = []
        has_airport_transit = False

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
                if isinstance(prev_poi, dict) and "city" not in prev_poi and city:
                    prev_poi["city"] = city
                if isinstance(curr_poi, dict) and "city" not in curr_poi and city:
                    curr_poi["city"] = city

                transit_leg = await get_detailed_transit_leg(
                    origin=prev_poi,
                    destination=curr_poi,
                    departure_iso=dep_iso,
                    is_airport_leg=is_airport_leg,
                )
                path_items[k]["transit_from_previous"] = transit_leg.model_dump(
                    mode="json"
                )
                if transit_leg.cost_eur > 0:
                    transit_leg_costs.append(transit_leg.cost_eur)
                if is_airport_leg or transit_leg.airport_surcharge_eur > 0:
                    has_airport_transit = True
                for step in transit_leg.steps:
                    st_text = f"{step.station_name or ''} {step.instruction or ''} {step.headsign or ''}".lower()
                    if TransitFareService.is_airport_station(st_text, []):
                        has_airport_transit = True

                if is_airport_leg:
                    leg_dur = (
                        transit_leg.duration_mins if transit_leg.duration_mins else 45
                    )
                    leg_cost = float(transit_leg.cost_eur or 0.0)
            except (
                TransitRoutingError,
                httpx.HTTPError,
                ValueError,
                KeyError,
                OSError,
                RuntimeError,
            ) as e:
                logger.debug(
                    f"Could not enrich transit leg from Valhalla: {e}. Using resilient fallback."
                )
                try:
                    transit_leg = synthesize_fallback_transit_leg(
                        origin=prev_poi,
                        destination=curr_poi,
                        city=city,
                        is_airport_leg=is_airport_leg,
                    )
                except (
                    ValueError,
                    KeyError,
                    TypeError,
                    OSError,
                    RuntimeError,
                ) as synth_err:
                    logger.warning(
                        f"Synthesize fallback failed ({synth_err}). Using estimated transit leg."
                    )
                    from app.domain.entities.poi import TransitLeg, TransitStep

                    transit_leg = TransitLeg(
                        duration_mins=45 if is_airport_leg else 20,
                        cost_eur=5.0 if is_airport_leg else 2.0,
                        cost_is_estimated=True,
                        price_source="fallback_estimate",
                        mode="transit",
                        steps=[
                            TransitStep(
                                type="transit",
                                instruction=f"Public transit to {curr_poi.get('name', 'destination')}",
                                duration_mins=45 if is_airport_leg else 20,
                            )
                        ],
                        airport_surcharge_eur=3.0 if is_airport_leg else 0.0,
                    )
                path_items[k]["transit_from_previous"] = transit_leg.model_dump(
                    mode="json"
                )
                if transit_leg.cost_eur > 0:
                    transit_leg_costs.append(transit_leg.cost_eur)
                if is_airport_leg or transit_leg.airport_surcharge_eur > 0:
                    has_airport_transit = True
                if is_airport_leg:
                    leg_dur = (
                        transit_leg.duration_mins if transit_leg.duration_mins else 45
                    )
                    leg_cost = float(transit_leg.cost_eur or 0.0)

            if is_airport_leg:
                result["total_time_mins"] = result.get("total_time_mins", 0) + leg_dur
                result["total_cost_eur"] = result.get("total_cost_eur", 0.0) + leg_cost

        # Evaluate 24-hour tourist pass savings advisory
        transit_rec = TransitFareService.evaluate_daily_transit_savings(
            city=city,
            leg_costs=transit_leg_costs,
            has_airport_leg=has_airport_transit,
        )
        result["transit_recommendation"] = transit_rec.model_dump(mode="json")

        if "total_time" in result:
            result["total_time"] = result["total_time_mins"]
        if "total_cost" in result:
            result["total_cost"] = result["total_cost_eur"]

        return result
