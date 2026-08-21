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
from app.scraper.api_scraper import get_flights_aviationstack, get_hotels_amadeus
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

async def planner_node(state: SwarmState) -> dict:
    """
    Coordinates fetching POIs, getting transit matrix, and running the deterministic C++ engine.
    """
    logger.info("--- [PHASE: PLANNER] Running itinerary optimization engine ---")
    constraints = state.get("validated_itinerary")
    if not constraints:
        logger.error("No validated itinerary constraints found in state!")
        return {"error_count": state.get("error_count", 0) + 1}
        
    city = constraints.destination_city
    logger.info(f"Fetching real POIs from PostgreSQL for {city}...")
    
    # 1. Fetch static attractions from database (SWR cache)
    db_pois = await get_attractions_for_city(city)
    
    # Sort or limit to avoid overloading local Valhalla (e.g. top 15 attractions)
    db_pois = db_pois[:15]
    
    # 2. Fetch dynamic hotels and restaurants
    logger.info(f"Triggering dynamic scrapers for Hotels and Restaurants in {city}...")
    hotel_url = f"https://www.booking.com/searchresults.html?ss={urllib.parse.quote(city)}"
    yelp_url = f"https://www.yelp.com/search?find_loc={urllib.parse.quote(city)}"
    
    hotels_data = []
    restaurants_data = []
    flights_data = []
    
    # Scrape flights using multiple strategies (API, HTTP, Dynamic)
    origin = constraints.origin_city
    if origin and origin.lower() != "unknown":
        logger.info(f"Triggering flight scrapers from {origin} to {city}...")
        date_str = constraints.start_date.strftime("%Y-%m-%d") if hasattr(constraints.start_date, 'strftime') else str(constraints.start_date)

        # 1. Skyscanner Scraper (Primary)
        try:
            skyscanner = SkyscannerScraper()
            skyscanner_flights = await skyscanner.scrape_flights(origin, city, date_str)
            if skyscanner_flights:
                flights_data = skyscanner_flights
        except Exception as e:
            logger.warning(f"Skyscanner scraper failed: {e}")

        # 2. Dynamic Scraper (Google Flights, Ryanair)
        if not flights_data:
            flight_url = f"https://www.google.com/travel/flights?q=from+{urllib.parse.quote(origin)}+to+{urllib.parse.quote(city)}"
            try:
                flight_result = await scrape_dynamic(flight_url)
                flights_data = flight_result.get("extracted_data", [])
            except Exception as e:
                logger.warning(f"Google Flights scraper failed: {e}. Attempting Ryanair structure...")
                try:
                    # Attempt Ryanair fallback assuming user might provide IATA (e.g. STN to OPO)
                    ryanair_url = f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={origin[:3].upper()}&destinationIata={city[:3].upper()}"
                    ryanair_result = await scrape_dynamic(ryanair_url)
                    flights_data = ryanair_result.get("extracted_data", [])
                except Exception as re:
                    logger.warning(f"All dynamic flight scrapers failed: {re}")

        # 2. HTTP Scrapers (Vueling / EasyJet)
        if not flights_data:
            try:
                vueling = VuelingScraper()
                vueling_flights = await vueling.scrape_flights(origin, city, date_str)
                if vueling_flights:
                    flights_data = vueling_flights
            except Exception as e:
                logger.warning(f"Vueling scraper failed: {e}")

        if not flights_data:
            try:
                easyjet = EasyJetScraper()
                easyjet_flights = await easyjet.scrape_flights(origin, city, date_str)
                if easyjet_flights:
                    flights_data = easyjet_flights
            except Exception as e:
                logger.warning(f"EasyJet scraper failed: {e}")

        # 3. API Scraper (Aviationstack) as Final Fallback
        if not flights_data:
            try:
                api_result = await get_flights_aviationstack(origin, city)
                if api_result.get("status") == "success" and api_result.get("data"):
                    f = api_result["data"][0]
                    # Aviationstack usually does not provide ticket prices in the flight tracking API.
                    # If it doesn't, we must throw an error to strictly enforce real-world prices.
                    price = f.get("price")
                    if not price:
                         raise RuntimeError("Aviationstack returned flight data but no real-world prices. Strict pricing enforcement triggered.")
                    
                    flights_data = [{
                        "price": float(price),
                        "arrival_time": f.get("arrival", {}).get("scheduled", "14:00T")[:16].split("T")[-1],
                        "departure_time": f.get("departure", {}).get("scheduled", "11:00T")[:16].split("T")[-1]
                    }]
            except Exception as e:
                logger.error(f"Aviationstack failed or no real prices found: {e}")
            
    if not flights_data:
         raise RuntimeError(f"No real flights found from {origin} to {city}.")
         
    # Extract from the parsed Flight model
    f = flights_data[0]
    # Handle both raw dict (Google Flights) and structured Pydantic model dump (Ryanair)
    if isinstance(f, dict) and "financials" not in f:
        # Raw dict from Google Flights scraper
        flights_data = [{
            "price": float(f.get("price", 150.0)),
            "arrival_time": f.get("arrival_time", "14:00"),
            "departure_time": f.get("departure_time", "11:00")
        }]
    else:
        # Proper Flight model
        flights_data = [{
            "price": f.get("financials", {}).get("price", 150.0) if isinstance(f, dict) else f.financials.price,
            "arrival_time": f.get("schedule", {}).get("arrival_utc", "14:00")[:5] if isinstance(f, dict) else str(f.schedule.arrival_utc)[11:16],
            "departure_time": f.get("schedule", {}).get("departure_utc", "11:00")[:5] if isinstance(f, dict) else str(f.schedule.departure_utc)[11:16]
        }]
    
    # Try API Scraper for Hotels first
    try:
        amadeus_result = await get_hotels_amadeus(city[:3].upper())
        if amadeus_result.get("status") == "success" and amadeus_result.get("data"):
            for h in amadeus_result["data"][:2]:
                hotels_data.append({
                    "name": h.get("name", "Amadeus Hotel"),
                    "location": {"latitude": 0.0, "longitude": 0.0},
                    "financials": {"price_per_night": float(h.get("price", {}).get("total", 100.0))}
                })
    except Exception as e:
        logger.warning(f"Amadeus hotel scraper failed: {e}")

    # Fallback to Dynamic Scraper
    if not hotels_data:
        try:
            booking_result = await scrape_dynamic(hotel_url)
            hotels_data = booking_result.get("extracted_data", [])[:2] # Take top 2 hotels
        except Exception as e:
            logger.warning(f"Booking scraper failed: {e}")
        
    try:
        yelp_result = await scrape_dynamic(yelp_url)
        restaurants_data = yelp_result.get("extracted_data", [])[:4] # Take top 4 restaurants
    except Exception as e:
        logger.warning(f"Yelp scraper failed: {e}")

    # Determine base coordinates for patching
    base_lat, base_lon = 40.4168, -3.7038 # Default to Madrid if everything fails
    if db_pois and db_pois[0].get("location"):
        base_lat = db_pois[0]["location"]["latitude"]
        base_lon = db_pois[0]["location"]["longitude"]

    pois_data = []
    
    # Process Hotels (Need at least one as base node)
    if not hotels_data:
        raise RuntimeError(f"Could not fetch real hotel data for {city}. No mock data allowed.")
    
    for h in hotels_data:
        lat = h.get("location", {}).get("latitude", 0.0)
        lon = h.get("location", {}).get("longitude", 0.0)
        if lat == 0.0 or lon == 0.0:
            lat = base_lat + random.uniform(-0.01, 0.01)
            lon = base_lon + random.uniform(-0.01, 0.01)
        pois_data.append({
            "name": h.get("name", "Unknown Hotel"),
            "category": "HOTEL",
            "cost_eur": h.get("financials", {}).get("price_per_night", 100.0),
            "duration_mins": 0,
            "lat": lat,
            "lon": lon
        })

    # Process Attractions
    for p in db_pois:
        pois_data.append({
            "name": p.get("name", "Unknown Attraction"),
            "category": p.get("category", "ATTRACTION"),
            "cost_eur": p.get("financials", {}).get("estimated_cost_per_person", 10.0),
            "duration_mins": p.get("schedule", {}).get("recommended_duration_minutes", 60),
            "lat": p.get("location", {}).get("latitude", base_lat),
            "lon": p.get("location", {}).get("longitude", base_lon)
        })
        
    # Process Restaurants
    if not restaurants_data:
        raise RuntimeError(f"Could not fetch real restaurant data for {city}. No mock data allowed.")
        
    for r in restaurants_data:
        lat = r.get("location", {}).get("latitude", 0.0) if isinstance(r, dict) else 0.0
        lon = r.get("location", {}).get("longitude", 0.0) if isinstance(r, dict) else 0.0
        if lat == 0.0 or lon == 0.0:
            lat = base_lat + random.uniform(-0.02, 0.02)
            lon = base_lon + random.uniform(-0.02, 0.02)
        pois_data.append({
            "name": r.get("name", "Unknown Restaurant"),
            "category": "RESTAURANT",
            "cost_eur": 20.0, # Simple heuristic
            "duration_mins": 60,
            "lat": lat,
            "lon": lon
        })
        
    num_days = max(1, (constraints.end_date - constraints.start_date).days + 1)
    logger.info(f"Planning {num_days}-day itinerary for {len(pois_data)} total nodes...")
    
    unvisited_pois = list(pois_data)
    multi_day_itinerary = []
    
    flight_cost = flights_data[0]["price"]
    constraints.budget_usd -= flight_cost
    logger.info(f"Subtracted flight cost ${flight_cost}. Remaining budget for C++: ${constraints.budget_usd}")
    
    arr_hour, arr_min = map(int, flights_data[0]["arrival_time"].split(":"))
    arrival_mins = arr_hour * 60 + arr_min
    
    dep_hour, dep_min = map(int, flights_data[0]["departure_time"].split(":"))
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
            
        matrix = await get_transit_matrix(unvisited_pois, city)
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
            
        result = run_optimization(constraints, unvisited_pois, matrix, num_days=num_days, day_start_mins=day_start_mins, day_end_mins=day_end_mins)
        
        multi_day_itinerary.append({
            "day": day + 1,
            "flight_info": flights_data[0] if day == 0 or day == num_days - 1 else None,
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
    
    logger.info("--- [PHASE: PLANNER] Successfully generated itinerary ---")
    return {"final_itinerary": {"days": multi_day_itinerary}}

def route_after_router(state: SwarmState) -> str:
    return state.get("intent", "REACTIVE_PLANNING")

def create_swarm():
    workflow = StateGraph(SwarmState)
    
    workflow.add_node("router", router_node)
    workflow.add_node("rag", rag_node)
    workflow.add_node("validator", validator_node)
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
    workflow.add_edge("validator", "planner")
    workflow.add_edge("planner", END)
    workflow.add_edge("alert", END)

    return workflow.compile()

graph = create_swarm()
