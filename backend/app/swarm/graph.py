import logging
from langgraph.graph import StateGraph, START, END
from app.swarm.state import SwarmState
from app.swarm.nodes.retriever import rag_node
from app.swarm.agents.validator import validator_node
from app.swarm.agents.router import router_node
from app.swarm.nodes.alert import alert_node
from app.engine.transit_matrix import get_transit_matrix, inject_slack_time
from app.engine.bridge import run_optimization
from app.services.poi_service import get_attractions_for_city
from app.scraper.dynamic_scraper import scrape_dynamic
from app.scraper.static_scraper import scrape_static
from app.scraper.duffel_scraper import DuffelScraper
from app.scraper.amadeus_scraper import AmadeusScraper
from app.scraper.http_scrapers import VuelingScraper, EasyJetScraper, SkyscannerScraper
import random
import urllib.parse
from datetime import datetime, timedelta

import httpx

async def get_airport_coordinates(city: str) -> tuple[float, float]:
    """Dynamically geocode the airport coordinates using Nominatim API."""
    try:
        query = f"airport in {city}"
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "json", "limit": 1}
        result = await scrape_static(url, params=params)
        data = result.get("data")
        if data and isinstance(data, list) and len(data) > 0:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            logger.info(f"Dynamically resolved {city} airport to {lat}, {lon}")
            return lat, lon
        else:
            logger.warning(f"Could not resolve airport for {city}. Falling back to city center.")
    except Exception as e:
        logger.error(f"Geocoding airport failed for {city}: {e}")
        
    raise RuntimeError(f"Could not resolve real airport coordinates for {city}. No mock data allowed.")

logger = logging.getLogger(__name__)

from langgraph.types import interrupt

async def check_missing_fields_node(state: SwarmState) -> dict:
    """
    Intelligently pause execution to ask the user for any missing vital information.
    """
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        return {}
        
    from app.schemas.itinerary import TravelConstraints
    constraints = TravelConstraints(**constraints_dict)
    
    changed = False
    
    if not constraints.origin_city or constraints.origin_city.lower() == "unknown":
        answer = interrupt("I couldn't detect your origin city. Where are you flying from?")
        constraints.origin_city = str(answer).strip()
        changed = True
        
    if not constraints.destination_city or constraints.destination_city.lower() == "unknown":
        answer = interrupt("I couldn't detect your destination. Where do you want to go?")
        constraints.destination_city = str(answer).strip()
        changed = True
        
    if not constraints.budget_usd or constraints.budget_usd <= 0:
        answer = interrupt("I couldn't detect your budget. What is your total budget for this trip?")
        try:
            num = float(''.join(c for c in str(answer) if c.isdigit() or c == '.'))
            constraints.budget_usd = num
            changed = True
        except:
            pass
            
    if not constraints.start_date:
        answer = interrupt("I couldn't detect your start date. When are you planning to start your trip? (e.g. 2026-08-25)")
        from datetime import datetime
        try:
            constraints.start_date = datetime.strptime(str(answer).strip(), "%Y-%m-%d").date()
            changed = True
        except:
            pass
            
    if not constraints.end_date:
        answer = interrupt("I couldn't detect your end date. When will your trip end? (e.g. 2026-08-30)")
        from datetime import datetime
        try:
            constraints.end_date = datetime.strptime(str(answer).strip(), "%Y-%m-%d").date()
            changed = True
        except:
            pass

    if changed:
        return {"validated_itinerary": constraints.model_dump(mode='json')}
    return {}

