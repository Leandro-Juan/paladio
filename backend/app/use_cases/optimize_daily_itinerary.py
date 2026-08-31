import copy
import logging
from typing import Any

from app.domain.entities.poi import Poi, TransitEdge
from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.schemas.itinerary import TravelConstraints
from datetime import datetime

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
            except Exception:
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

        for day in range(num_days):
            day_pois = daily_pois_data[day] if day < len(daily_pois_data) else []
            result = await self._optimize_single_day(
                day,
                num_days,
                day_pois,
                local_constraints,
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

        return {"days": multi_day_itinerary}

    async def _optimize_single_day(
        self,
        day: int,
        num_days: int,
        unvisited_pois: list,
        constraints: TravelConstraints,
        city: str,
        hotel_arrival_time: int,
        hotel_departure_time: int,
        mandatory_names: list,
    ) -> dict[str, Any]:
        selected_hotel = next(
            (p for p in unvisited_pois if p.get("category") == "HOTEL"), None
        )
        selected_airport = next(
            (p for p in unvisited_pois if p.get("category") == "AIRPORT"), None
        )

        day_pois = [
            p
            for p in unvisited_pois
            if p.get("category") not in ("HOTEL", "AIRPORT")
            or (selected_hotel and p is selected_hotel)
        ]

        if (
            len(day_pois) <= 1
            and day_pois
            and day_pois[0].get("category") in ("HOTEL", "AIRPORT")
        ):
            return None

        matrix_dict = await get_transit_matrix(day_pois, city)
        matrix_dict = inject_slack_time(matrix_dict, 0.15)

        day_start_mins, day_end_mins = 480, 1320
        if day == 0:
            day_start_mins = max(480, hotel_arrival_time)
        if day == num_days - 1:
            day_end_mins = min(1320, hotel_departure_time)

        # Map raw Dicts to Domain Entities
        domain_pois = [Poi(**p) for p in day_pois]
        domain_matrix = [[TransitEdge(**edge) for edge in row] for row in matrix_dict]

        hotel_idx = next(
            (i for i, p in enumerate(day_pois) if p.get("category") == "HOTEL"), -1
        )
        start_idx = hotel_idx
        end_idx = hotel_idx

        import asyncio

        try:
            itinerary = await asyncio.to_thread(
                self.engine.run_optimization,
                constraints=constraints,
                pois=domain_pois,
                transit_matrix=domain_matrix,
                num_days=num_days,
                day_start_mins=day_start_mins,
                day_end_mins=day_end_mins,
                mandatory_names=mandatory_names,
                start_node_index=start_idx if start_idx != -1 else None,
                end_node_index=end_idx if end_idx != -1 else None,
            )
        except Exception as e:
            logger.error(f"C++ optimization engine failed: {e}")
            raise RuntimeError(f"C++ optimization engine failed: {e}")

        result = itinerary.model_dump()

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

        if day == num_days - 1 and selected_airport:
            if result["path"]:
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

        return result
