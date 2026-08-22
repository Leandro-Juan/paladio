import re
import sys

def haversine(lat1, lon1, lat2, lon2):
    import math
    R = 6371.0 # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

with open('backend/app/swarm/graph.py', 'r') as f:
    content = f.read()

# 1. Add import math
if 'import math' not in content:
    content = content.replace('import random', 'import random\nimport math')

# 2. Add haversine function before planner_node
haversine_func = """
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

async def planner_node"""
content = content.replace('async def planner_node', haversine_func)

# 3. Handle flight scraping to fetch return flight
flights_replace = """    # Fetch return flights if end_date is provided
    return_flights_data = []
    if constraints.end_date:
        return_date_str = constraints.end_date.strftime("%Y-%m-%d")
        try:
            ff_scraper_return = FastFlightsScraper()
            return_flights_data = await ff_scraper_return.scrape_flights(city, origin, return_date_str)
        except Exception as e:
            logger.warning(f"fast-flights failed for return: {e}")
            
    if return_flights_data:
        return_f = return_flights_data[0]
        if isinstance(return_f, dict) and "financials" not in return_f:
            return_flights_data = [{
                "price": float(return_f.get("price", 150.0)),
                "arrival_time": return_f.get("arrival_time", "14:00"),
                "departure_time": return_f.get("departure_time", "11:00")
            }]
        else:
            return_flights_data = [{
                "price": return_f.get("financials", {}).get("price", 150.0) if isinstance(return_f, dict) else return_f.financials.price,
                "arrival_time": return_f.get("schedule", {}).get("arrival_utc", "14:00")[:5] if isinstance(return_f, dict) else str(return_f.schedule.arrival_utc)[11:16],
                "departure_time": return_f.get("schedule", {}).get("departure_utc", "11:00")[:5] if isinstance(return_f, dict) else str(return_f.schedule.departure_utc)[11:16]
            }]
    else:
        return_flights_data = flights_data

    # 1. Duffel API for Hotels"""
content = content.replace('    # 1. Duffel API for Hotels', flights_replace)

# 4. Inject mandatory POIs and distance filter
pois_replace = """    city_lat, city_lon = await get_location_coordinates(city)
    
    # Process Attractions
    for p in db_pois:
        lat = p.get("location", {}).get("latitude", 0.0)
        lon = p.get("location", {}).get("longitude", 0.0)
        if lat == 0.0 or lon == 0.0:
            continue
            
        # Distance filter
        dist = haversine(city_lat, city_lon, lat, lon)
        if dist > 8.0:
            continue
            
        pois_data.append({
            "name": p.get("name", "Unknown Attraction"),
            "category": p.get("category", "ATTRACTION"),
            "cost_eur": p.get("financials", {}).get("estimated_cost_per_person", 10.0),
            "duration_mins": p.get("schedule", {}).get("recommended_duration_minutes", 60),
            "lat": lat,
            "lon": lon
        })
        
    # Inject Mandatory Nodes from user request
    for node in constraints.nodes:
        logger.info(f"Injecting mandatory user POI: {node.poi_id}")
        lat, lon = await get_location_coordinates(f"{node.poi_id} in {city}")
        if lat != 0.0 and lon != 0.0:
            pois_data.append({
                "name": node.poi_id,
                "category": "ATTRACTION",
                "cost_eur": 10.0,
                "duration_mins": node.min_duration_minutes,
                "lat": lat,
                "lon": lon
            })"""
content = re.sub(r'    # Process Attractions.*?        pois_data\.append\(\{\n.*?"lon": lon\n        \}\)\n', pois_replace + '\n', content, flags=re.DOTALL)

# 5. Modify path array and flight output
path_replace = """        result = run_optimization(constraints, unvisited_pois, matrix, num_days=num_days, day_start_mins=day_start_mins, day_end_mins=day_end_mins)
        
        # Inject Hotel back into path
        base_hotel = None
        for p in unvisited_pois:
            if p["category"] == "HOTEL":
                base_hotel = p
                break
        
        if base_hotel:
            # Re-inject hotel at start and end of path if missing
            if not result["path"] or result["path"][0]["poi"]["name"] != base_hotel["name"]:
                result["path"].insert(0, {"poi": base_hotel, "scheduled_start": "08:00", "scheduled_end": "08:00"})
            if result["path"][-1]["poi"]["name"] != base_hotel["name"]:
                result["path"].append({"poi": base_hotel, "scheduled_start": "22:00", "scheduled_end": "22:00"})
        
        assigned_flight = None
        if day == 0:
            assigned_flight = flights_data[0]
        elif day == num_days - 1:
            assigned_flight = return_flights_data[0]
            
        multi_day_itinerary.append({
            "day": day + 1,
            "flight_info": assigned_flight,
            "itinerary": result
        })"""
content = re.sub(r'        result = run_optimization\(.*?\)\s+multi_day_itinerary\.append\(\{.*?\}\)\n', path_replace + '\n', content, flags=re.DOTALL)

with open('backend/app/swarm/graph.py', 'w') as f:
    f.write(content)
