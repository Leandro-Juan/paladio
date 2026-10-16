import logging
import os
from typing import Any

import httpx
from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.transit_fare_service import TransitFareService

logger = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")


def decode_polyline6(encoded: str) -> list[list[float]]:
    """Decodes Google/Valhalla polyline with precision 6 (1e-6) into [[lat, lon], ...]."""
    if not encoded:
        return []
    coords: list[list[float]] = []
    lat = 0
    lng = 0
    i = 0
    length = len(encoded)
    inv = 1e-6
    while i < length:
        shift = 0
        result = 0
        while i < length:
            b = ord(encoded[i]) - 63
            i += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        if i >= length:
            break

        shift = 0
        result = 0
        while i < length:
            b = ord(encoded[i]) - 63
            i += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coords.append([round(lat * inv, 6), round(lng * inv, 6)])
    return coords


class TransitRoutingError(Exception):
    """Raised when multimodal transit routing cannot be fetched or parsed."""


async def get_detailed_transit_leg(
    origin: dict[str, Any],
    destination: dict[str, Any],
    departure_iso: str | None = None,
    is_airport_leg: bool = False,
) -> TransitLeg:
    """
    Retrieves detailed multimodal transit maneuvers (walk to stop, board line,
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
    fare_result = None
    mode = "multimodal"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{VALHALLA_URL}/route", json=req_payload)
            if resp.status_code == 400 and not is_airport_leg:
                # Multimodal transit route not found in GTFS; try pedestrian route via OSM
                pedestrian_payload = {
                    "locations": req_payload["locations"],
                    "costing": "pedestrian",
                    "directions_options": {"units": "kilometers"},
                }
                resp = await client.post(
                    f"{VALHALLA_URL}/route", json=pedestrian_payload
                )
            resp.raise_for_status()
            data = resp.json()

            trip = data.get("trip", {})
            summary = trip.get("summary", {})
            total_duration_mins = max(1, int(summary.get("time", 900) / 60))

            has_transit_step = False
            legs = trip.get("legs", [])
            full_geometry: list[list[float]] = []

            for leg in legs:
                leg_shape = leg.get("shape", "")
                leg_coords = decode_polyline6(leg_shape) if leg_shape else []
                if leg_coords:
                    if not full_geometry:
                        full_geometry.extend(leg_coords)
                    else:
                        full_geometry.extend(leg_coords[1:])

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

                    b_idx = m.get("begin_shape_index", 0)
                    e_idx = m.get("end_shape_index", b_idx)
                    m_geom = leg_coords[b_idx : e_idx + 1] if leg_coords else []

                    steps.append(
                        TransitStep(
                            type=step_type,
                            instruction=instruction,
                            duration_mins=m_time_mins,
                            distance_km=m_dist_km,
                            transit_line=line_name,
                            headsign=headsign,
                            station_name=station,
                            geometry=m_geom,
                        )
                    )

            if (
                not full_geometry
                and orig_lat is not None
                and orig_lon is not None
                and dest_lat is not None
                and dest_lon is not None
            ):
                full_geometry = [
                    [float(orig_lat), float(orig_lon)],
                    [float(dest_lat), float(dest_lon)],
                ]

            city_name = str(origin.get("city") or destination.get("city") or "").strip()
            fare_result = TransitFareService.calculate_transit_leg_fare(
                city_name,
                steps,
                is_airport_leg=is_airport_leg,
                origin=origin,
                destination=destination,
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
        cost_eur=fare_result.total_cost if fare_result else 0.0,
        cost_is_estimated=fare_result.cost_is_estimated if fare_result else False,
        price_source=fare_result.price_source if fare_result else None,
        mode=mode,
        steps=steps,
        airport_surcharge_eur=fare_result.airport_surcharge_eur if fare_result else 0.0,
        geometry=full_geometry,
    )


async def get_detailed_walking_leg(
    origin: dict[str, Any],
    destination: dict[str, Any],
) -> TransitLeg:
    """
    Retrieves real pedestrian maneuvers and route between two locations via Valhalla /route.
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

    req_payload = {
        "locations": [
            {"lat": float(orig_lat), "lon": float(orig_lon)},
            {"lat": float(dest_lat), "lon": float(dest_lon)},
        ],
        "costing": "pedestrian",
        "directions_options": {"units": "kilometers"},
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{VALHALLA_URL}/route", json=req_payload)
            resp.raise_for_status()
            data = resp.json()

            trip = data.get("trip", {})
            summary = trip.get("summary", {})
            total_duration_mins = max(1, int(round(summary.get("time", 60) / 60)))

            legs = trip.get("legs", [])
            full_geometry: list[list[float]] = []
            steps: list[TransitStep] = []

            for leg in legs:
                leg_shape = leg.get("shape", "")
                leg_coords = decode_polyline6(leg_shape) if leg_shape else []
                if leg_coords:
                    if not full_geometry:
                        full_geometry.extend(leg_coords)
                    else:
                        full_geometry.extend(leg_coords[1:])

                for m in leg.get("maneuvers", []):
                    instruction = m.get("instruction", "")
                    m_time_mins = max(1, int(round(m.get("time", 60) / 60)))
                    m_dist_km = round(m.get("length", 0.0), 2)
                    b_idx = m.get("begin_shape_index", 0)
                    e_idx = m.get("end_shape_index", b_idx)
                    m_geom = leg_coords[b_idx : e_idx + 1] if leg_coords else []
                    steps.append(
                        TransitStep(
                            type="walk",
                            instruction=instruction,
                            duration_mins=m_time_mins,
                            distance_km=m_dist_km,
                            geometry=m_geom,
                        )
                    )

            if (
                not full_geometry
                and orig_lat is not None
                and orig_lon is not None
                and dest_lat is not None
                and dest_lon is not None
            ):
                full_geometry = [
                    [float(orig_lat), float(orig_lon)],
                    [float(dest_lat), float(dest_lon)],
                ]

            return TransitLeg(
                duration_mins=total_duration_mins,
                cost_eur=0.0,
                cost_is_estimated=False,
                mode="pedestrian",
                steps=steps,
                geometry=full_geometry,
            )
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.error(
            f"Could not fetch pedestrian route between '{orig_name}' and '{dest_name}': {exc}."
        )
        raise TransitRoutingError(
            f"Could not fetch pedestrian route between '{orig_name}' and '{dest_name}': {exc}"
        ) from exc


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
    is_airport_leg: bool = False,
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

    orig_is_airport = (
        str(origin.get("category") or "").strip().upper() == "AIRPORT"
        or "airport" in orig_name.lower()
        or "aeropuerto" in orig_name.lower()
    )
    dest_is_airport = (
        str(destination.get("category") or "").strip().upper() == "AIRPORT"
        or "airport" in dest_name.lower()
        or "aeropuerto" in dest_name.lower()
    )
    is_airport = is_airport_leg or orig_is_airport or dest_is_airport

    fallback_geom = (
        [[float(orig_lat), float(orig_lon)], [float(dest_lat), float(dest_lon)]]
        if orig_lat is not None
        and orig_lon is not None
        and dest_lat is not None
        and dest_lon is not None
        else []
    )

    # If distance < 1.2 km and not airport: Pedestrian walk
    if dist_km < 1.2 and not is_airport:
        dur_mins = max(4, int(dist_km / 4.5 * 60))
        dist_m = int(dist_km * 1000)
        steps = [
            TransitStep(
                type="walk",
                instruction=f"Walk approx {dist_m}m to {dest_name}",
                duration_mins=dur_mins,
                distance_km=round(dist_km, 2),
                geometry=fallback_geom,
            )
        ]
        return TransitLeg(
            duration_mins=dur_mins,
            cost_eur=0.0,
            cost_is_estimated=False,
            price_source="pedestrian_walk",
            mode="pedestrian",
            steps=steps,
            airport_surcharge_eur=0.0,
            geometry=fallback_geom,
        )

    # Multimodal transit route
    dur_mins = max(15, int(dist_km / 22.0 * 60) + 8)
    walk1_dist = round(min(0.4, dist_km * 0.1), 2)
    walk2_dist = round(min(0.3, dist_km * 0.08), 2)
    transit_dist = round(max(0.5, dist_km - walk1_dist - walk2_dist), 2)

    if is_airport:
        if orig_is_airport:
            steps = [
                TransitStep(
                    type="walk",
                    instruction=f"Walk {int(walk1_dist * 1000)}m to the airport metro / rail terminal station",
                    duration_mins=5,
                    distance_km=walk1_dist,
                    station_name=orig_name,
                ),
                TransitStep(
                    type="transit_board",
                    instruction=f"Board airport metro / express line towards {dest_name}",
                    duration_mins=max(10, dur_mins - 9),
                    distance_km=transit_dist,
                    transit_line="Airport Line",
                    headsign=dest_name,
                    station_name=orig_name,
                ),
                TransitStep(
                    type="transit_alight",
                    instruction=f"Alight and walk {int(walk2_dist * 1000)}m to {dest_name}",
                    duration_mins=4,
                    distance_km=walk2_dist,
                ),
            ]
        else:
            steps = [
                TransitStep(
                    type="walk",
                    instruction=f"Walk {int(walk1_dist * 1000)}m to public transit station near {orig_name}",
                    duration_mins=5,
                    distance_km=walk1_dist,
                ),
                TransitStep(
                    type="transit_board",
                    instruction=f"Board airport metro / express line towards {dest_name}",
                    duration_mins=max(10, dur_mins - 9),
                    distance_km=transit_dist,
                    transit_line="Airport Line",
                    headsign=dest_name,
                    station_name=dest_name,
                ),
                TransitStep(
                    type="transit_alight",
                    instruction=f"Alight at {dest_name} terminal station",
                    duration_mins=4,
                    distance_km=walk2_dist,
                    station_name=dest_name,
                ),
            ]
    else:
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

    fare_res = TransitFareService.calculate_transit_leg_fare(
        city_name,
        steps,
        is_airport_leg=is_airport,
        origin=origin,
        destination=destination,
    )

    return TransitLeg(
        duration_mins=dur_mins,
        cost_eur=fare_res.total_cost,
        cost_is_estimated=fare_res.cost_is_estimated,
        price_source=fare_res.price_source,
        mode="transit",
        steps=steps,
        airport_surcharge_eur=fare_res.airport_surcharge_eur,
        geometry=fallback_geom,
    )


async def ensure_walking_legs_populated(
    itinerary: dict[str, Any],
    city: str = "",
    target_day: int | str | None = None,
) -> dict[str, Any]:
    """
    Enriches all walkable legs in an itinerary with real turn-by-turn pedestrian routing
    from Valhalla directly upon trip creation, keeping public transit legs marked as estimated.
    """
    if not isinstance(itinerary, dict):
        return itinerary
    days = itinerary.get("days", [])
    if not isinstance(days, list):
        return itinerary

    for d_idx, day_obj in enumerate(days):
        if not isinstance(day_obj, dict):
            continue
        if target_day is not None and str(target_day).lower() != "all":
            day_num = day_obj.get("day", d_idx + 1)
            if str(day_num) != str(target_day):
                continue
        day_itin = day_obj.get("itinerary", {})
        if not isinstance(day_itin, dict):
            continue
        path = day_itin.get("path", [])
        if not isinstance(path, list) or len(path) < 2:
            continue

        for k in range(1, len(path)):
            prev_poi = path[k - 1].get("poi") or {}
            curr_poi = path[k].get("poi") or {}
            existing_transit = path[k].get("transit_from_previous")

            # Check if this leg already has verified real walking steps with geometry
            if (
                isinstance(existing_transit, dict)
                and existing_transit.get("mode") in ("pedestrian", "walk")
                and bool(existing_transit.get("steps"))
                and bool(existing_transit.get("geometry"))
                and not existing_transit.get("cost_is_estimated", False)
            ):
                continue

            prev_loc = prev_poi.get("location") or {}
            curr_loc = curr_poi.get("location") or {}
            p_lat = prev_loc.get("latitude", prev_poi.get("lat"))
            p_lon = prev_loc.get("longitude", prev_poi.get("lon"))
            c_lat = curr_loc.get("latitude", curr_poi.get("lat"))
            c_lon = curr_loc.get("longitude", curr_poi.get("lon"))

            is_airport_leg = (
                curr_poi.get("category") == "AIRPORT"
                or prev_poi.get("category") == "AIRPORT"
            )

            dist_km = 999.0
            if (
                p_lat is not None
                and p_lon is not None
                and c_lat is not None
                and c_lon is not None
            ):
                try:
                    dist_km = calculate_haversine_km(
                        float(p_lat), float(p_lon), float(c_lat), float(c_lon)
                    )
                except (ValueError, TypeError):
                    dist_km = 999.0

            if dist_km <= 1.2 and not is_airport_leg:
                # Real walking leg
                try:
                    walk_leg = await get_detailed_walking_leg(prev_poi, curr_poi)
                    path[k]["transit_from_previous"] = walk_leg.model_dump(mode="json")
                except Exception as walk_err:
                    logger.warning(
                        f"Could not fetch real pedestrian leg between '{prev_poi.get('name')}' and '{curr_poi.get('name')}': {walk_err}. Using synthesized walk."
                    )
                    synth = synthesize_fallback_transit_leg(
                        prev_poi, curr_poi, city=city, is_airport_leg=False
                    )
                    path[k]["transit_from_previous"] = synth.model_dump(mode="json")
            else:
                # Public transit leg: retain/provide estimated transit placeholder
                dest_name = curr_poi.get("name", "Stop")
                trans_dur = (
                    int(round(float(existing_transit.get("duration_mins", 20))))
                    if isinstance(existing_transit, dict)
                    and existing_transit.get("duration_mins") is not None
                    else 20
                )
                fare_info = TransitFareService.get_city_transit_fare(city)
                single_fare = fare_info.single_fare if fare_info else 1.5
                path[k]["transit_from_previous"] = {
                    "mode": "transit",
                    "duration_mins": trans_dur,
                    "cost_eur": single_fare,
                    "cost_is_estimated": True,
                    "price_source": "estimated_city_transit_fare",
                    "steps": [
                        {
                            "type": "transit_board",
                            "transit_line": "Transit",
                            "instruction": f"Board public transit towards {dest_name}",
                            "duration_mins": trans_dur,
                            "distance_km": round(dist_km, 2) if dist_km < 100 else 0.0,
                        }
                    ],
                }

    return itinerary
