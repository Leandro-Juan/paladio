import copy
import logging
import math
import os

import httpx

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_transit_matrix(pois: list[dict], city_name: str = "") -> list[list[dict]]:
    """
    Generate an N x N transit matrix between a list of POIs using local Valhalla.
    poi: dict with 'lat', 'lon'
    Returns: a 2D list matrix[i][j] = {"duration_mins": int, "cost_eur": float, "mode": str}
    """
    n = len(pois)
    matrix = [
        [{"duration_mins": 0, "cost_eur": 0.0, "mode": "none"} for _ in range(n)]
        for _ in range(n)
    ]
    if n == 0:
        return matrix

    locations = []
    for p in pois:
        lat = p.get("location", {}).get("latitude", p.get("lat", 0.0))
        lon = p.get("location", {}).get("longitude", p.get("lon", 0.0))
        locations.append({"lat": lat, "lon": lon})

    async with httpx.AsyncClient(timeout=10.0) as client:
        req_json = {
            "sources": locations,
            "targets": locations,
            "costing": "auto",
            "units": "km",
        }

        try:
            resp = await client.post(
                f"{VALHALLA_URL}/sources_to_targets", json=req_json
            )
            resp.raise_for_status()
            data = resp.json()
            sources_to_targets = data.get("sources_to_targets", [])

            for i in range(n):
                for j in range(n):
                    if i == j:
                        continue

                    if i < len(sources_to_targets) and j < len(sources_to_targets[i]):
                        cell = sources_to_targets[i][j]
                        dist_km = cell.get(
                            "distance",
                            haversine_distance(
                                locations[i]["lat"],
                                locations[i]["lon"],
                                locations[j]["lat"],
                                locations[j]["lon"],
                            ),
                        )
                        duration_secs = cell.get("time", 1800)

                        mode = "pedestrian"
                        cost = 0.0
                        if dist_km > 1.5:
                            mode = "transit"
                            cost = 1.50

                        matrix[i][j] = {
                            "duration_mins": max(1, int(duration_secs / 60)),
                            "cost_eur": cost,
                            "mode": mode,
                        }
                    else:
                        raise ValueError("Matrix size mismatch")

        except Exception:
            if city_name:
                logger.warning(
                    f"Valhalla failed matrix request for {city_name}. Triggering automated map pipeline."
                )
                from app.tasks import build_city_map_task

                build_city_map_task.delay(city_name)

            for i in range(n):
                for j in range(n):
                    if i == j:
                        continue
                    lat_i, lon_i = locations[i]["lat"], locations[i]["lon"]
                    lat_j, lon_j = locations[j]["lat"], locations[j]["lon"]

                    dist_km = haversine_distance(lat_i, lon_i, lat_j, lon_j)
                    if dist_km > 1.5:
                        duration = int((dist_km / 30.0 * 60) + 5)
                        cost = 2.50
                        mode = "heuristic_transit"
                    else:
                        duration = int(dist_km / 5.0 * 60)
                        cost = 0.0
                        mode = "heuristic_walking"
                    matrix[i][j] = {
                        "duration_mins": max(1, duration),
                        "cost_eur": cost,
                        "mode": mode,
                    }

    return matrix


def inject_slack_time(
    matrix: list[list[dict]], slack_percentage: float = 0.15
) -> list[list[dict]]:
    """
    Adds slack time to the matrix to account for unforeseen delays (TODO item #3)
    """
    n = len(matrix)
    matrix_copy = copy.deepcopy(matrix)
    for i in range(n):
        for j in range(n):
            if i != j:
                original = matrix_copy[i][j]["duration_mins"]
                matrix_copy[i][j]["duration_mins"] = int(
                    original * (1.0 + slack_percentage)
                )
    return matrix_copy
