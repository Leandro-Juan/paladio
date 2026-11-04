import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.gtfs_route_service import get_gtfs_route_finder
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


def is_poi_airport(poi: dict | None) -> bool:
    if not isinstance(poi, dict):
        return False
    cat = str(poi.get("category") or "").upper()
    sub_cat = str(poi.get("sub_category") or "").upper()
    tags = poi.get("tags") or {}
    name = str(poi.get("name") or "").lower()

    if cat == "AIRPORT" or sub_cat == "AIRPORT":
        return True
    if any(
        k in cat.lower() or k in sub_cat.lower()
        for k in ("airport", "aerodrome", "airfield")
    ):
        return True
    if isinstance(tags, dict) and any(
        tags.get(k) in ("aerodrome", "terminal", "airport", "international")
        for k in ("aeroway", "amenity", "building", "public_transport")
    ):
        return True

    from app.services.transit_fare_service import GENERIC_AIRPORT_KEYWORDS

    return any(kw in name for kw in GENERIC_AIRPORT_KEYWORDS) or "aerodrome" in name


async def get_detailed_transit_leg(
    origin: dict[str, Any],
    destination: dict[str, Any],
    departure_iso: str | None = None,
    is_airport_leg: bool = False,
    date_time_type: int = 1,
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

    if not is_airport_leg:
        is_airport_leg = is_poi_airport(origin) or is_poi_airport(destination)

    if not departure_iso:
        departure_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")

    city_clean = str(origin.get("city") or destination.get("city") or "").strip()
    try:
        from app.services.transitous_service import TransitousService

        transitous_leg = await TransitousService.plan_transit_route(
            origin=origin,
            destination=destination,
            departure_iso=departure_iso,
            date_time_type=date_time_type,
            city=city_clean,
            is_airport_leg=is_airport_leg,
        )
        if transitous_leg is not None and transitous_leg.steps:
            finder = get_gtfs_route_finder(city_clean)
            if finder and finder.translations:
                for s in transitous_leg.steps:
                    if s.station_name:
                        en_sta = finder.translations.get(("stops", s.station_name), "")
                        if en_sta and en_sta != s.station_name:
                            s.station_name = f"{en_sta} ({s.station_name})"
                    if s.transit_line:
                        en_line = finder.translations.get(
                            ("routes", s.transit_line), ""
                        )
                        if en_line and en_line != s.transit_line:
                            s.transit_line = f"{en_line} ({s.transit_line})"
                    if s.headsign:
                        en_head = finder.translations.get(("stops", s.headsign), "")
                        if en_head and en_head != s.headsign:
                            s.headsign = f"{en_head} ({s.headsign})"
            return transitous_leg
    except Exception as transitous_err:
        logger.debug(f"Transitous routing skipped/fallback: {transitous_err}")

    req_payload = {
        "locations": [
            {"lat": orig_lat, "lon": orig_lon},
            {"lat": dest_lat, "lon": dest_lon},
        ],
        "costing": "multimodal",
        "date_time": {
            "type": date_time_type,  # 1 = depart at, 2 = arrive by
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
    used_fallback_costing: str | None = None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{VALHALLA_URL}/route", json=req_payload)
            if resp.status_code == 400:
                dist_km = calculate_haversine_km(
                    float(orig_lat), float(orig_lon), float(dest_lat), float(dest_lon)
                )
                if is_airport_leg:
                    for candidate in ["bus", "auto", "pedestrian"]:
                        fb_payload = {
                            "locations": req_payload["locations"],
                            "costing": candidate,
                            "directions_options": {"units": "kilometers"},
                        }
                        resp = await client.post(
                            f"{VALHALLA_URL}/route", json=fb_payload
                        )
                        if resp.status_code == 200:
                            used_fallback_costing = candidate
                            break
                elif dist_km <= 1.5:
                    for candidate in ["pedestrian", "bus", "auto"]:
                        fb_payload = {
                            "locations": req_payload["locations"],
                            "costing": candidate,
                            "directions_options": {"units": "kilometers"},
                        }
                        resp = await client.post(
                            f"{VALHALLA_URL}/route", json=fb_payload
                        )
                        if resp.status_code == 200:
                            used_fallback_costing = candidate
                            break
                else:
                    for candidate in ["bus", "auto", "pedestrian"]:
                        fb_payload = {
                            "locations": req_payload["locations"],
                            "costing": candidate,
                            "directions_options": {"units": "kilometers"},
                        }
                        resp = await client.post(
                            f"{VALHALLA_URL}/route", json=fb_payload
                        )
                        if resp.status_code == 200:
                            used_fallback_costing = candidate
                            break

            if resp.status_code == 400:
                city_name = str(
                    origin.get("city") or destination.get("city") or ""
                ).strip()
                return synthesize_fallback_transit_leg(
                    origin=origin,
                    destination=destination,
                    city=city_name,
                    is_airport_leg=is_airport_leg,
                )

            resp.raise_for_status()
            data = resp.json()

            trip = data.get("trip", {})
            summary = trip.get("summary", {})
            total_duration_mins = max(1, int(round(summary.get("time", 900) / 60)))

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

            if used_fallback_costing in ("bus", "auto"):
                city_name = str(
                    origin.get("city") or destination.get("city") or ""
                ).strip()
                return synthesize_fallback_transit_leg(
                    origin=origin,
                    destination=destination,
                    city=city_name,
                    is_airport_leg=is_airport_leg,
                    geometry=full_geometry,
                    duration_mins=total_duration_mins,
                )

            for leg in legs:
                leg_shape = leg.get("shape", "")
                leg_coords = decode_polyline6(leg_shape) if leg_shape else []

                for m_idx, m in enumerate(leg.get("maneuvers", [])):
                    instruction = m.get("instruction", "")
                    m_time_mins = max(1, int(round(m.get("time", 60) / 60)))
                    m_dist_km = round(m.get("length", 0.0), 2)
                    transit_info = m.get("transit_info")

                    step_type = "walk"
                    line_name = None
                    headsign = None
                    station = None

                    city_clean = str(
                        origin.get("city") or destination.get("city") or ""
                    ).strip()
                    finder = get_gtfs_route_finder(city_clean)

                    if transit_info:
                        has_transit_step = True
                        step_type = "transit"
                        raw_line = transit_info.get("short_name") or transit_info.get(
                            "long_name"
                        )
                        raw_headsign = transit_info.get("headsign")
                        stops_list = transit_info.get("transit_stops", [])
                        raw_station = (
                            stops_list[0].get("name")
                            if stops_list
                            else transit_info.get("description")
                        )

                        if finder and finder.translations:
                            en_line = finder.translations.get(("routes", raw_line), "")
                            line_name = (
                                f"{en_line} ({raw_line})"
                                if en_line and en_line != raw_line
                                else (en_line or raw_line)
                            )
                            en_head = finder.translations.get(
                                ("stops", raw_headsign), ""
                            )
                            headsign = (
                                f"{en_head} ({raw_headsign})"
                                if en_head and en_head != raw_headsign
                                else (en_head or raw_headsign)
                            )
                            en_sta = finder.translations.get(("stops", raw_station), "")
                            station = (
                                f"{en_sta} ({raw_station})"
                                if en_sta and en_sta != raw_station
                                else (en_sta or raw_station)
                            )
                        else:
                            line_name = raw_line
                            headsign = raw_headsign
                            station = raw_station or "Transit Stop"
                    elif used_fallback_costing == "pedestrian":
                        step_type = "walk"

                    # Translate Japanese / foreign station names in pedestrian enter/exit instructions
                    if finder and finder.translations and instruction:
                        sorted_trans = sorted(
                            finder.translations.items(),
                            key=lambda x: len(x[0][1]),
                            reverse=True,
                        )
                        for (_, val), trans in sorted_trans:
                            if val in instruction and trans != val:
                                instruction = instruction.replace(
                                    val, f"{trans} ({val})"
                                )
                                break

                    # Safeguard: prevent vehicle driving instructions from leaking into passenger steps
                    if step_type == "transit" and instruction.lower().startswith(
                        "drive "
                    ):
                        instruction = f"Take transit towards {headsign or dest_name}"
                    elif step_type == "walk" and instruction.lower().startswith(
                        "drive "
                    ):
                        instruction = f"Walk towards {headsign or dest_name}"

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


async def calculate_point_to_point_directions(
    origin: dict[str, Any],
    destination: dict[str, Any],
    departure_iso: str | None = None,
    date_time_type: int = 1,
    city: str | None = None,
) -> dict[str, Any]:
    """
    Calculates multimodal public transit and pedestrian routes between origin and destination.
    Evaluates both routes and applies the Reasonable Route Rule to select the primary
    recommended route and provide the other as an alternative.
    """
    if city:
        if "city" not in origin or not origin["city"]:
            origin["city"] = city
        if "city" not in destination or not destination["city"]:
            destination["city"] = city

    transit_res, walk_res = await asyncio.gather(
        get_detailed_transit_leg(
            origin,
            destination,
            departure_iso=departure_iso,
            date_time_type=date_time_type,
        ),
        get_detailed_walking_leg(origin, destination),
        return_exceptions=True,
    )

    # Handle fallback if walking raised an exception
    if isinstance(walk_res, Exception):
        orig_lat = origin.get("location", {}).get("latitude", origin.get("lat", 0.0))
        orig_lon = origin.get("location", {}).get("longitude", origin.get("lon", 0.0))
        orig_name = origin.get("name", "Origin")
        dest_name = destination.get("name", "Destination")
        dest_lat = destination.get("location", {}).get(
            "latitude", destination.get("lat", 0.0)
        )
        dest_lon = destination.get("location", {}).get(
            "longitude", destination.get("lon", 0.0)
        )
        dist_km = calculate_haversine_km(
            float(orig_lat), float(orig_lon), float(dest_lat), float(dest_lon)
        )
        est_walk_mins = max(1, int(round((dist_km / 4.5) * 60)))

        # Build progressive turn maneuvers when offline routing tiles are not loaded
        walk_steps: list[TransitStep] = []
        if dist_km <= 0.6:
            walk_steps.append(
                TransitStep(
                    type="walk",
                    instruction=f"Walk directly {int(dist_km * 1000)}m towards {dest_name}",
                    duration_mins=est_walk_mins,
                    distance_km=round(dist_km, 2),
                    geometry=[
                        [float(orig_lat), float(orig_lon)],
                        [float(dest_lat), float(dest_lon)],
                    ],
                )
            )
        else:
            # Multi-segment pedestrian steps
            # 1. Depart origin
            d1_km = round(min(0.3, dist_km * 0.15), 2)
            t1 = max(2, int(round(d1_km / 4.5 * 60)))
            lat1 = float(orig_lat) + (float(dest_lat) - float(orig_lat)) * 0.15
            lon1 = float(orig_lon) + (float(dest_lon) - float(orig_lon)) * 0.15
            walk_steps.append(
                TransitStep(
                    type="walk",
                    instruction=f"Depart {orig_name} and walk {int(d1_km * 1000)}m towards the main pedestrian avenue",
                    duration_mins=t1,
                    distance_km=d1_km,
                    geometry=[[float(orig_lat), float(orig_lon)], [lat1, lon1]],
                )
            )
            # 2. Main thoroughfare stretch
            d2_km = round(dist_km - d1_km - min(0.3, dist_km * 0.15), 2)
            t2 = max(
                3,
                est_walk_mins
                - t1
                - max(2, int(round(min(0.3, dist_km * 0.15) / 4.5 * 60))),
            )
            lat2 = float(orig_lat) + (float(dest_lat) - float(orig_lat)) * 0.85
            lon2 = float(orig_lon) + (float(dest_lon) - float(orig_lon)) * 0.85
            walk_steps.append(
                TransitStep(
                    type="walk",
                    instruction=f"Continue along the pedestrian street towards {dest_name}",
                    duration_mins=t2,
                    distance_km=d2_km,
                    geometry=[[lat1, lon1], [lat2, lon2]],
                )
            )
            # 3. Final approach
            d3_km = round(dist_km - d1_km - d2_km, 2)
            t3 = max(1, est_walk_mins - t1 - t2)
            walk_steps.append(
                TransitStep(
                    type="walk",
                    instruction=f"Turn towards {dest_name} and arrive at destination ({int(d3_km * 1000)}m)",
                    duration_mins=t3,
                    distance_km=d3_km,
                    geometry=[[lat2, lon2], [float(dest_lat), float(dest_lon)]],
                )
            )

        walk_leg = TransitLeg(
            duration_mins=est_walk_mins,
            cost_eur=0.0,
            cost_is_estimated=False,
            mode="pedestrian",
            steps=walk_steps,
            geometry=[
                [float(orig_lat), float(orig_lon)],
                [float(dest_lat), float(dest_lon)],
            ],
        )
    else:
        walk_leg = walk_res

    # Handle fallback if transit raised an exception
    if isinstance(transit_res, Exception):
        transit_leg = None
    else:
        transit_leg = transit_res

    # Check whether the transit leg contains actual transit steps
    has_transit_steps = False
    if transit_leg and transit_leg.steps:
        has_transit_steps = any(
            step.type in ("transit", "transit_board")
            or bool(getattr(step, "transit_line", None))
            for step in transit_leg.steps
        )

    # Apply the Reasonable Route Rule
    if not transit_leg or not has_transit_steps:
        primary_leg = walk_leg
        alternative_leg = None
        primary_mode = "pedestrian"
        recommendation_reason = "Direct walking route is recommended (no faster transit line available for this path)."
    else:
        walk_mins = walk_leg.duration_mins
        transit_mins = transit_leg.duration_mins

        if walk_mins <= 15:
            # Short walk: direct walking is faster/more reasonable than waiting for transit
            primary_leg = walk_leg
            alternative_leg = transit_leg
            primary_mode = "pedestrian"
            recommendation_reason = (
                f"Direct walking ({walk_mins} min) is recommended for short distances "
                f"to avoid waiting for transit ({transit_mins} min)."
            )
        elif walk_mins > 20:
            # Long walk: transit is strongly preferred (e.g. 1.5 hours walk vs 25 min transit)
            primary_leg = transit_leg
            alternative_leg = walk_leg
            primary_mode = "transit"
            diff = walk_mins - transit_mins
            if diff > 0:
                recommendation_reason = f"Public transit saves {diff} minutes compared to a {walk_mins}-minute walk."
            else:
                recommendation_reason = f"Public transit ({transit_mins} min) is recommended over a long {walk_mins}-minute walk."
        else:
            # 15 < walk_mins <= 20
            if transit_mins <= walk_mins - 4:
                primary_leg = transit_leg
                alternative_leg = walk_leg
                primary_mode = "transit"
                recommendation_reason = f"Public transit is faster ({transit_mins} min vs {walk_mins} min walk)."
            else:
                primary_leg = walk_leg
                alternative_leg = transit_leg
                primary_mode = "pedestrian"
                recommendation_reason = f"Direct walking is direct and comparable in travel time ({walk_mins} min vs {transit_mins} min transit)."

    return {
        "primary_mode": primary_mode,
        "primary_leg": primary_leg,
        "alternative_leg": alternative_leg,
        "recommendation_reason": recommendation_reason,
    }


def synthesize_fallback_transit_leg(
    origin: dict[str, Any],
    destination: dict[str, Any],
    city: str | None = None,
    is_airport_leg: bool = False,
    geometry: list[list[float]] | None = None,
    duration_mins: int | None = None,
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
        geometry
        if geometry
        else (
            [[float(orig_lat), float(orig_lon)], [float(dest_lat), float(dest_lon)]]
            if orig_lat is not None
            and orig_lon is not None
            and dest_lat is not None
            and dest_lon is not None
            else []
        )
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
    dur_mins = (
        duration_mins
        if duration_mins is not None
        else max(15, int(dist_km / 22.0 * 60) + 8)
    )
    walk1_dist = round(min(0.4, dist_km * 0.1), 2)
    walk2_dist = round(min(0.3, dist_km * 0.08), 2)
    transit_dist = round(max(0.5, dist_km - walk1_dist - walk2_dist), 2)

    gtfs_finder = get_gtfs_route_finder(city_name)
    gtfs_res = (
        gtfs_finder.find_route(
            float(orig_lat), float(orig_lon), float(dest_lat), float(dest_lon)
        )
        if gtfs_finder and orig_lat is not None and dest_lat is not None
        else None
    )

    if gtfs_res and gtfs_res.get("mode") == "direct":
        b_stop_obj = gtfs_res["board_stop"]
        a_stop_obj = gtfs_res["alight_stop"]
        b_stop = b_stop_obj["display_name"]
        a_stop = a_stop_obj["display_name"]
        r_name = gtfs_res["route_1"]["name"]
        r_type = gtfs_res["route_1"].get("type", "Metro")
        w1_km = gtfs_res.get("walk1_km", walk1_dist)
        w2_km = gtfs_res.get("walk2_km", walk2_dist)
        w1_dur = max(2, int(round(w1_km / 4.5 * 60)))
        w2_dur = max(2, int(round(w2_km / 4.5 * 60)))
        t_dur = max(5, dur_mins - w1_dur - w2_dur)

        # Build transit geometry along the actual intermediate station coordinates
        inter_stops = gtfs_res.get("intermediate_stops", [b_stop_obj, a_stop_obj])
        inter_geom = [
            [float(s["lat"]), float(s["lon"])]
            for s in inter_stops
            if "lat" in s and "lon" in s
        ]
        if len(inter_geom) < 2:
            inter_geom = [
                [float(b_stop_obj["lat"]), float(b_stop_obj["lon"])],
                [float(a_stop_obj["lat"]), float(a_stop_obj["lon"])],
            ]

        walk1_geom = (
            [
                [float(orig_lat), float(orig_lon)],
                [float(b_stop_obj["lat"]), float(b_stop_obj["lon"])],
            ]
            if orig_lat is not None and orig_lon is not None
            else []
        )

        walk2_geom = (
            [
                [float(a_stop_obj["lat"]), float(a_stop_obj["lon"])],
                [float(dest_lat), float(dest_lon)],
            ]
            if dest_lat is not None and dest_lon is not None
            else []
        )

        # Full multi-segment geometry: Origin -> Board Station -> ... Intermediate Stations ... -> Alight Station -> Destination
        leg_geom: list[list[float]] = []
        if walk1_geom:
            leg_geom.extend(walk1_geom)
        for pt in inter_geom:
            if not leg_geom or leg_geom[-1] != pt:
                leg_geom.append(pt)
        if walk2_geom:
            for pt in walk2_geom:
                if not leg_geom or leg_geom[-1] != pt:
                    leg_geom.append(pt)
        fallback_geom = leg_geom

        inter_names = [
            s.get("display_name", s.get("raw_name", "")) for s in inter_stops[1:-1]
        ]
        board_instruction = f"Board {r_name} ({r_type}) at {b_stop} towards {a_stop}"
        if inter_names:
            board_instruction += f" ({len(inter_stops) - 1} stops)"

        steps = [
            TransitStep(
                type="walk",
                instruction=f"Depart {orig_name} and walk {int(w1_km * 1000)}m to {b_stop}",
                duration_mins=w1_dur,
                distance_km=w1_km,
                station_name=b_stop,
                geometry=walk1_geom,
            ),
            TransitStep(
                type="transit_board",
                instruction=board_instruction,
                duration_mins=t_dur,
                distance_km=transit_dist,
                transit_line=r_name,
                headsign=a_stop,
                station_name=b_stop,
                geometry=inter_geom,
                intermediate_stops=inter_names,
            ),
            TransitStep(
                type="transit_alight",
                instruction=f"Alight at {a_stop}",
                duration_mins=1,
                distance_km=0.0,
                station_name=a_stop,
                geometry=[[float(a_stop_obj["lat"]), float(a_stop_obj["lon"])]],
            ),
            TransitStep(
                type="walk",
                instruction=f"Walk {int(w2_km * 1000)}m from {a_stop} to {dest_name}",
                duration_mins=w2_dur,
                distance_km=w2_km,
                station_name=a_stop,
                geometry=walk2_geom,
            ),
        ]
    elif gtfs_res and gtfs_res.get("mode") == "transfer":
        b_stop_obj = gtfs_res["board_stop"]
        t1_stop_obj = gtfs_res.get("transfer_stop_1") or gtfs_res["transfer_stop"]
        t2_stop_obj = gtfs_res.get("transfer_stop_2") or gtfs_res["transfer_stop"]
        a_stop_obj = gtfs_res["alight_stop"]
        b_stop = b_stop_obj["display_name"]
        t1_stop = t1_stop_obj["display_name"]
        t2_stop = t2_stop_obj["display_name"]
        a_stop = a_stop_obj["display_name"]
        r1_name = gtfs_res["route_1"]["name"]
        r1_type = gtfs_res["route_1"].get("type", "Metro")
        r2_name = gtfs_res["route_2"]["name"]
        r2_type = gtfs_res["route_2"].get("type", "Metro")
        w1_km = gtfs_res.get("walk1_km", walk1_dist)
        w2_km = gtfs_res.get("walk2_km", walk2_dist)
        walk_transfer_km = gtfs_res.get("walk_transfer_km", 0.0)
        transfer_walk_mins = (
            max(1, int(round(walk_transfer_km / 4.5 * 60)))
            if walk_transfer_km > 0.03
            else 0
        )
        w1_dur = max(2, int(round(w1_km / 4.5 * 60)))
        w2_dur = max(2, int(round(w2_km / 4.5 * 60)))
        remaining_dur = max(8, dur_mins - w1_dur - w2_dur - transfer_walk_mins - 3)
        t1_dur = max(4, int(remaining_dur * 0.5))
        t2_dur = max(4, remaining_dur - t1_dur)
        t1_dist = round(transit_dist * 0.5, 2)
        t2_dist = round(max(0.2, transit_dist - t1_dist), 2)

        inter1 = gtfs_res.get("intermediate_stops_1", [b_stop_obj, t1_stop_obj])
        inter2 = gtfs_res.get("intermediate_stops_2", [t2_stop_obj, a_stop_obj])
        g1 = [
            [float(s["lat"]), float(s["lon"])]
            for s in inter1
            if "lat" in s and "lon" in s
        ]
        g2 = [
            [float(s["lat"]), float(s["lon"])]
            for s in inter2
            if "lat" in s and "lon" in s
        ]

        walk1_geom = (
            [
                [float(orig_lat), float(orig_lon)],
                [float(b_stop_obj["lat"]), float(b_stop_obj["lon"])],
            ]
            if orig_lat is not None and orig_lon is not None
            else []
        )

        walk2_geom = (
            [
                [float(a_stop_obj["lat"]), float(a_stop_obj["lon"])],
                [float(dest_lat), float(dest_lon)],
            ]
            if dest_lat is not None and dest_lon is not None
            else []
        )

        leg_geom = []
        if walk1_geom:
            leg_geom.extend(walk1_geom)
        for pt in g1:
            if not leg_geom or leg_geom[-1] != pt:
                leg_geom.append(pt)
        if walk_transfer_km > 0.03:
            leg_geom.append([float(t2_stop_obj["lat"]), float(t2_stop_obj["lon"])])
        for pt in g2:
            if not leg_geom or leg_geom[-1] != pt:
                leg_geom.append(pt)
        if walk2_geom:
            for pt in walk2_geom:
                if not leg_geom or leg_geom[-1] != pt:
                    leg_geom.append(pt)
        fallback_geom = leg_geom

        inter1_names = [
            s.get("display_name", s.get("raw_name", "")) for s in inter1[1:-1]
        ]
        inter2_names = [
            s.get("display_name", s.get("raw_name", "")) for s in inter2[1:-1]
        ]

        steps = [
            TransitStep(
                type="walk",
                instruction=f"Depart {orig_name} and walk {int(w1_km * 1000)}m to {b_stop}",
                duration_mins=w1_dur,
                distance_km=w1_km,
                station_name=b_stop,
                geometry=walk1_geom,
            ),
            TransitStep(
                type="transit_board",
                instruction=f"Board {r1_name} ({r1_type}) at {b_stop} towards {t1_stop}"
                + (f" ({len(inter1) - 1} stops)" if inter1_names else ""),
                duration_mins=t1_dur,
                distance_km=t1_dist,
                transit_line=r1_name,
                headsign=t1_stop,
                station_name=b_stop,
                geometry=g1,
                intermediate_stops=inter1_names,
            ),
        ]
        if walk_transfer_km > 0.03:
            steps.extend(
                [
                    TransitStep(
                        type="transit_alight",
                        instruction=f"Alight at {t1_stop}",
                        duration_mins=1,
                        distance_km=0.0,
                        station_name=t1_stop,
                        geometry=[
                            [float(t1_stop_obj["lat"]), float(t1_stop_obj["lon"])]
                        ],
                    ),
                    TransitStep(
                        type="walk",
                        instruction=f"Walk {int(walk_transfer_km * 1000)}m from {t1_stop} to {t2_stop} to transfer lines",
                        duration_mins=transfer_walk_mins,
                        distance_km=walk_transfer_km,
                        station_name=t1_stop,
                        geometry=[
                            [float(t1_stop_obj["lat"]), float(t1_stop_obj["lon"])],
                            [float(t2_stop_obj["lat"]), float(t2_stop_obj["lon"])],
                        ],
                    ),
                    TransitStep(
                        type="transit_board",
                        instruction=f"Board {r2_name} ({r2_type}) at {t2_stop} towards {a_stop}"
                        + (f" ({len(inter2) - 1} stops)" if inter2_names else ""),
                        duration_mins=t2_dur,
                        distance_km=t2_dist,
                        transit_line=r2_name,
                        headsign=a_stop,
                        station_name=t2_stop,
                        geometry=g2,
                        intermediate_stops=inter2_names,
                    ),
                ]
            )
        else:
            steps.append(
                TransitStep(
                    type="transit_transfer",
                    instruction=f"Transfer at {t1_stop} to {r2_name} ({r2_type}) towards {a_stop}"
                    + (f" ({len(inter2) - 1} stops)" if inter2_names else ""),
                    duration_mins=t2_dur,
                    distance_km=t2_dist,
                    transit_line=r2_name,
                    headsign=a_stop,
                    station_name=t1_stop,
                    geometry=g2,
                    intermediate_stops=inter2_names,
                )
            )

        steps.extend(
            [
                TransitStep(
                    type="transit_alight",
                    instruction=f"Alight at {a_stop}",
                    duration_mins=1,
                    distance_km=0.0,
                    station_name=a_stop,
                    geometry=[[float(a_stop_obj["lat"]), float(a_stop_obj["lon"])]],
                ),
                TransitStep(
                    type="walk",
                    instruction=f"Walk {int(w2_km * 1000)}m from {a_stop} to {dest_name}",
                    duration_mins=w2_dur,
                    distance_km=w2_km,
                    station_name=a_stop,
                    geometry=walk2_geom,
                ),
            ]
        )
    elif gtfs_res and gtfs_res.get("mode") == "nearest_stations":
        b_stop_obj = gtfs_res["board_stop"]
        a_stop_obj = gtfs_res["alight_stop"]
        b_stop = b_stop_obj["display_name"]
        a_stop = a_stop_obj["display_name"]
        r_name = gtfs_res["route_1"]["name"]
        r_type = gtfs_res["route_1"].get("type", "Metro")
        w1_km = gtfs_res.get("walk1_km", walk1_dist)
        w2_km = gtfs_res.get("walk2_km", walk2_dist)
        w1_dur = max(2, int(round(w1_km / 4.5 * 60)))
        w2_dur = max(2, int(round(w2_km / 4.5 * 60)))
        t_dur = max(5, dur_mins - w1_dur - w2_dur)

        walk1_geom = (
            [
                [float(orig_lat), float(orig_lon)],
                [float(b_stop_obj["lat"]), float(b_stop_obj["lon"])],
            ]
            if orig_lat is not None and orig_lon is not None
            else []
        )

        walk2_geom = (
            [
                [float(a_stop_obj["lat"]), float(a_stop_obj["lon"])],
                [float(dest_lat), float(dest_lon)],
            ]
            if dest_lat is not None and dest_lon is not None
            else []
        )

        transit_geom = [
            [float(b_stop_obj["lat"]), float(b_stop_obj["lon"])],
            [float(a_stop_obj["lat"]), float(a_stop_obj["lon"])],
        ]

        leg_geom = []
        if walk1_geom:
            leg_geom.extend(walk1_geom)
        for pt in transit_geom:
            if not leg_geom or leg_geom[-1] != pt:
                leg_geom.append(pt)
        if walk2_geom:
            for pt in walk2_geom:
                if not leg_geom or leg_geom[-1] != pt:
                    leg_geom.append(pt)
        fallback_geom = leg_geom

        steps = [
            TransitStep(
                type="walk",
                instruction=f"Depart {orig_name} and walk {int(w1_km * 1000)}m to {b_stop}",
                duration_mins=w1_dur,
                distance_km=w1_km,
                station_name=b_stop,
                geometry=walk1_geom,
            ),
            TransitStep(
                type="transit_board",
                instruction=f"Board {r_name} ({r_type}) at {b_stop} towards {a_stop}",
                duration_mins=t_dur,
                distance_km=transit_dist,
                transit_line=r_name,
                headsign=a_stop,
                station_name=b_stop,
                geometry=transit_geom,
            ),
            TransitStep(
                type="transit_alight",
                instruction=f"Alight at {a_stop}",
                duration_mins=1,
                distance_km=0.0,
                station_name=a_stop,
                geometry=[[float(a_stop_obj["lat"]), float(a_stop_obj["lon"])]],
            ),
            TransitStep(
                type="walk",
                instruction=f"Walk {int(w2_km * 1000)}m from {a_stop} to {dest_name}",
                duration_mins=w2_dur,
                distance_km=w2_km,
                station_name=a_stop,
                geometry=walk2_geom,
            ),
        ]
    else:
        p1_lat = (
            float(orig_lat) + (float(dest_lat) - float(orig_lat)) * 0.15
            if orig_lat is not None and dest_lat is not None
            else 0.0
        )
        p1_lon = (
            float(orig_lon) + (float(dest_lon) - float(orig_lon)) * 0.15
            if orig_lon is not None and dest_lon is not None
            else 0.0
        )
        p2_lat = (
            float(orig_lat) + (float(dest_lat) - float(orig_lat)) * 0.85
            if orig_lat is not None and dest_lat is not None
            else 0.0
        )
        p2_lon = (
            float(orig_lon) + (float(dest_lon) - float(orig_lon)) * 0.85
            if orig_lon is not None and dest_lon is not None
            else 0.0
        )

        w1_geom = (
            [[float(orig_lat), float(orig_lon)], [p1_lat, p1_lon]]
            if orig_lat is not None and orig_lon is not None
            else []
        )
        t_geom = (
            [[p1_lat, p1_lon], [p2_lat, p2_lon]] if p1_lat and p2_lat else fallback_geom
        )
        w2_geom = (
            [[p2_lat, p2_lon], [float(dest_lat), float(dest_lon)]]
            if dest_lat is not None and dest_lon is not None
            else []
        )

        leg_geom = []
        if w1_geom:
            leg_geom.extend(w1_geom)
        for pt in t_geom:
            if not leg_geom or leg_geom[-1] != pt:
                leg_geom.append(pt)
        if w2_geom:
            for pt in w2_geom:
                if not leg_geom or leg_geom[-1] != pt:
                    leg_geom.append(pt)
        fallback_geom = leg_geom

        steps = [
            TransitStep(
                type="walk",
                instruction=f"Depart {orig_name} and walk {int(walk1_dist * 1000)}m to the nearest public transit station",
                duration_mins=5,
                distance_km=walk1_dist,
                station_name=f"Station near {orig_name}",
                geometry=w1_geom,
            ),
            TransitStep(
                type="transit_board",
                instruction=f"Board public transit towards {dest_name}",
                duration_mins=max(7, dur_mins - 9),
                distance_km=transit_dist,
                transit_line="Transit",
                headsign=dest_name,
                station_name=f"Station near {orig_name}",
                geometry=t_geom,
            ),
            TransitStep(
                type="transit_alight",
                instruction=f"Alight at station near {dest_name}",
                duration_mins=1,
                distance_km=0.0,
                station_name=f"Station near {dest_name}",
                geometry=[[p2_lat, p2_lon]],
            ),
            TransitStep(
                type="walk",
                instruction=f"Walk {int(walk2_dist * 1000)}m to {dest_name}",
                duration_mins=4,
                distance_km=walk2_dist,
                station_name=f"Station near {dest_name}",
                geometry=w2_geom,
            ),
        ]

    fare_res = TransitFareService.calculate_transit_leg_fare(
        city_name,
        steps,
        is_airport_leg=is_airport,
        origin=origin,
        destination=destination,
    )

    fare_currency = (fare_res.currency or "EUR").upper()
    total_cost_eur = fare_res.total_cost
    if fare_currency != "EUR" and fare_res.total_cost > 0:
        try:
            from app.engine.currency import convert_currency

            total_cost_eur = convert_currency(
                fare_res.total_cost, from_currency=fare_currency, to_currency="EUR"
            )
        except Exception:
            pass

    return TransitLeg(
        duration_mins=dur_mins,
        cost_eur=total_cost_eur,
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

            is_airport_leg = is_poi_airport(curr_poi) or is_poi_airport(prev_poi)

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
                # Public transit leg: provide realistic transit with corridor geometry from Valhalla
                leg_geometry: list[list[float]] = []
                trans_dur = (
                    int(round(float(existing_transit.get("duration_mins", 20))))
                    if isinstance(existing_transit, dict)
                    and existing_transit.get("duration_mins") is not None
                    else 20
                )

                if (
                    p_lat is not None
                    and p_lon is not None
                    and c_lat is not None
                    and c_lon is not None
                ):
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            c_resp = await client.post(
                                f"{VALHALLA_URL}/route",
                                json={
                                    "locations": [
                                        {"lat": float(p_lat), "lon": float(p_lon)},
                                        {"lat": float(c_lat), "lon": float(c_lon)},
                                    ],
                                    "costing": "bus",
                                    "directions_options": {"units": "kilometers"},
                                },
                            )
                            if c_resp.status_code == 200:
                                c_trip = c_resp.json().get("trip", {})
                                c_summary = c_trip.get("summary", {})
                                trans_dur = max(
                                    1, int(round(c_summary.get("time", 1200) / 60))
                                )
                                c_legs = c_trip.get("legs", [])
                                for cl in c_legs:
                                    cl_shape = cl.get("shape", "")
                                    cl_coords = (
                                        decode_polyline6(cl_shape) if cl_shape else []
                                    )
                                    if cl_coords:
                                        if not leg_geometry:
                                            leg_geometry.extend(cl_coords)
                                        else:
                                            leg_geometry.extend(cl_coords[1:])
                    except Exception as route_err:
                        logger.debug(f"Could not pre-fetch corridor route: {route_err}")

                synth = synthesize_fallback_transit_leg(
                    origin=prev_poi,
                    destination=curr_poi,
                    city=city,
                    is_airport_leg=is_airport_leg,
                    geometry=leg_geometry if leg_geometry else None,
                    duration_mins=trans_dur,
                )
                synth.cost_is_estimated = True
                path[k]["transit_from_previous"] = synth.model_dump(mode="json")

    return itinerary


def calculate_haversine_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    import math

    r = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


class TransitService:
    """
    Application service orchestrating transit availability, nearby station search,
    lines browsing, line detail, station inspector, and scheduled departures.
    """

    def __init__(self, repo: Any):
        self.repo = repo

    async def get_availability(self, city: str) -> dict[str, Any]:
        from datetime import datetime, timezone

        cache = await self.repo.get_transit_cache(city)
        if not cache:
            return {
                "city": city,
                "status": "NOT_REQUESTED",
                "derived_status": "NOT_REQUESTED",
                "reason": "Transit data has not been built for this city.",
                "capabilities": {},
                "agencies": [],
                "feed_valid_from": None,
                "feed_valid_to": None,
                "as_of": None,
            }

        status = cache.get("status", "PENDING")
        gtfs_status = cache.get("gtfs_status", "PENDING")
        derived_status = cache.get("derived_status", "PENDING")

        agencies = []
        build_id = cache.get("active_build_id")
        if build_id:
            agencies = await self.repo.get_agencies(city, build_id)

        now = datetime.now(timezone.utc)
        is_expired = False
        if cache.get("valid_until"):
            try:
                vu = datetime.fromisoformat(cache["valid_until"])
                if now > vu:
                    is_expired = True
            except ValueError:
                pass

        final_status = derived_status
        if derived_status == "READY" and is_expired:
            final_status = "EXPIRED"

        return {
            "city": city,
            "status": status,
            "gtfs_status": gtfs_status,
            "derived_status": final_status,
            "reason": None,
            "capabilities": cache.get("capabilities", {}),
            "agencies": agencies,
            "feed_valid_from": cache.get("feed_valid_from"),
            "feed_valid_to": cache.get("feed_valid_to"),
            "as_of": cache.get("derived_at"),
        }

    async def get_nearby_stations_for_anchors(
        self,
        city: str,
        anchors: list[dict[str, Any]],
        radius_meters: float = 800.0,
        modes: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        import math

        build_id = await self.repo.get_active_build_id(city)
        if not build_id:
            return await self._get_nearby_osm_fallback(city, anchors, radius_meters)

        valid_anchors = [
            a for a in anchors if a.get("lat") is not None and a.get("lon") is not None
        ]
        if not valid_anchors:
            return []

        lat_buf = (radius_meters + 200.0) / 111000.0
        lon_buf = (radius_meters + 200.0) / (
            111000.0 * math.cos(math.radians(valid_anchors[0]["lat"]))
        )

        all_stations_found: dict[str, dict[str, Any]] = {}

        for anchor in valid_anchors:
            a_lat = anchor["lat"]
            a_lon = anchor["lon"]
            box_stations = await self.repo.get_stations_by_bbox(
                city=city,
                build_id=build_id,
                min_lat=a_lat - lat_buf,
                min_lon=a_lon - lon_buf,
                max_lat=a_lat + lat_buf,
                max_lon=a_lon + lon_buf,
                limit=100,
            )
            for st in box_stations:
                all_stations_found[st["id"]] = st

        station_assignments: dict[str, dict[str, Any]] = {}
        for st_id, st in all_stations_found.items():
            if modes:
                st_modes = {line["mode"].lower() for line in st.get("lines", [])}
                if not any(m.lower() in st_modes for m in modes):
                    continue

            best_anchor = None
            min_dist = float("inf")
            for anchor in valid_anchors:
                dist = calculate_haversine_meters(
                    anchor["lat"], anchor["lon"], st["lat"], st["lon"]
                )
                if dist < min_dist:
                    min_dist = dist
                    best_anchor = anchor

            if best_anchor and min_dist <= radius_meters:
                walk_mins = max(1, round(min_dist / 80.0))
                station_assignments[st_id] = {
                    "station": st,
                    "anchor_id": best_anchor["id"],
                    "anchor_name": best_anchor["name"],
                    "anchor_type": best_anchor.get("type", "stop"),
                    "distance_meters": round(min_dist),
                    "walk_mins": walk_mins,
                }

        grouped: dict[str, dict[str, Any]] = {}
        for anchor in valid_anchors:
            grouped[anchor["id"]] = {
                "anchor_id": anchor["id"],
                "anchor_name": anchor["name"],
                "anchor_type": anchor.get("type", "stop"),
                "stations": [],
            }

        for st_id, item in station_assignments.items():
            a_id = item["anchor_id"]
            if a_id in grouped:
                st_data = dict(item["station"])
                st_data["distance_meters"] = item["distance_meters"]
                st_data["walk_mins"] = item["walk_mins"]
                grouped[a_id]["stations"].append(st_data)

        out = []
        for g in grouped.values():
            g["stations"].sort(key=lambda s: s["distance_meters"])
            if g["stations"]:
                out.append(g)

        return out

    async def _get_nearby_osm_fallback(
        self, city: str, anchors: list[dict[str, Any]], radius_meters: float
    ) -> list[dict[str, Any]]:
        import math

        valid_anchors = [
            a for a in anchors if a.get("lat") is not None and a.get("lon") is not None
        ]
        if not valid_anchors:
            return []

        lat_buf = (radius_meters + 200.0) / 111000.0
        lon_buf = (radius_meters + 200.0) / (
            111000.0 * math.cos(math.radians(valid_anchors[0]["lat"]))
        )

        all_osm: dict[str, dict[str, Any]] = {}
        for anchor in valid_anchors:
            osm_stations = await self.repo.get_osm_stations_by_bbox(
                city=city,
                min_lat=anchor["lat"] - lat_buf,
                min_lon=anchor["lon"] - lon_buf,
                max_lat=anchor["lat"] + lat_buf,
                max_lon=anchor["lon"] + lon_buf,
                limit=50,
            )
            for st in osm_stations:
                all_osm[st["id"]] = st

        grouped: dict[str, dict[str, Any]] = {}
        for anchor in valid_anchors:
            grouped[anchor["id"]] = {
                "anchor_id": anchor["id"],
                "anchor_name": anchor["name"],
                "anchor_type": anchor.get("type", "stop"),
                "stations": [],
            }

        for st in all_osm.values():
            best_anchor = None
            min_dist = float("inf")
            for anchor in valid_anchors:
                dist = calculate_haversine_meters(
                    anchor["lat"], anchor["lon"], st["lat"], st["lon"]
                )
                if dist < min_dist:
                    min_dist = dist
                    best_anchor = anchor

            if best_anchor and min_dist <= radius_meters:
                walk_mins = max(1, round(min_dist / 80.0))
                st_copy = dict(st)
                st_copy["distance_meters"] = round(min_dist)
                st_copy["walk_mins"] = walk_mins
                st_copy["lines"] = []
                grouped[best_anchor["id"]]["stations"].append(st_copy)

        out = []
        for g in grouped.values():
            g["stations"].sort(key=lambda s: s["distance_meters"])
            if g["stations"]:
                out.append(g)
        return out

    async def get_lines(
        self, city: str, mode: str | None = None
    ) -> list[dict[str, Any]]:
        build_id = await self.repo.get_active_build_id(city)
        if not build_id:
            return []
        return await self.repo.get_lines(city, build_id, mode=mode)

    async def get_line_detail(self, city: str, line_id: str) -> dict[str, Any] | None:
        build_id = await self.repo.get_active_build_id(city)
        if not build_id:
            return None
        return await self.repo.get_line_detail(city, build_id, line_id)

    async def get_station_detail(
        self, city: str, station_id: str
    ) -> dict[str, Any] | None:
        build_id = await self.repo.get_active_build_id(city)
        if not build_id:
            return None
        st_data = await self.repo.get_station_detail(city, build_id, station_id)
        if not st_data:
            return None

        # Dynamically enrich transit stations with authentic photos from Wikimedia
        try:
            from app.services.wikimedia_photo_resolver import WikimediaPhotoResolver

            st_name = st_data.get("name") or station_id
            st_orig = st_data.get("original_name")
            query_name = (
                f"{st_name} Station" if "station" not in st_name.lower() else st_name
            )
            photos, _ = await WikimediaPhotoResolver.resolve_photos(
                poi_id=f"gtfs:{city}:{st_data.get('id', station_id)}",
                name=query_name,
                city=city,
            )
            if not photos and st_orig:
                photos, _ = await WikimediaPhotoResolver.resolve_photos(
                    poi_id=f"gtfs:{city}:{st_data.get('id', station_id)}:orig",
                    name=st_orig,
                    city=city,
                )
            if photos:
                st_data["photos"] = [
                    p
                    if isinstance(p, dict)
                    else {
                        "url": getattr(p, "url", ""),
                        "thumbnail_url": getattr(p, "thumbnail_url", ""),
                        "caption": getattr(p, "caption", "") or f"{st_name} Station",
                        "author": getattr(p, "author", None),
                        "license_name": getattr(p, "license_name", None),
                        "license_url": getattr(p, "license_url", None),
                    }
                    for p in photos
                ]
            else:
                st_data["photos"] = []
        except (
            httpx.HTTPError,
            KeyError,
            ValueError,
            TypeError,
            AttributeError,
            IndexError,
        ) as err:
            logger.debug(f"Failed to resolve transit station photos: {err}")
            st_data["photos"] = []

        return st_data

    async def get_station_departures(
        self,
        city: str,
        station_id: str,
        target_date: str,
        target_seconds: int,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        build_id = await self.repo.get_active_build_id(city)
        if not build_id:
            return []
        return await self.repo.get_station_departures(
            city, build_id, station_id, target_date, target_seconds, limit=limit
        )

    async def get_map_stations(
        self,
        city: str,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        build_id = await self.repo.get_active_build_id(city)
        if not build_id:
            return await self.repo.get_osm_stations_by_bbox(
                city, min_lat, min_lon, max_lat, max_lon, limit=limit
            )
        return await self.repo.get_stations_by_bbox(
            city, build_id, min_lat, min_lon, max_lat, max_lon, limit=limit
        )