async def planner_node(state: SwarmState) -> dict:
    """
    Coordinates fetching POIs, getting transit matrix, and running the deterministic C++ engine.
    """
    logger.info("--- [PHASE: PLANNER] Running itinerary optimization engine ---")
    constraints_dict = state.get("validated_itinerary")
    if not constraints_dict:
        logger.error("No validated itinerary constraints found in state!")
        return {"error_count": state.get("error_count", 0) + 1}
        
    from app.schemas.itinerary import TravelConstraints
    constraints = TravelConstraints(**constraints_dict)
    
    city = constraints.destination_city
    print(f"\n[DEBUG] Fetching real POIs from PostgreSQL for {city}...")
    logger.info(f"Fetching real POIs from PostgreSQL for {city}...")
    
    test_data = state.get("test_data")
    
    # Extract mandatory POIs
    mandatory_names = [n.poi_id.lower() for n in constraints.nodes] if constraints.nodes else []
    
    # 1. Fetch static attractions from database (SWR cache) or test_data
    if test_data and "pois" in test_data:
        db_pois = test_data["pois"]
    else:
        db_pois = await get_attractions_for_city(city, mandatory_names=mandatory_names)
        
        # Sort so mandatory POIs are at the front before truncation
        if mandatory_names:
            db_pois.sort(key=lambda p: 0 if any(mn in p.get("name", "").lower() for mn in mandatory_names) else 1)
            
        # Sort or limit to avoid overloading local Valhalla (e.g. top 15 attractions)
        db_pois = db_pois[:15]
    
    print(f"[DEBUG] POIs fetched: {len(db_pois)}")
    
    # 2. Fetch dynamic hotels and restaurants
    logger.info(f"Triggering dynamic scrapers for Hotels and Restaurants in {city}...")
    hotel_url = f"https://www.booking.com/searchresults.html?ss={urllib.parse.quote(city)}"
    yelp_url = f"https://www.yelp.com/search?find_loc={urllib.parse.quote(city)}"
    
    hotels_data = []
    restaurants_data = []
    flights_data = []
    
    # Scrape flights using multiple strategies (API, HTTP, Dynamic)
    origin = constraints.origin_city
    
    # Helper for parsing flight objects safely
    def parse_flight(f):
        if isinstance(f, dict) and "financials" not in f:
            if "price" not in f or "arrival_time" not in f or "departure_time" not in f:
                return None
            return {
                "price": float(f["price"]),
                "arrival_time": f["arrival_time"],
                "departure_time": f["departure_time"]
            }
        price = f.get("financials", {}).get("price") if isinstance(f, dict) else getattr(getattr(f, "financials", None), "price", None)
        arr = f.get("schedule", {}).get("arrival_utc") if isinstance(f, dict) else getattr(getattr(f, "schedule", None), "arrival_utc", None)
        dep = f.get("schedule", {}).get("departure_utc") if isinstance(f, dict) else getattr(getattr(f, "schedule", None), "departure_utc", None)
        if price is None or not arr or not dep:
            return None
        arr_str = str(arr)
        dep_str = str(dep)
        return {
            "price": float(price),
            "arrival_time": arr_str[11:16] if 'T' in arr_str or ' ' in arr_str else arr_str[:5],
            "departure_time": dep_str[11:16] if 'T' in dep_str or ' ' in dep_str else dep_str[:5]
        }

    async def fetch_flight(org, dest, date_obj, fallback_key):
        if not org or org.lower() == "unknown": return None
        date_str = date_obj.strftime("%Y-%m-%d") if hasattr(date_obj, 'strftime') else str(date_obj)
        org_iata = org[:3].upper()
        dest_iata = dest[:3].upper()
        
        if test_data and fallback_key in test_data and test_data[fallback_key]:
            f = test_data[fallback_key][0]
            parsed = parse_flight(f)
            if parsed: return [parsed]

        # 1. Skyscanner
        try:
            skyscanner = SkyscannerScraper()
            res = await skyscanner.scrape_flights(org, dest, date_str)
            if res and parse_flight(res[0]): return [parse_flight(res[0])]
        except Exception: pass
        
        # 2. HTTP Vueling / EasyJet
        try:
            vueling = VuelingScraper()
            res = await vueling.scrape_flights(org, dest, date_str)
            if res and parse_flight(res[0]): return [parse_flight(res[0])]
        except Exception: pass
        
        try:
            easyjet = EasyJetScraper()
            res = await easyjet.scrape_flights(org, dest, date_str)
            if res and parse_flight(res[0]): return [parse_flight(res[0])]
        except Exception: pass
        
        # 3. Duffel API
        try:
            duffel = DuffelScraper()
            res = duffel.scrape_flights(org, dest, date_str)
            if res and parse_flight(res[0]): return [parse_flight(res[0])]
        except Exception: pass
        
        return None

    if origin and origin.lower() != "unknown":
        logger.info(f"Triggering outbound flight scraper from {origin} to {city}...")
        flights_data = await fetch_flight(origin, city, constraints.start_date, "flights")
        
        logger.info(f"Triggering return flight scraper from {city} to {origin}...")
        return_flights_data = await fetch_flight(city, origin, constraints.end_date, "return_flights")
    else:
        flights_data = None
        return_flights_data = None
    if not flights_data or not return_flights_data:
        raise RuntimeError(f"Could not retrieve both outbound and return flights for {origin} and {city}.")
        
    outbound_flight = flights_data[0]
    return_flight = return_flights_data[0]
    
    # Try API Scraper for Hotels first
    if test_data and "hotels" in test_data:
        hotels_data = test_data["hotels"][:2]
    else:
        try:
            amadeus = AmadeusScraper()
            amadeus_result = amadeus.scrape_hotels(city)
            if amadeus_result:
                hotels_data.extend(amadeus_result)
        except Exception as e:
            logger.warning(f"Amadeus hotel scraper failed: {e}")

        # Fallback to Dynamic Scraper
        if not hotels_data:
            try:
                booking_result = await scrape_dynamic(hotel_url)
                hotels_data = booking_result.get("extracted_data", [])[:2]
            except Exception as e:
                logger.warning(f"Booking scraper failed: {e}")
        
    if not hotels_data:
        raise RuntimeError(f"All hotel scrapers failed for {city}. No real hotel data available.")

    # 1. Foursquare API for Restaurants
    if test_data and "restaurants" in test_data:
        restaurants_data = test_data["restaurants"][:4]
    else:
        try:
            yelp_url = f"https://www.yelp.com/search?find_loc={urllib.parse.quote(city)}"
            yelp_result = await scrape_dynamic(yelp_url)
            restaurants_data = yelp_result.get("extracted_data", [])[:4]
        except Exception as e:
            logger.warning(f"Yelp scraper failed: {e}")

    # Determine base coordinates for patching
    print("[DEBUG] Determining base coordinates...")
    if db_pois and db_pois[0].get("location"):
        base_lat = db_pois[0]["location"]["latitude"]
        base_lon = db_pois[0]["location"]["longitude"]
    else:
        raise RuntimeError("No valid attraction location data found.")

    pois_data = []
    
    for h in hotels_data:
        lat = h.get("location", {}).get("latitude", 0.0)
        lon = h.get("location", {}).get("longitude", 0.0)
        if lat == 0.0 or lon == 0.0:
            raise RuntimeError(f"Hotel {h.get('name')} missing valid coordinates.")
        pois_data.append({
            "name": h.get("name", "Unknown Hotel"),
            "category": "HOTEL",
            "cost_eur": h.get("financials", {}).get("price_per_night", 0.0),
            "duration_mins": 0,
            "lat": lat,
            "lon": lon
        })

    for p in db_pois:
        pois_data.append({
            "name": p.get("name", "Unknown Attraction"),
            "category": p.get("category", "ATTRACTION"),
            "cost_eur": p.get("financials", {}).get("estimated_cost", 0.0),
            "duration_mins": p.get("schedule", {}).get("recommended_duration_minutes", 60),
            "lat": p.get("location", {}).get("latitude", base_lat),
            "lon": p.get("location", {}).get("longitude", base_lon)
        })
        
    if not restaurants_data:
        raise RuntimeError(f"Could not fetch real restaurant data for {city}.")
        
    for r in restaurants_data:
        lat = r.get("location", {}).get("latitude", 0.0) if isinstance(r, dict) else 0.0
        lon = r.get("location", {}).get("longitude", 0.0) if isinstance(r, dict) else 0.0
        if lat == 0.0 or lon == 0.0:
            raise RuntimeError(f"Restaurant {r.get('name')} missing valid coordinates.")
        pois_data.append({
            "name": r.get("name", "Unknown Restaurant"),
            "category": "RESTAURANT",
            "cost_eur": 20.0, # Simple heuristic
            "duration_mins": 60,
            "lat": lat,
            "lon": lon
        })
        
    num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
    print(f"[DEBUG] Planning {num_days}-day itinerary for {len(pois_data)} total nodes...")
    logger.info(f"Planning {num_days}-day itinerary for {len(pois_data)} total nodes...")
    
    unvisited_pois = list(pois_data)
    multi_day_itinerary = []
    
    flight_cost = outbound_flight["price"] + return_flight["price"]
    constraints.budget_usd -= flight_cost
    logger.info(f"Subtracted flight cost ${flight_cost}. Remaining budget for C++: ${constraints.budget_usd}")
    
    arr_hour, arr_min = map(int, outbound_flight["arrival_time"].split(":"))
    arrival_mins = arr_hour * 60 + arr_min
    
    dep_hour, dep_min = map(int, return_flight["departure_time"].split(":"))
    departure_mins = dep_hour * 60 + dep_min
    
    # 2 hours before flight + 45 mins transit
    hotel_departure_time = departure_mins - 120 - 45
    # Arrival at hotel = Flight arrival + 60 mins (airport exit) + 45 mins transit
    hotel_arrival_time = arrival_mins + 60 + 45

    for day in range(num_days):
        logger.debug(f"Running optimization for Day {day+1}...")
        if len(unvisited_pois) <= 1 and unvisited_pois and unvisited_pois[0].get("category") == "HOTEL":
            logger.debug("Only HOTEL left, stopping multi-day planning early.")
            break
            
        print(f"[DEBUG] Calculating transit matrix for {len(unvisited_pois)} POIs...")
        matrix = await get_transit_matrix(unvisited_pois, city)
        print("[DEBUG] Matrix generated.")
        matrix = inject_slack_time(matrix, 0.15)
        
        day_start_mins = 480 # 08:00 default
        day_end_mins = 1320 # 22:00 default
        
        # Shift time to simulate starting at the hotel on Day 1
        if day == 0:
            day_start_mins = max(480, hotel_arrival_time)
            logger.info(f"Day 1 starts at {day_start_mins} mins due to flight arrival + transit.")
            
        # Shift end time on Day N due to departure
        if day == num_days - 1:
            day_end_mins = min(1320, hotel_departure_time)
            logger.info(f"Day {num_days} ends at {day_end_mins} mins due to flight departure + buffer.")
            
        result = run_optimization(
            constraints, 
            unvisited_pois, 
            matrix, 
            num_days=num_days, 
            day_start_mins=day_start_mins, 
            day_end_mins=day_end_mins,
            mandatory_names=mandatory_names
        )
        
        # Determine hotel index for base-node anchoring
        hotel_idx = next((i for i, p in enumerate(unvisited_pois) if p.get("category") == "HOTEL"), -1)
        if hotel_idx != -1 and result["path"]:
            last_idx = unvisited_pois.index(result["path"][-1]["poi"]) if result["path"][-1]["poi"] in unvisited_pois else -1
            if last_idx != -1 and last_idx != hotel_idx:
                # Add transit time back to hotel
                transit_time = matrix[last_idx][hotel_idx]["duration_mins"]
                
                # Calculate new current_time from the last POI's scheduled end
                last_end_str = result["path"][-1]["scheduled_end"]
                last_end_h, last_end_m = map(int, last_end_str.split(":"))
                current_time = last_end_h * 60 + last_end_m + transit_time
                
                arr_h = current_time // 60
                arr_m = current_time % 60
                
                result["path"].append({
                    "poi": unvisited_pois[hotel_idx],
                    "scheduled_start": f"{arr_h:02d}:{arr_m:02d}",
                    "scheduled_end": f"{arr_h:02d}:{arr_m:02d}" # Sleep
                })
                result["total_time_mins"] += transit_time
        
        # Flight assignment
        daily_flight = None
        if day == 0: daily_flight = outbound_flight
        elif day == num_days - 1: daily_flight = return_flight
        
        multi_day_itinerary.append({
            "day": day + 1,
            "flight_info": daily_flight,
            "itinerary": result
        })
        
        # Determine which POIs were visited today
        visited_names = {p_info["poi"]["name"] for p_info in result["path"]}
        logger.debug(f"Day {day+1} scheduled {len(visited_names)} POIs.")
        
        # Remove visited POIs for the next day, keeping the HOTEL (base node)
        unvisited_pois = [
            p for p in unvisited_pois
            if p["category"] == "HOTEL" or p["name"] not in visited_names
        ]
    
    print("[DEBUG] Itinerary generation complete.")
    logger.info("--- [PHASE: PLANNER] Successfully generated itinerary ---")
    return {"final_itinerary": {"days": multi_day_itinerary}}

def route_after_router(state: SwarmState) -> str:
    return state.get("intent", "REACTIVE_PLANNING")

def create_swarm():
    workflow = StateGraph(SwarmState)
    
    workflow.add_node("router", router_node)
    workflow.add_node("rag", rag_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("check_missing", check_missing_fields_node)
    workflow.add_node("planner", planner_node)
    workflow.add_node("alert", alert_node)

    workflow.add_edge(START, "router")
    workflow.add_conditional_edges(
        "router",
        route_after_router,
        {
            "REACTIVE_PLANNING": "rag",
            "PROACTIVE_MONITORING": "alert"
        }
    )
    workflow.add_edge("rag", "validator")
    workflow.add_edge("validator", "check_missing")
    workflow.add_edge("check_missing", "planner")
    workflow.add_edge("planner", END)
    workflow.add_edge("alert", END)

    from langgraph.checkpoint.memory import MemorySaver
    return workflow.compile(checkpointer=MemorySaver())

graph = create_swarm()
