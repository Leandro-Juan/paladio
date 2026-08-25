import logging
import copy
from typing import Dict, Any, List
from app.schemas.itinerary import TravelConstraints
from app.domain.interfaces.optimization_engine import IOptimizationEngine
from app.domain.entities.poi import Poi, TransitEdge
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time

logger = logging.getLogger(__name__)

class OptimizeDailyItineraryUseCase:
    """
    Use Case responsible for orchestrating the C++ optimization engine over a multi-day trip.
    Abstracts the complex budget math and day-by-day looping logic away from LangGraph.
    """
    def __init__(self, engine: IOptimizationEngine):
        self.engine = engine

    async def execute(self, 
                      constraints: TravelConstraints, 
                      pois_data: List[Dict], 
                      outbound_flight: Dict, 
                      return_flight: Dict) -> Dict[str, Any]:
                      
        city = constraints.destination_city
        mandatory_names = [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
        
        num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
        unvisited_pois = list(pois_data)
        multi_day_itinerary = []
        
        flight_cost = outbound_flight["price"] + return_flight["price"]
        
        local_constraints = copy.deepcopy(constraints)
        local_constraints.budget_usd = max(0.0, constraints.budget_usd - flight_cost)
        
        arr_h, arr_m = map(int, outbound_flight["arrival_time"].split(":"))
        arrival_mins = arr_h * 60 + arr_m
        dep_h, dep_m = map(int, return_flight["departure_time"].split(":"))
        departure_mins = dep_h * 60 + dep_m
        
        hotel_departure_time = departure_mins - 120 - 45
        hotel_arrival_time = arrival_mins + 60 + 45

        for day in range(num_days):
            result = await self._optimize_single_day(
                day, num_days, unvisited_pois, local_constraints, city, 
                hotel_arrival_time, hotel_departure_time, mandatory_names
            )
            
            if not result:
                break
                
            daily_flight = outbound_flight if day == 0 else (return_flight if day == num_days - 1 else None)
            multi_day_itinerary.append({"day": day + 1, "flight_info": daily_flight, "itinerary": result})
            
            visited_names = {p["poi"]["name"] for p in result["path"]}
            unvisited_pois = [p for p in unvisited_pois if p["category"] in ("HOTEL", "AIRPORT") or p["name"] not in visited_names]
            
            # Remove visited mandatory POIs
            mandatory_names = [m for m in mandatory_names if not any(m in vn.lower() for vn in visited_names)]
        
        return {"days": multi_day_itinerary}

    async def _optimize_single_day(self, day: int, num_days: int, unvisited_pois: list, constraints: TravelConstraints, city: str, hotel_arrival_time: int, hotel_departure_time: int, mandatory_names: list) -> Dict[str, Any]:
        if len(unvisited_pois) <= 1 and unvisited_pois and unvisited_pois[0].get("category") == "HOTEL": 
            return None
            
        matrix_dict = await get_transit_matrix(unvisited_pois, city)
        matrix_dict = inject_slack_time(matrix_dict, 0.15)
        
        day_start_mins, day_end_mins = 480, 1320
        if day == 0: 
            day_start_mins = max(480, hotel_arrival_time)
        if day == num_days - 1: 
            day_end_mins = min(1320, hotel_departure_time)
            
        # Map raw Dicts to Domain Entities
        domain_pois = [Poi(**p) for p in unvisited_pois]
        domain_matrix = [[TransitEdge(**edge) for edge in row] for row in matrix_dict]

        hotel_idx = next((i for i, p in enumerate(unvisited_pois) if p.get("category") == "HOTEL"), -1)
        airport_idx = next((i for i, p in enumerate(unvisited_pois) if p.get("category") == "AIRPORT"), -1)
        
        start_idx = airport_idx if day == 0 else hotel_idx
        end_idx = airport_idx if day == num_days - 1 else hotel_idx
        
        import asyncio
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
            end_node_index=end_idx if end_idx != -1 else None
        )
        
        result = itinerary.model_dump()
        return result
