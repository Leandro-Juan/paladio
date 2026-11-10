import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from app.domain.entities.poi import TransitLeg, TransitStep
from app.services.transit_fare_service import TransitFareService
from app.services.transit_service import decode_polyline6

logger = logging.getLogger(__name__)

TRANSITOUS_URL = os.getenv("TRANSITOUS_URL", "https://api.transitous.org/api/v2")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


def format_transitous_time(departure_iso: str | None) -> str | None:
    """Formats an ISO-8601 string or datetime into Transitous/MOTIS compatible format YYYY-MM-DDTHH:MM:SSZ."""
    if not departure_iso:
        return None
    clean = departure_iso.strip()
    try:
        if "T" in clean:
            dt = datetime.fromisoformat(clean.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        elif len(clean) == 10 and clean.count("-") == 2:
            return f"{clean}T09:00:00Z"
    except Exception as e:
        logger.debug(
            f"Could not parse departure_iso '{departure_iso}' for Transitous: {e}"
        )
    return None


def shift_to_active_timetable_window(departure_iso: str | None) -> str | None:
    """Shifts a past or out-of-bounds date to the matching weekday and time in the upcoming week."""
    if not departure_iso:
        return None
    clean = departure_iso.strip()
    try:
        dt: datetime | None = None
        if "T" in clean:
            dt = datetime.fromisoformat(clean.replace("Z", "+00:00"))
        elif len(clean) == 10 and clean.count("-") == 2:
            dt = datetime.fromisoformat(f"{clean}T09:00:00+00:00")

        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_ahead = (dt.weekday() - now.weekday()) % 7
            if days_ahead == 0 and dt.time() < now.time():
                days_ahead = 7
            shifted_dt = (now + timedelta(days=days_ahead)).replace(
                hour=dt.hour, minute=dt.minute, second=dt.second, microsecond=0
            )
            return shifted_dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception as e:
        logger.debug(f"Could not shift date for Transitous: {e}")
    return None


def _extract_lat_lon(point: dict[str, Any]) -> tuple[float | None, float | None]:
    """Safely extracts latitude and longitude from dictionary whether top-level or nested."""
    loc = point.get("location")
    if isinstance(loc, dict):
        lat = loc.get("latitude") if "latitude" in loc else loc.get("lat")
        lon = loc.get("longitude") if "longitude" in loc else loc.get("lon")
    else:
        lat = point.get("latitude") if "latitude" in point else point.get("lat")
        lon = point.get("longitude") if "longitude" in point else point.get("lon")
    if lat is None or lon is None:
        return None, None
    try:
        return float(lat), float(lon)
    except (ValueError, TypeError):
        return None, None


class TransitousService:
    """
    Client for querying the community-maintained Transitous (MOTIS v2) routing engine.
    Provides door-to-door transit itineraries, transfers, intermediate stops,
    and official line colors.
    """

    @classmethod
    async def plan_transit_route(
        cls,
        origin: dict[str, Any],
        destination: dict[str, Any],
        departure_iso: str | None = None,
        date_time_type: int = 1,
        city: str | None = None,
        is_airport_leg: bool = False,
    ) -> TransitLeg | None:
        """
        Queries Transitous /plan endpoint between origin and destination coordinates.
        Returns a canonical TransitLeg on success, or None if no transit routes are found.
        """
        orig_lat, orig_lon = _extract_lat_lon(origin)
        orig_name = origin.get("name", "Origin")

        dest_lat, dest_lon = _extract_lat_lon(destination)
        dest_name = destination.get("name", "Destination")

        if orig_lat is None or orig_lon is None or dest_lat is None or dest_lon is None:
            logger.warning(
                "TransitousService: missing coordinates for origin or destination"
            )
            return None

        city_name = str(
            city or origin.get("city") or destination.get("city") or ""
        ).strip()
        formatted_time = format_transitous_time(departure_iso)

        # Check Redis Cache
        cache_key = (
            f"transitous:plan:{round(orig_lat, 4)}:{round(orig_lon, 4)}:"
            f"{round(dest_lat, 4)}:{round(dest_lon, 4)}:"
            f"{formatted_time or 'now'}:{date_time_type}"
        )
        redis_client = None
        try:
            import redis.asyncio as aioredis

            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                logger.debug(f"TransitousService: cache hit for {cache_key}")
                data_dict = json.loads(cached_data)
                return cls._parse_transitous_response(
                    data_dict,
                    orig_name=orig_name,
                    dest_name=dest_name,
                    city_name=city_name,
                    origin=origin,
                    destination=destination,
                    is_airport_leg=is_airport_leg,
                )
        except Exception as redis_err:
            logger.debug(f"TransitousService: redis cache read skipped: {redis_err}")

        # Construct request parameters
        params: dict[str, str] = {
            "fromPlace": f"{orig_lat},{orig_lon}",
            "toPlace": f"{dest_lat},{dest_lon}",
        }
        if formatted_time:
            params["time"] = formatted_time
        if date_time_type == 2:
            params["arriveBy"] = "true"

        url = f"{TRANSITOUS_URL.rstrip('/')}/plan"
        headers = {
            "User-Agent": "Paladio/1.0 (+https://github.com/Leandro-Juan/paladio)",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code != 200:
                    if (
                        resp.status_code == 400
                        and "outside of loaded timetable window" in resp.text
                        and "time" in params
                    ):
                        shifted = shift_to_active_timetable_window(departure_iso)
                        if shifted and shifted != params.get("time"):
                            logger.info(
                                f"TransitousService: query time outside window, shifting to active window: {shifted}"
                            )
                            params["time"] = shifted
                            resp = await client.get(url, params=params, headers=headers)
                        if resp.status_code != 200:
                            logger.info(
                                "TransitousService: retrying without time constraint..."
                            )
                            params.pop("time", None)
                            resp = await client.get(url, params=params, headers=headers)
                    if resp.status_code != 200:
                        logger.warning(
                            f"TransitousService request failed: HTTP {resp.status_code} - {resp.text[:300]}"
                        )
                        return None

                data = resp.json()

                # Cache in Redis with 1 hour TTL
                if redis_client and data.get("itineraries"):
                    try:
                        await redis_client.set(cache_key, json.dumps(data), ex=3600)
                    except Exception as redis_set_err:
                        logger.debug(
                            f"TransitousService: redis cache write skipped: {redis_set_err}"
                        )

                return cls._parse_transitous_response(
                    data,
                    orig_name=orig_name,
                    dest_name=dest_name,
                    city_name=city_name,
                    origin=origin,
                    destination=destination,
                    is_airport_leg=is_airport_leg,
                )

        except Exception as exc:
            logger.warning(
                f"TransitousService query failed between '{orig_name}' and '{dest_name}': {exc}"
            )
            return None
        finally:
            if redis_client:
                try:
                    await redis_client.aclose()
                except Exception:
                    pass

    @classmethod
    def _parse_transitous_response(
        cls,
        data: dict[str, Any],
        orig_name: str,
        dest_name: str,
        city_name: str,
        origin: dict[str, Any],
        destination: dict[str, Any],
        is_airport_leg: bool = False,
    ) -> TransitLeg | None:
        """Parses a MOTIS v2 /plan response into a canonical TransitLeg."""
        itineraries = data.get("itineraries", [])
        if not itineraries:
            return None

        # Filter itineraries that have at least one transit leg, or pick the first
        chosen_itin = None
        for itin in itineraries:
            has_transit = any(
                leg.get("mode") not in ("WALK", "BICYCLE", "CAR")
                for leg in itin.get("legs", [])
            )
            if has_transit:
                chosen_itin = itin
                break

        if not chosen_itin:
            chosen_itin = itineraries[0]

        total_duration_sec = chosen_itin.get("duration", 900)
        total_duration_mins = max(1, int(round(total_duration_sec / 60)))

        legs = chosen_itin.get("legs", [])
        steps: list[TransitStep] = []
        full_geometry: list[list[float]] = []
        has_transit_step = False

        for leg_idx, leg in enumerate(legs):
            mode = str(leg.get("mode", "WALK")).upper()
            leg_duration_mins = max(1, int(round(leg.get("duration", 60) / 60)))
            leg_dist_km = round(leg.get("distance", 0.0) / 1000.0, 2)
            points = leg.get("legGeometry", {}).get("points", "")
            leg_coords = decode_polyline6(points) if points else []

            # Append to full geometry
            if leg_coords:
                if not full_geometry:
                    full_geometry.extend(leg_coords)
                else:
                    full_geometry.extend(leg_coords[1:])

            from_info = leg.get("from", {})
            to_info = leg.get("to", {})
            from_name = from_info.get("name") or "Origin"
            to_name = to_info.get("name") or "Destination"

            if from_name == "START":
                from_name = orig_name
            if to_name == "END":
                to_name = dest_name

            if mode in ("WALK", "BICYCLE", "CAR"):
                instruction = (
                    f"Walk {int(leg_dist_km * 1000)}m to {to_name}"
                    if leg_dist_km < 1.0
                    else f"Walk {leg_dist_km} km to {to_name}"
                )
                steps.append(
                    TransitStep(
                        type="walk",
                        instruction=instruction,
                        duration_mins=leg_duration_mins,
                        distance_km=leg_dist_km,
                        station_name=to_name if leg_idx == 0 else from_name,
                        geometry=leg_coords,
                    )
                )
            else:
                has_transit_step = True
                route_short = (
                    leg.get("routeShortName")
                    or leg.get("displayName")
                    or leg.get("tripShortName")
                    or leg.get("routeLongName")
                    or mode.title()
                )
                headsign = leg.get("headsign") or to_name

                raw_color = leg.get("routeColor")
                route_color = f"#{raw_color.lstrip('#')}" if raw_color else "#0F4C5C"

                raw_text = leg.get("routeTextColor")
                route_text_color = f"#{raw_text.lstrip('#')}" if raw_text else "#FFFFFF"

                inter_stops = leg.get("intermediateStops", [])
                inter_names = [s.get("name", "") for s in inter_stops if s.get("name")]
                inter_details = [
                    {
                        "name": s.get("name", "Stop"),
                        "lat": float(s["lat"]),
                        "lon": float(s["lon"]),
                        "arrival": s.get("arrival"),
                        "departure": s.get("departure"),
                    }
                    for s in inter_stops
                    if "lat" in s and "lon" in s
                ]

                # 1. Boarding step
                board_inst = f"Board {route_short} at {from_name} towards {headsign}"
                if inter_names:
                    board_inst += f" ({len(inter_names) + 1} stops)"

                steps.append(
                    TransitStep(
                        type="transit_board",
                        instruction=board_inst,
                        duration_mins=leg_duration_mins,
                        distance_km=leg_dist_km,
                        transit_line=route_short,
                        headsign=headsign,
                        station_name=from_name,
                        geometry=leg_coords,
                        intermediate_stops=inter_names,
                        intermediate_stop_details=inter_details,
                        route_color=route_color,
                        route_text_color=route_text_color,
                    )
                )

                # 2. Alighting step
                alight_coord = (
                    [[float(to_info["lat"]), float(to_info["lon"])]]
                    if "lat" in to_info and "lon" in to_info
                    else ([leg_coords[-1]] if leg_coords else [])
                )
                steps.append(
                    TransitStep(
                        type="transit_alight",
                        instruction=f"Alight at {to_name}",
                        duration_mins=1,
                        distance_km=0.0,
                        transit_line=route_short,
                        station_name=to_name,
                        geometry=alight_coord,
                        route_color=route_color,
                        route_text_color=route_text_color,
                    )
                )

        if not full_geometry and steps:
            orig_c = origin.get("location", {}).get("latitude", origin.get("lat"))
            orig_l = origin.get("location", {}).get("longitude", origin.get("lon"))
            dest_c = destination.get("location", {}).get(
                "latitude", destination.get("lat")
            )
            dest_l = destination.get("location", {}).get(
                "longitude", destination.get("lon")
            )
            if (
                orig_c is not None
                and orig_l is not None
                and dest_c is not None
                and dest_l is not None
            ):
                full_geometry = [
                    [float(orig_c), float(orig_l)],
                    [float(dest_c), float(dest_l)],
                ]

        # Calculate realistic fare dynamically
        fare_result = TransitFareService.calculate_transit_leg_fare(
            city_name,
            steps,
            is_airport_leg=is_airport_leg,
            origin=origin,
            destination=destination,
        )

        mode_name = "transit" if has_transit_step else "pedestrian"

        return TransitLeg(
            duration_mins=total_duration_mins,
            cost_eur=fare_result.total_cost if fare_result else 0.0,
            cost_is_estimated=fare_result.cost_is_estimated if fare_result else False,
            price_source=fare_result.price_source if fare_result else "transitous",
            mode=mode_name,
            steps=steps,
            airport_surcharge_eur=fare_result.airport_surcharge_eur
            if fare_result
            else 0.0,
            geometry=full_geometry,
        )
