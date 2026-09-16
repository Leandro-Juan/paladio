import logging
import os
from typing import Any

import httpx
from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.transit_fare_service import TransitFareService

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")


class TransitRoutingError(Exception):
    """Raised when multimodal transit routing cannot be fetched or parsed."""


async def get_detailed_transit_leg(
    origin: dict[str, Any],
    destination: dict[str, Any],
    departure_iso: str | None = None,
) -> TransitLeg:
    """
    Fetches turn-by-turn public transit instructions (walk to station, board line,
    transfer, alight, walk to destination) between two locations via Valhalla /route.
    """
    orig_lat = origin.get("location", {}).get("latitude", origin.get("lat", 0.0))
    orig_lon = origin.get("location", {}).get("longitude", origin.get("lon", 0.0))
    orig_name = origin.get("name", "Origin")

    dest_lat = destination.get("location", {}).get(
        "latitude", destination.get("lat", 0.0)
    )
    dest_lon = destination.get("location", {}).get(
        "longitude", destination.get("lon", 0.0)
    )
    dest_name = destination.get("name", "Destination")

    if not departure_iso:
        departure_iso = "2026-09-10T09:00"

    req_payload = {
        "locations": [
            {"lat": orig_lat, "lon": orig_lon},
            {"lat": dest_lat, "lon": dest_lon},
        ],
        "costing": "multimodal",
        "date_time": {
            "type": 1,  # 1 = depart at
            "value": departure_iso,
        },
        "costing_options": {
            "transit": {
                "use_bus": 0.8,
                "use_rail": 1.0,
                "use_transfers": 0.5,
            }
        },
        "directions_options": {"units": "kilometers"},
    }

    steps: list[TransitStep] = []
    total_duration_mins = 15
    total_cost_eur = 0.0
    mode = "multimodal"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(f"{VALHALLA_URL}/route", json=req_payload)
            resp.raise_for_status()
            data = resp.json()

            trip = data.get("trip", {})
            summary = trip.get("summary", {})
            total_duration_mins = max(1, int(summary.get("time", 900) / 60))

            has_transit_step = False

            for leg in trip.get("legs", []):
                for m in leg.get("maneuvers", []):
                    instruction = m.get("instruction", "")
                    m_time_mins = max(1, int(m.get("time", 60) / 60))
                    m_dist_km = round(m.get("length", 0.0), 2)
                    transit_info = m.get("transit_info")

                    step_type = "walk"
                    line_name = None
                    headsign = None
                    station = None

                    if transit_info:
                        has_transit_step = True
                        step_type = "transit"
                        line_name = transit_info.get("short_name") or transit_info.get(
                            "long_name"
                        )
                        headsign = transit_info.get("headsign")
                        station = transit_info.get("description") or "Transit Stop"

                    steps.append(
                        TransitStep(
                            type=step_type,
                            instruction=instruction,
                            duration_mins=m_time_mins,
                            distance_km=m_dist_km,
                            transit_line=line_name,
                            headsign=headsign,
                            station_name=station,
                        )
                    )

            city_name = str(origin.get("city") or destination.get("city") or "").strip()
            total_cost_eur, cost_is_estimated, price_source, _ = (
                TransitFareService.calculate_transit_leg_fare(city_name, steps)
            )
            mode = "transit" if has_transit_step else "pedestrian"

    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.error(
            f"Could not fetch multimodal route between '{orig_name}' and '{dest_name}': {exc}."
        )
        raise TransitRoutingError(
            f"Could not fetch multimodal route between '{orig_name}' and '{dest_name}': {exc}"
        ) from exc

    return TransitLeg(
        duration_mins=total_duration_mins,
        cost_eur=total_cost_eur,
        cost_is_estimated=cost_is_estimated,
        price_source=price_source,
        mode=mode,
        steps=steps,
    )


def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math

    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def synthesize_fallback_transit_leg(
    origin: dict[str, Any],
    destination: dict[str, Any],
    city: str | None = None,
) -> TransitLeg:
    """
    Synthesizes a realistic fallback transit leg with step-by-step instructions
    when Valhalla is unavailable or the route cannot be resolved.
    """
    orig_lat = origin.get("location", {}).get("latitude", origin.get("lat", 0.0))
    orig_lon = origin.get("location", {}).get("longitude", origin.get("lon", 0.0))
    orig_name = origin.get("name", "Origin")

    dest_lat = destination.get("location", {}).get(
        "latitude", destination.get("lat", 0.0)
    )
    dest_lon = destination.get("location", {}).get(
        "longitude", destination.get("lon", 0.0)
    )
    dest_name = destination.get("name", "Destination")

    dist_km = 0.5
    if orig_lat and orig_lon and dest_lat and dest_lon:
        try:
            dist_km = calculate_haversine_km(
                float(orig_lat), float(orig_lon), float(dest_lat), float(dest_lon)
            )
        except (ValueError, TypeError):
            dist_km = 0.5

    city_name = str(city or origin.get("city") or destination.get("city") or "").strip()

    # If distance < 1.2 km: Pedestrian walk
    if dist_km < 1.2:
        dur_mins = max(4, int(dist_km / 4.5 * 60))
        dist_m = int(dist_km * 1000)
        steps = [
            TransitStep(
                type="walk",
                instruction=f"Walk approx {dist_m}m to {dest_name}",
                duration_mins=dur_mins,
                distance_km=round(dist_km, 2),
            )
        ]
        return TransitLeg(
            duration_mins=dur_mins,
            cost_eur=0.0,
            cost_is_estimated=False,
            price_source="pedestrian_walk",
            mode="pedestrian",
            steps=steps,
        )

    # If distance >= 1.2 km: Multimodal transit route
    dur_mins = max(12, int(dist_km / 22.0 * 60) + 8)
    walk1_dist = round(min(0.4, dist_km * 0.1), 2)
    walk2_dist = round(min(0.3, dist_km * 0.08), 2)
    transit_dist = round(max(0.5, dist_km - walk1_dist - walk2_dist), 2)

    fare_info = TransitFareService.get_city_transit_fare(city_name)
    fare = fare_info.single_fare if fare_info else 1.80

    steps = [
        TransitStep(
            type="walk",
            instruction=f"Walk {int(walk1_dist * 1000)}m to the nearest public transit station near {orig_name}",
            duration_mins=5,
            distance_km=walk1_dist,
        ),
        TransitStep(
            type="transit_board",
            instruction=f"Board public transit towards {dest_name}",
            duration_mins=max(7, dur_mins - 9),
            distance_km=transit_dist,
            transit_line="Transit",
            headsign=dest_name,
        ),
        TransitStep(
            type="transit_alight",
            instruction=f"Alight and walk {int(walk2_dist * 1000)}m to {dest_name}",
            duration_mins=4,
            distance_km=walk2_dist,
        ),
    ]

    return TransitLeg(
        duration_mins=dur_mins,
        cost_eur=fare,
        cost_is_estimated=True,
        price_source="estimated_city_transit_fare",
        mode="transit",
        steps=steps,
    )
