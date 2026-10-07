"""Unified Routing Service for Paladio Itinerary Engine.

Provides async Valhalla pedestrian and multimodal transit routing with fail-fast honesty.
Never silently falls back to arbitrary estimates or flat 20/30-minute fake durations.
Raises RoutingUnavailable when Valhalla is unreachable unless plan_mode='estimated'.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from app.engine.transit_matrix import haversine_distance
from app.engine.v2.exceptions import RoutingUnavailable
from app.services.transit_fare_service import TransitFareService

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")
UNREACHABLE_DURATION_MINS = 9999


class RoutingService:
    """Unified routing service for multimodal transit and pedestrian graphs."""

    @classmethod
    async def get_transit_matrix(
        cls,
        pois: list[dict[str, Any]],
        city_name: str = "",
        departure_dt: datetime | str | None = None,
        plan_mode: str = "real",
    ) -> list[list[dict[str, Any]]]:
        """Generates an N x N transit matrix between POIs using Valhalla.

        Parameters
        ----------
        pois: list of POI dictionaries with 'location' {'latitude', 'longitude'}
        city_name: destination city name
        departure_dt: optional datetime or ISO string for schedule lookups
        plan_mode: 'real' (strict fail-fast; raises RoutingUnavailable if Valhalla down)
                   or 'estimated' (explicit fallback mode, flagged in cells)
        """
        n = len(pois)
        matrix: list[list[dict[str, Any]]] = [
            [{"duration_mins": 0, "cost_eur": 0.0, "mode": "none"} for _ in range(n)]
            for _ in range(n)
        ]
        if n == 0:
            return matrix

        locations: list[dict[str, float]] = []
        for p in pois:
            loc = p.get("location") or {}
            lat = float(loc.get("latitude", p.get("lat", 0.0)) or 0.0)
            lon = float(loc.get("longitude", p.get("lon", 0.0)) or 0.0)
            locations.append({"lat": lat, "lon": lon})

        fare_info = TransitFareService.get_city_transit_fare(city_name)
        transit_single_fare = fare_info.single_fare

        if plan_mode == "real":
            # 1. Format ISO departure time
            if isinstance(departure_dt, datetime):
                iso_dep = departure_dt.strftime("%Y-%m-%dT%H:%M")
            elif isinstance(departure_dt, str) and departure_dt:
                iso_dep = departure_dt
            else:
                iso_dep = datetime.now(timezone.utc).strftime("%Y-%m-%dT09:00")

            req_json = {
                "sources": locations,
                "targets": locations,
                "costing": "multimodal",
                "date_time": {"type": 1, "value": iso_dep},
                "costing_options": {
                    "transit": {
                        "use_bus": 0.8,
                        "use_rail": 1.0,
                        "use_transfers": 0.5,
                    }
                },
                "units": "km",
            }

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
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
                            if i < len(sources_to_targets) and j < len(
                                sources_to_targets[i]
                            ):
                                cell = sources_to_targets[i][j]
                                duration_secs = cell.get("time")

                                # Fail-fast on unreachable pair: never invent 30 minutes!
                                if duration_secs is None:
                                    matrix[i][j] = {
                                        "duration_mins": UNREACHABLE_DURATION_MINS,
                                        "cost_eur": 0.0,
                                        "mode": "unreachable",
                                        "is_reachable": False,
                                        "fare_unknown": getattr(
                                            fare_info, "fare_unknown", False
                                        ),
                                    }
                                    continue

                                dist_km = cell.get(
                                    "distance",
                                    haversine_distance(
                                        locations[i]["lat"],
                                        locations[i]["lon"],
                                        locations[j]["lat"],
                                        locations[j]["lon"],
                                    ),
                                )
                                mode = "pedestrian" if dist_km <= 1.0 else "transit"
                                cost = (
                                    0.0 if mode == "pedestrian" else transit_single_fare
                                )

                                matrix[i][j] = {
                                    "duration_mins": max(1, int(duration_secs / 60)),
                                    "cost_eur": cost,
                                    "mode": mode,
                                    "is_reachable": True,
                                    "fare_unknown": getattr(
                                        fare_info, "fare_unknown", False
                                    ),
                                }
                            else:
                                raise ValueError(
                                    f"Valhalla matrix response dimension mismatch: {len(sources_to_targets)}x{len(sources_to_targets[0]) if sources_to_targets else 0} for {n} nodes"
                                )
                    return matrix

            except (
                httpx.HTTPError,
                OSError,
                KeyError,
                IndexError,
                ValueError,
                RuntimeError,
            ) as exc:
                logger.error(
                    f"Valhalla routing engine unavailable at {VALHALLA_URL} for '{city_name}': {exc}"
                )
                raise RoutingUnavailable(
                    f"Valhalla routing engine is unavailable at {VALHALLA_URL} for '{city_name}' ({type(exc).__name__}: {exc}). "
                    "Paladio strictly rejects silent fallback to arbitrary distance estimates in plan_mode='real'. "
                    "To generate an explicitly estimated plan, request plan_mode='estimated'."
                ) from exc

        elif plan_mode == "estimated":
            # Explicit, user-visible estimated mode
            logger.info(
                f"Generating explicitly estimated transit matrix for '{city_name}' via haversine."
            )
            for i in range(n):
                for j in range(n):
                    if i == j:
                        continue
                    lat_i, lon_i = locations[i]["lat"], locations[i]["lon"]
                    lat_j, lon_j = locations[j]["lat"], locations[j]["lon"]
                    dist_km = haversine_distance(lat_i, lon_i, lat_j, lon_j)

                    if dist_km > 1.2:
                        duration = int((dist_km / 25.0 * 60) + 6)
                        cost = transit_single_fare
                        mode = "transit"
                    else:
                        duration = int(dist_km / 4.8 * 60)
                        cost = 0.0
                        mode = "pedestrian"

                    matrix[i][j] = {
                        "duration_mins": max(1, duration),
                        "cost_eur": cost,
                        "mode": mode,
                        "is_estimated": True,
                        "fare_unknown": getattr(fare_info, "fare_unknown", False),
                    }
            return matrix

        else:
            raise ValueError(
                f"Unknown plan_mode '{plan_mode}'. Expected 'real' or 'estimated'."
            )

    @classmethod
    async def get_route(
        cls,
        origin: tuple[float, float],
        destination: tuple[float, float],
        costing: str = "pedestrian",
        plan_mode: str = "real",
    ) -> dict[str, Any]:
        """Routes a single leg between two coordinates."""
        if plan_mode == "real":
            req_json = {
                "locations": [
                    {"lat": origin[0], "lon": origin[1]},
                    {"lat": destination[0], "lon": destination[1]},
                ],
                "costing": costing,
                "directions_options": {"units": "km"},
            }
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(f"{VALHALLA_URL}/route", json=req_json)
                    resp.raise_for_status()
                    return resp.json()
            except (httpx.HTTPError, OSError) as exc:
                raise RoutingUnavailable(
                    f"Valhalla routing engine unavailable at {VALHALLA_URL}: {exc}"
                ) from exc

        # Estimated mode
        dist = haversine_distance(origin[0], origin[1], destination[0], destination[1])
        dur_mins = max(1, round(dist * 13.33))
        return {
            "trip": {
                "summary": {"length": dist, "time": dur_mins * 60},
                "status": 0,
                "is_estimated": True,
            }
        }
