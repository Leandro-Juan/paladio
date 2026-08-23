import logging
from typing import Dict, Any, List
from app.schemas.itinerary import TravelConstraints
from app.services.poi_service import get_attractions_for_city
from app.services.travel_data_service import fetch_flight, fetch_hotels, fetch_restaurants

logger = logging.getLogger(__name__)

class FetchTravelContextUseCase:
    """
    Use Case responsible for fetching and formatting all travel context 
    (POIs, flights, hotels, restaurants). Extracts data fetching logic from LangGraph nodes.
    """
    async def execute(self, constraints: TravelConstraints, test_data: Dict[str, Any] = None) -> Dict[str, Any]:
        city = constraints.destination_city
        origin = constraints.origin_city
        mandatory_names = [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
        
        # 1. Fetch POIs
        if test_data and "pois" in test_data:
            db_pois = test_data["pois"]
        else:
            db_pois = await get_attractions_for_city(city, mandatory_names=mandatory_names)
            if mandatory_names:
                db_pois.sort(key=lambda p: 0 if any(mn in p.get("name", "").lower() for mn in mandatory_names) else 1)
            db_pois = db_pois[:15]
            
        # 2. Fetch Flights
        flights_data, return_flights_data = None, None
        if origin and origin.lower() != "unknown":
            flights_data = await fetch_flight(origin, city, constraints.start_date, test_data, "flights")
            return_flights_data = await fetch_flight(city, origin, constraints.end_date, test_data, "return_flights")
            
        if not flights_data or not return_flights_data:
            raise RuntimeError(f"Could not retrieve flights for {origin} to {city}.")
            
        outbound_flight = flights_data[0]
        return_flight = return_flights_data[0]
        
        # 3. Fetch Hotels and Restaurants
        hotels_data = await fetch_hotels(city, test_data)
        restaurants_data = await fetch_restaurants(city, test_data)
        
        # 4. Build combined POIs data
        base_lat, base_lon = 0.0, 0.0
        if db_pois and db_pois[0].get("location"):
            base_lat = db_pois[0]["location"]["latitude"]
            base_lon = db_pois[0]["location"]["longitude"]
        else:
            raise RuntimeError("No valid attraction location data found.")

        full_pois_data = []
        for h in hotels_data:
            lat, lon = h.get("location", {}).get("latitude", 0.0), h.get("location", {}).get("longitude", 0.0)
            dur = h.get("schedule", {}).get("recommended_duration_minutes", 60)
            cost = h.get("financials", {}).get("price_per_night", 0.0)
            full_pois_data.append({"name": h.get("name", "Unknown Hotel"), "category": "HOTEL", "cost_eur": cost, "duration_mins": dur, "lat": lat, "lon": lon})
            
        for p in db_pois:
            full_pois_data.append({"name": p.get("name", "Unknown"), "category": p.get("category", "ATTRACTION"), "cost_eur": p.get("financials", {}).get("estimated_cost", 0.0), "duration_mins": p.get("schedule", {}).get("recommended_duration_minutes", 60), "lat": p.get("location", {}).get("latitude", base_lat), "lon": p.get("location", {}).get("longitude", base_lon)})
            
        for r in restaurants_data:
            lat = r.get("location", {}).get("latitude", 0.0) if isinstance(r, dict) else 0.0
            lon = r.get("location", {}).get("longitude", 0.0) if isinstance(r, dict) else 0.0
            full_pois_data.append({"name": r.get("name", "Unknown"), "category": "RESTAURANT", "cost_eur": 20.0, "duration_mins": 60, "lat": lat, "lon": lon})
            
        return {
            "pois_data": full_pois_data,
            "outbound_flight": outbound_flight,
            "return_flight": return_flight
        }
