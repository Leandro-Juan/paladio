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
            
        # 2. Fetch Flights
        flights_data, return_flights_data = None, None
        if origin and origin.lower() != "unknown":
            flights_data = await fetch_flight(origin, city, constraints.start_date, test_data, "flights")
            return_flights_data = await fetch_flight(city, origin, constraints.end_date, test_data, "return_flights")
            
        if not flights_data or not return_flights_data:
            raise RuntimeError(f"Could not retrieve flights for {origin} to {city}.")
            
        outbound_flight = flights_data[0]
        outbound_flight["arrival_time"] = "08:00"
        return_flight = return_flights_data[0]
        return_flight["departure_time"] = "22:00"
        
        # 3. Fetch Hotels and Restaurants
        hotels_data = await fetch_hotels(city, test_data)
        restaurants_data = await fetch_restaurants(city, test_data)
        
        # Determine city center from db_pois for snapping
        center_lat, center_lon = 40.4168, -3.7038 # default madrid
        if db_pois and db_pois[0].get("location"):
            center_lat = db_pois[0]["location"].get("latitude", center_lat)
            center_lon = db_pois[0]["location"].get("longitude", center_lon)
            
        hotel_lat, hotel_lon = center_lat + 0.005, center_lon + 0.005 # offset by ~500m

        # Apply Spatial-Affinity Clustering to filter POIs
        from app.engine.cluster_selector import ClusterSelector
        selector = ClusterSelector(max_pois=30) # leave room for hotels/restaurants (max 64)
        filtered_db_pois = selector.select_best_pois(db_pois, hotel_lat, hotel_lon, mandatory_names)
        
        # 4. Build combined POIs data
        full_pois_data = []
        for i, h in enumerate(hotels_data):
            dur = h.get("schedule", {}).get("recommended_duration_minutes", 60)
            cost = h.get("financials", {}).get("price_per_night", 0.0)
            full_pois_data.append({
                "name": h.get("name", f"Hotel {i}"), 
                "city": city, 
                "category": "HOTEL", 
                "cost_eur": cost, 
                "duration_mins": dur, 
                "location": {"latitude": hotel_lat, "longitude": hotel_lon},
                "schedule": h.get("schedule", {}),
                "financials": h.get("financials", {})
            })
            
        for p in filtered_db_pois:
            raw_cost = p.get("financials", {}).get("estimated_cost", 0.0)
            cost = float(raw_cost) if raw_cost is not None else 0.0
            p_lat = p.get("location", {}).get("latitude", hotel_lat)
            p_lon = p.get("location", {}).get("longitude", hotel_lon)
            full_pois_data.append({
                "name": p.get("name", "Unknown"), 
                "city": city, 
                "category": p.get("category", "ATTRACTION"), 
                "cost_eur": cost, 
                "duration_mins": p.get("schedule", {}).get("recommended_duration_minutes", 60), 
                "location": {"latitude": p_lat, "longitude": p_lon},
                "schedule": p.get("schedule", {}),
                "financials": p.get("financials", {}),
                "scoring": p.get("scoring") or {"google_rating": 4.5, "reviews": 100}
            })
            
        airport_lat, airport_lon = center_lat + 0.1, center_lon + 0.1
        
        full_pois_data.append({
            "name": f"{city.title()} International Airport",
            "city": city,
            "category": "AIRPORT",
            "cost_eur": 0.0,
            "duration_mins": 120,
            "location": {"latitude": airport_lat, "longitude": airport_lon},
            "schedule": {"open_time_mins": 0, "close_time_mins": 1440},
            "financials": {},
            "scoring": {"google_rating": 4.5, "reviews": 500}
        })
        
        for i, r in enumerate(restaurants_data):
            # Scatter restaurants around the center (0.01 = ~1km)
            r_lat = center_lat + 0.01 * (i % 2 == 0) - 0.005
            r_lon = center_lon + 0.01 * (i % 3 == 0) - 0.005
            
            sched = r.get("schedule") or {"open_time_mins": 480, "close_time_mins": 1320}
            fin = r.get("financials") or {"estimated_cost": 20.0}
            scoring = r.get("scoring") or {"google_rating": 4.2, "reviews": 150}
            
            full_pois_data.append({
                "name": r.get("name", f"Restaurant {i}"), 
                "city": city, 
                "category": "RESTAURANT", 
                "cost_eur": 20.0, 
                "duration_mins": 60, 
                "location": {"latitude": r_lat, "longitude": r_lon},
                "schedule": sched,
                "financials": fin,
                "scoring": scoring
            })
            
        return {
            "pois_data": full_pois_data,
            "outbound_flight": outbound_flight,
            "return_flight": return_flight
        }
