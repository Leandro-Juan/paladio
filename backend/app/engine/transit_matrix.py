import os
import httpx
import asyncio
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")

async def get_transit_matrix(pois: List[Dict], city_name: str = "") -> List[List[Dict]]:
    """
    Generate an N x N transit matrix between a list of POIs using local Valhalla.
    poi: dict with 'lat', 'lon'
    Returns: a 2D list matrix[i][j] = {"duration_mins": int, "cost_eur": float, "mode": str}
    """
    n = len(pois)
    matrix = [[{"duration_mins": 0, "cost_eur": 0.0, "mode": "none"} for _ in range(n)] for _ in range(n)]
    
    async with httpx.AsyncClient() as client:
        # For small N (e.g., 10-15 per day cluster), doing N*(N-1) async route queries is fast enough locally.
        # This allows us to use Valhalla's full multimodal costing (transit, walking, etc).
        tasks = []
        indices = []
        for i in range(n):
            for j in range(n):
                if i != j:
                    req_json = {
                        "locations": [
                            {"lat": pois[i]["lat"], "lon": pois[i]["lon"]},
                            {"lat": pois[j]["lat"], "lon": pois[j]["lon"]}
                        ],
                        "costing": "pedestrian", # Fallback default
                        # If distance is > 1.5km, we could use multimodal/transit or auto.
                        # We will query both pedestrian and transit and pick the best, or dynamically choose.
                        "directions_options": {"units": "km"}
                    }
                    
                    # Rough distance heuristic to decide costing mode before query
                    # simplified distance (Euclidean approximation for mode selection)
                    lat_diff = pois[i]["lat"] - pois[j]["lat"]
                    lon_diff = pois[i]["lon"] - pois[j]["lon"]
                    dist_approx_km = (lat_diff**2 + lon_diff**2)**0.5 * 111
                    
                    if dist_approx_km > 1.5:
                        req_json["costing"] = "multimodal"
                        req_json["date_time"] = {"type": 1, "value": "2026-08-18T10:00"} # Arbitrary future daytime for transit schedules

                    url = f"{VALHALLA_URL}/route"
                    tasks.append(client.post(url, json=req_json))
                    indices.append((i, j))
        
        # In a real production setup, batching these or using the /sources_to_targets matrix API 
        # is better, but matrix API often doesn't support full multimodal schedules.
        if tasks:
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            error_count = 0
            for resp in responses:
                if isinstance(resp, Exception) or resp.status_code != 200:
                    error_count += 1
            
            # If >50% of requests failed, it's highly likely Valhalla is missing map tiles for this region.
            if len(tasks) > 0 and error_count > len(tasks) * 0.5:
                if city_name:
                    logger.warning(f"Valhalla failed {error_count}/{len(tasks)} requests for {city_name}. Triggering automated map pipeline.")
                    # Trigger the celery task asynchronously
                    from app.tasks import build_city_map_task
                    build_city_map_task.delay(city_name)
                    
            for (i, j), resp in zip(indices, responses):
                if isinstance(resp, Exception) or resp.status_code != 200:
                    # Fallback to straight-line geographical heuristic
                    lat_diff = pois[i]["lat"] - pois[j]["lat"]
                    lon_diff = pois[i]["lon"] - pois[j]["lon"]
                    dist_km = (lat_diff**2 + lon_diff**2)**0.5 * 111
                    duration = int(dist_km / 5.0 * 60) # 5 km/h walking speed
                    matrix[i][j] = {"duration_mins": max(1, duration), "cost_eur": 0.0, "mode": "heuristic"}
                    continue
                
                data = resp.json()
                if "trip" in data and "summary" in data["trip"]:
                    summary = data["trip"]["summary"]
                    duration_secs = summary.get("time", 1800)
                    dist_km = summary.get("length", 1.0)
                    
                    mode = "pedestrian"
                    cost = 0.0
                    
                    if dist_km > 1.5:
                        mode = "transit"
                        cost = 1.50 # Standard local transit fare
                        
                    matrix[i][j] = {
                        "duration_mins": int(duration_secs / 60),
                        "cost_eur": cost,
                        "mode": mode
                    }
                else:
                    matrix[i][j] = {"duration_mins": 30, "cost_eur": 5.0, "mode": "fallback"}
                    
    return matrix

def inject_slack_time(matrix: List[List[Dict]], slack_percentage: float = 0.15) -> List[List[Dict]]:
    """
    Adds slack time to the matrix to account for unforeseen delays (TODO item #3)
    """
    n = len(matrix)
    for i in range(n):
        for j in range(n):
            if i != j:
                original = matrix[i][j]["duration_mins"]
                matrix[i][j]["duration_mins"] = int(original * (1.0 + slack_percentage))
    return matrix
