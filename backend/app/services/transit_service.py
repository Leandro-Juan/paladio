import logging
import os
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
    name = str(poi.get("name") or "").lower()
    return (
        cat == "AIRPORT"
        or "airport" in cat.lower()
        or "aerodrome" in cat.lower()
        or "airport" in name
        or "aeropuerto" in name
        or "haneda" in name
        or "narita" in name
        or "barajas" in name
        or "heathrow" in name
        or "cdg" in name
    )


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

    if not is_airport_leg:
        is_airport_leg = is_poi_airport(origin) or is_poi_airport(destination)

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
                    geometry=fallback_geom,
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
                    geometry=fallback_geom,
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
        gtfs_finder = get_gtfs_route_finder(city_name)
        gtfs_res = (
            gtfs_finder.find_route(
                float(orig_lat), float(orig_lon), float(dest_lat), float(dest_lon)
            )
            if gtfs_finder and orig_lat is not None and dest_lat is not None
            else None
        )

        if gtfs_res and gtfs_res.get("mode") == "direct":
            b_stop = gtfs_res["board_stop"]["display_name"]
            a_stop = gtfs_res["alight_stop"]["display_name"]
            r_name = gtfs_res["route_1"]["name"]
            r_type = gtfs_res["route_1"].get("type", "Metro")
            w1_km = gtfs_res.get("walk1_km", walk1_dist)
            w2_km = gtfs_res.get("walk2_km", walk2_dist)
            w1_dur = max(2, int(round(w1_km / 4.5 * 60)))
            w2_dur = max(2, int(round(w2_km / 4.5 * 60)))
            t_dur = max(5, dur_mins - w1_dur - w2_dur)

            steps = [
                TransitStep(
                    type="walk",
                    instruction=f"Walk {int(w1_km * 1000)}m to {b_stop}",
                    duration_mins=w1_dur,
                    distance_km=w1_km,
                    station_name=b_stop,
                ),
                TransitStep(
                    type="transit_board",
                    instruction=f"Board {r_name} ({r_type}) at {b_stop} towards {a_stop}",
                    duration_mins=t_dur,
                    distance_km=transit_dist,
                    transit_line=r_name,
                    headsign=a_stop,
                    station_name=b_stop,
                    geometry=fallback_geom,
                ),
                TransitStep(
                    type="transit_alight",
                    instruction=f"Alight at {a_stop} and walk {int(w2_km * 1000)}m to {dest_name}",
                    duration_mins=w2_dur,
                    distance_km=w2_km,
                    station_name=a_stop,
                ),
            ]
        elif gtfs_res and gtfs_res.get("mode") == "transfer":
            b_stop = gtfs_res["board_stop"]["display_name"]
            t_stop = gtfs_res["transfer_stop"]["display_name"]
            a_stop = gtfs_res["alight_stop"]["display_name"]
            r1_name = gtfs_res["route_1"]["name"]
            r1_type = gtfs_res["route_1"].get("type", "Metro")
            r2_name = gtfs_res["route_2"]["name"]
            r2_type = gtfs_res["route_2"].get("type", "Metro")
            w1_km = gtfs_res.get("walk1_km", walk1_dist)
            w2_km = gtfs_res.get("walk2_km", walk2_dist)
            w1_dur = max(2, int(round(w1_km / 4.5 * 60)))
            w2_dur = max(2, int(round(w2_km / 4.5 * 60)))
            remaining_dur = max(8, dur_mins - w1_dur - w2_dur - 3)
            t1_dur = max(4, int(remaining_dur * 0.5))
            t2_dur = max(4, remaining_dur - t1_dur)
            t1_dist = round(transit_dist * 0.5, 2)
            t2_dist = round(max(0.2, transit_dist - t1_dist), 2)

            steps = [
                TransitStep(
                    type="walk",
                    instruction=f"Walk {int(w1_km * 1000)}m to {b_stop}",
                    duration_mins=w1_dur,
                    distance_km=w1_km,
                    station_name=b_stop,
                ),
                TransitStep(
                    type="transit_board",
                    instruction=f"Board {r1_name} ({r1_type}) at {b_stop} towards {t_stop}",
                    duration_mins=t1_dur,
                    distance_km=t1_dist,
                    transit_line=r1_name,
                    headsign=t_stop,
                    station_name=b_stop,
                    geometry=fallback_geom,
                ),
                TransitStep(
                    type="transit_transfer",
                    instruction=f"Transfer at {t_stop} to {r2_name} ({r2_type}) towards {a_stop}",
                    duration_mins=t2_dur,
                    distance_km=t2_dist,
                    transit_line=r2_name,
                    station_name=t_stop,
                ),
                TransitStep(
                    type="transit_alight",
                    instruction=f"Alight at {a_stop} and walk {int(w2_km * 1000)}m to {dest_name}",
                    duration_mins=w2_dur,
                    distance_km=w2_km,
                    station_name=a_stop,
                ),
            ]
        elif gtfs_res and gtfs_res.get("mode") == "nearest_stations":
            b_stop = gtfs_res["board_stop"]["display_name"]
            a_stop = gtfs_res["alight_stop"]["display_name"]
            r_name = gtfs_res["route_1"]["name"]
            r_type = gtfs_res["route_1"].get("type", "Metro")
            w1_km = gtfs_res.get("walk1_km", walk1_dist)
            w2_km = gtfs_res.get("walk2_km", walk2_dist)
            w1_dur = max(2, int(round(w1_km / 4.5 * 60)))
            w2_dur = max(2, int(round(w2_km / 4.5 * 60)))
            t_dur = max(5, dur_mins - w1_dur - w2_dur)

            steps = [
                TransitStep(
                    type="walk",
                    instruction=f"Walk {int(w1_km * 1000)}m to {b_stop}",
                    duration_mins=w1_dur,
                    distance_km=w1_km,
                    station_name=b_stop,
                ),
                TransitStep(
                    type="transit_board",
                    instruction=f"Board {r_name} ({r_type}) at {b_stop} towards {a_stop}",
                    duration_mins=t_dur,
                    distance_km=transit_dist,
                    transit_line=r_name,
                    headsign=a_stop,
                    station_name=b_stop,
                    geometry=fallback_geom,
                ),
                TransitStep(
                    type="transit_alight",
                    instruction=f"Alight at {a_stop} and walk {int(w2_km * 1000)}m to {dest_name}",
                    duration_mins=w2_dur,
                    distance_km=w2_km,
                    station_name=a_stop,
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
                    geometry=fallback_geom,
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
