import csv
import logging
import math
import os
import re
from collections import defaultdict
from typing import Any

from app.services.gtfs_translation_helper import GTFSTranslationHelper

logger = logging.getLogger(__name__)

GTFS_BASE_DIR = os.getenv("GTFS_BASE_DIR", "/gtfs_feeds")


def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


class GTFSRouteFinder:
    """
    In-memory graph index over a local GTFS feed to dynamically resolve
    real transit stations, lines, transfers, and headsigns for any coordinate pair.
    """

    def __init__(self, gtfs_dir: str):
        self.gtfs_dir = gtfs_dir
        self.stops: dict[str, dict[str, Any]] = {}
        self.translations: dict[tuple[str, str], str] = {}
        self.routes: dict[str, dict[str, Any]] = {}
        self.stop_routes: dict[str, set[str]] = defaultdict(set)
        self.route_stops: dict[str, list[str]] = defaultdict(list)
        self.route_stop_names: dict[str, set[str]] = defaultdict(set)
        self.load()

    def load(self) -> None:
        if not os.path.isdir(self.gtfs_dir):
            return

        # 1. Translations
        helper = GTFSTranslationHelper(self.gtfs_dir)
        self.translations = helper.translations

        # 2. Stops
        stops_file = os.path.join(self.gtfs_dir, "stops.txt")
        if os.path.exists(stops_file):
            try:
                with open(stops_file, "r", encoding="utf-8", errors="replace") as f:
                    for row in csv.DictReader(f):
                        s_id = row.get("stop_id")
                        raw_name = row.get("stop_name", "")
                        if not s_id or not raw_name:
                            continue
                        try:
                            s_lat = float(row["stop_lat"])
                            s_lon = float(row["stop_lon"])
                        except (ValueError, KeyError):
                            continue
                        en_name = self.translations.get(("stops", raw_name), "")
                        display_name = (
                            f"{en_name} ({raw_name})"
                            if en_name and en_name != raw_name
                            else raw_name
                        )
                        self.stops[s_id] = {
                            "id": s_id,
                            "raw_name": raw_name,
                            "en_name": en_name,
                            "display_name": display_name,
                            "lat": s_lat,
                            "lon": s_lon,
                        }
            except Exception as e:
                logger.debug(f"Could not load stops.txt from {self.gtfs_dir}: {e}")

        # 3. Routes
        routes_file = os.path.join(self.gtfs_dir, "routes.txt")
        if os.path.exists(routes_file):
            type_names = {"0": "Tram", "1": "Metro", "2": "Rail", "3": "Bus"}
            try:
                with open(routes_file, "r", encoding="utf-8", errors="replace") as f:
                    for row in csv.DictReader(f):
                        r_id = row.get("route_id")
                        if not r_id:
                            continue
                        r_raw = (
                            row.get("route_long_name")
                            or row.get("route_short_name")
                            or "Transit"
                        )
                        r_en = self.translations.get(("routes", r_raw), r_raw)
                        r_type = type_names.get(
                            str(row.get("route_type", "1")).strip(), "Metro"
                        )
                        self.routes[r_id] = {
                            "id": r_id,
                            "name": r_en,
                            "raw_name": r_raw,
                            "type": r_type,
                        }
            except Exception as e:
                logger.debug(f"Could not load routes.txt from {self.gtfs_dir}: {e}")

        # 4. Trips & Stop Times
        trips_file = os.path.join(self.gtfs_dir, "trips.txt")
        trip_routes: dict[str, str] = {}
        if os.path.exists(trips_file):
            try:
                with open(trips_file, "r", encoding="utf-8", errors="replace") as f:
                    for row in csv.DictReader(f):
                        t_id = row.get("trip_id")
                        r_id = row.get("route_id")
                        if t_id and r_id:
                            trip_routes[t_id] = r_id
            except Exception as e:
                logger.debug(f"Could not load trips.txt from {self.gtfs_dir}: {e}")

        stop_times_file = os.path.join(self.gtfs_dir, "stop_times.txt")
        if os.path.exists(stop_times_file) and trip_routes:
            seen_route_stops: dict[str, set[str]] = defaultdict(set)
            try:
                with open(
                    stop_times_file, "r", encoding="utf-8", errors="replace"
                ) as f:
                    for row in csv.DictReader(f):
                        t_id = row.get("trip_id")
                        s_id = row.get("stop_id")
                        if not t_id or not s_id:
                            continue
                        r_id = trip_routes.get(t_id)
                        if r_id and s_id in self.stops:
                            self.stop_routes[s_id].add(r_id)
                            if s_id not in seen_route_stops[r_id]:
                                seen_route_stops[r_id].add(s_id)
                                self.route_stops[r_id].append(s_id)
                                self.route_stop_names[r_id].add(
                                    self.stops[s_id]["raw_name"]
                                )
            except Exception as e:
                logger.debug(f"Could not load stop_times.txt from {self.gtfs_dir}: {e}")

    def find_route(
        self,
        orig_lat: float,
        orig_lon: float,
        dest_lat: float,
        dest_lon: float,
    ) -> dict[str, Any] | None:
        """
        Dynamically finds the optimal public transit connection between
        origin and destination coordinates:
        1. Direct line connection
        2. 1-transfer connection
        3. Nearest station proximity fallback
        """
        if not self.stops:
            return None

        orig_cands = sorted(
            self.stops.values(),
            key=lambda s: calculate_haversine_km(
                orig_lat, orig_lon, s["lat"], s["lon"]
            ),
        )[:6]
        dest_cands = sorted(
            self.stops.values(),
            key=lambda s: calculate_haversine_km(
                dest_lat, dest_lon, s["lat"], s["lon"]
            ),
        )[:6]

        # 1. Direct route
        for o_s in orig_cands:
            o_dist = calculate_haversine_km(orig_lat, orig_lon, o_s["lat"], o_s["lon"])
            if o_dist > 2.5:
                continue
            for d_s in dest_cands:
                d_dist = calculate_haversine_km(
                    dest_lat, dest_lon, d_s["lat"], d_s["lon"]
                )
                if d_dist > 2.5 or o_s["id"] == d_s["id"]:
                    continue
                common = self.stop_routes[o_s["id"]].intersection(
                    self.stop_routes[d_s["id"]]
                )
                if common:
                    r_id = list(common)[0]
                    return {
                        "mode": "direct",
                        "board_stop": o_s,
                        "walk1_km": round(o_dist, 2),
                        "route_1": self.routes.get(
                            r_id, {"name": "Transit", "type": "Metro"}
                        ),
                        "alight_stop": d_s,
                        "walk2_km": round(d_dist, 2),
                    }

        # 2. 1-transfer route
        for o_s in orig_cands:
            o_dist = calculate_haversine_km(orig_lat, orig_lon, o_s["lat"], o_s["lon"])
            if o_dist > 2.5:
                continue
            for d_s in dest_cands:
                d_dist = calculate_haversine_km(
                    dest_lat, dest_lon, d_s["lat"], d_s["lon"]
                )
                if d_dist > 2.5 or o_s["id"] == d_s["id"]:
                    continue
                for r1 in self.stop_routes[o_s["id"]]:
                    for r2 in self.stop_routes[d_s["id"]]:
                        if r1 == r2:
                            continue
                        common_names = self.route_stop_names[r1].intersection(
                            self.route_stop_names[r2]
                        )
                        if common_names:
                            t_raw_name = list(common_names)[0]
                            t_s = next(
                                (
                                    s
                                    for s in self.stops.values()
                                    if s["raw_name"] == t_raw_name
                                ),
                                None,
                            )
                            if not t_s:
                                continue
                            return {
                                "mode": "transfer",
                                "board_stop": o_s,
                                "walk1_km": round(o_dist, 2),
                                "route_1": self.routes.get(
                                    r1, {"name": "Transit", "type": "Metro"}
                                ),
                                "transfer_stop": t_s,
                                "route_2": self.routes.get(
                                    r2, {"name": "Transit", "type": "Metro"}
                                ),
                                "alight_stop": d_s,
                                "walk2_km": round(d_dist, 2),
                            }

        # 3. Nearest station proximity fallback
        best_o = orig_cands[0]
        best_d = dest_cands[0]
        r1_id = (
            list(self.stop_routes[best_o["id"]])[0]
            if self.stop_routes[best_o["id"]]
            else None
        )
        o_dist = calculate_haversine_km(
            orig_lat, orig_lon, best_o["lat"], best_o["lon"]
        )
        d_dist = calculate_haversine_km(
            dest_lat, dest_lon, best_d["lat"], best_d["lon"]
        )
        return {
            "mode": "nearest_stations",
            "board_stop": best_o,
            "walk1_km": round(o_dist, 2),
            "route_1": self.routes.get(r1_id, {"name": "Transit", "type": "Metro"})
            if r1_id
            else {"name": "Transit", "type": "Metro"},
            "alight_stop": best_d,
            "walk2_km": round(d_dist, 2),
        }


# Process-level cache of GTFSRouteFinder instances
_FINDERS: dict[str, GTFSRouteFinder | None] = {}


def get_gtfs_route_finder(city_name: str) -> GTFSRouteFinder | None:
    """
    Returns a cached GTFSRouteFinder for the given city if its GTFS feed exists on disk.
    """
    if not city_name:
        return None
    city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())
    if city_clean in _FINDERS:
        return _FINDERS[city_clean]

    city_gtfs_dir = os.path.join(GTFS_BASE_DIR, city_clean)
    if not os.path.isdir(city_gtfs_dir) or not os.path.exists(
        os.path.join(city_gtfs_dir, "stops.txt")
    ):
        _FINDERS[city_clean] = None
        return None

    finder = GTFSRouteFinder(city_gtfs_dir)
    _FINDERS[city_clean] = finder
    return finder
