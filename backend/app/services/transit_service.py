import logging
import os
from typing import Any

import httpx
from app.domain.entities.poi import TransitLeg, TransitStep

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")


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
        async with httpx.AsyncClient(timeout=10.0) as client:
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

            if has_transit_step:
                mode = "transit"
                total_cost_eur = 1.80
            else:
                mode = "pedestrian"
                total_cost_eur = 0.0

    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.warning(
            f"Could not fetch multimodal route between '{orig_name}' and '{dest_name}': {exc}. Using pedestrian/transit estimate."
        )
        # Fallback step
        steps = [
            TransitStep(
                type="walk",
                instruction=f"Walk towards {dest_name}",
                duration_mins=total_duration_mins,
                distance_km=1.0,
            )
        ]

    return TransitLeg(
        duration_mins=total_duration_mins,
        cost_eur=total_cost_eur,
        mode=mode,
        steps=steps,
    )
