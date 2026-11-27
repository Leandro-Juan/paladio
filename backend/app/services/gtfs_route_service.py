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
        self.gtfs_dir = os.path.realpath(gtfs_dir)
        self.stops: dict[str, dict[str, Any]] = {}
        self.translations: dict[tuple[str, str], str] = {}
        self.routes: dict[str, dict[str, Any]] = {}
        self.stop_routes: dict[str, set[str]] = defaultdict(set)
        self.route_stops: dict[str, list[str]] = defaultdict(list)
        self.route_stop_names: dict[str, set[str]] = defaultdict(set)
        self.transfer_hubs: dict[str, list[tuple[str, float]]] = defaultdict(list)
        self.load()

    def _resolve_feed_file(self, filename: str) -> str | None:
        base_dir = os.path.realpath(self.gtfs_dir)
        candidate = os.path.realpath(os.path.join(base_dir, filename))
        if not candidate.startswith(base_dir + os.sep):
            return None
        return candidate

    def load(self) -> None:
        base_dir = os.path.realpath(self.gtfs_dir)
        if not os.path.isdir(base_dir):
            return

        # 1. Translations
        helper = GTFSTranslationHelper(base_dir)
        self.translation_helper = helper
        self.translations = {**helper.field_translations, **helper.translations}

        # 2. Stops
        stops_file = self._resolve_feed_file("stops.txt")
        if stops_file and os.path.exists(stops_file):
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
                        if (
                            en_name
                            and en_name != raw_name
                            and not raw_name.startswith(f"{en_name} (")
                            and not raw_name.startswith(f"{en_name}<")
                            and not raw_name.startswith(f"{en_name} ")
                        ):
                            display_name = f"{en_name} ({raw_name})"
                        else:
                            display_name = raw_name
                        self.stops[s_id] = {
                            "id": s_id,
                            "raw_name": raw_name,
                            "en_name": en_name,
                            "display_name": display_name,
                            "lat": s_lat,
                            "lon": s_lon,
                        }
            except Exception as e:
                logger.debug(f"Could not load stops.txt from {base_dir}: {e}")

        # 3. Routes
        routes_file = self._resolve_feed_file("routes.txt")
        if routes_file and os.path.exists(routes_file):
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
                        if r_raw.startswith(f"{r_en} (") or r_raw.startswith(
                            f"{r_en} "
                        ):
                            r_name = r_raw
                        else:
                            r_name = r_en
                        self.routes[r_id] = {
                            "id": r_id,
                            "name": r_name,
                            "raw_name": r_raw,
                            "type": r_type,
                        }
            except Exception as e:
                logger.debug(f"Could not load routes.txt from {base_dir}: {e}")

        # 4. Trips & Stop Times
        trips_file = self._resolve_feed_file("trips.txt")
        trip_routes: dict[str, str] = {}
        if trips_file and os.path.exists(trips_file):
            try:
                with open(trips_file, "r", encoding="utf-8", errors="replace") as f:
                    for row in csv.DictReader(f):
                        t_id = row.get("trip_id")
                        r_id = row.get("route_id")
                        if t_id and r_id:
                            trip_routes[t_id] = r_id
            except Exception as e:
                logger.debug(f"Could not load trips.txt from {base_dir}: {e}")

        stop_times_file = self._resolve_feed_file("stop_times.txt")
        if stop_times_file and os.path.exists(stop_times_file) and trip_routes:
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

        # 5. Precompute spatial grid for transfer hubs (stations within 350m of each other)
        grid: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
        for s in self.stops.values():
            key = (int(s["lat"] * 200), int(s["lon"] * 200))
            grid[key].append(s)

        for s1 in self.stops.values():
            k_lat, k_lon = int(s1["lat"] * 200), int(s1["lon"] * 200)
            for d_lat in (-1, 0, 1):
                for d_lon in (-1, 0, 1):
                    for s2 in grid.get((k_lat + d_lat, k_lon + d_lon), []):
                        if s1["id"] != s2["id"]:
                            d = calculate_haversine_km(
                                s1["lat"], s1["lon"], s2["lat"], s2["lon"]
                            )
                            if d <= 0.35:
                                self.transfer_hubs[s1["id"]].append(
                                    (s2["id"], round(d, 3))
                                )

    def get_intermediate_stops(
        self, route_id: str, board_stop_id: str, alight_stop_id: str
    ) -> list[dict[str, Any]]:
        """
        Returns the ordered list of intermediate stop dictionaries along the route
        between board_stop and alight_stop.
        """
        stops_seq = self.route_stops.get(route_id, [])
        if board_stop_id in stops_seq and alight_stop_id in stops_seq:
            i1 = stops_seq.index(board_stop_id)
            i2 = stops_seq.index(alight_stop_id)
            if i1 < i2:
                sub_ids = stops_seq[i1 : i2 + 1]
            else:
                sub_ids = stops_seq[i2 : i1 + 1][::-1]
            return [self.stops[sid] for sid in sub_ids if sid in self.stops]
        b_s = self.stops.get(board_stop_id)
        a_s = self.stops.get(alight_stop_id)
        res = []
        if b_s:
            res.append(b_s)
        if a_s and a_s != b_s:
            res.append(a_s)
        return res

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
        1. Direct line connection (scored by travel efficiency)
        2. 1-transfer connection (via shared station names or physical transfer hubs <= 350m)
        3. Nearest station proximity fallback
        """
        if not self.stops:
            return None

        orig_cands = sorted(
            self.stops.values(),
            key=lambda s: calculate_haversine_km(
                orig_lat, orig_lon, s["lat"], s["lon"]
            ),
        )[:10]
        dest_cands = sorted(
            self.stops.values(),
            key=lambda s: calculate_haversine_km(
                dest_lat, dest_lon, s["lat"], s["lon"]
            ),
        )[:10]

        # 1. Direct route candidates
        direct_candidates = []
        for o_s in orig_cands:
            o_dist = calculate_haversine_km(orig_lat, orig_lon, o_s["lat"], o_s["lon"])
            if o_dist > 3.5:
                continue
            for d_s in dest_cands:
                d_dist = calculate_haversine_km(
                    dest_lat, dest_lon, d_s["lat"], d_s["lon"]
                )
                if d_dist > 3.5 or o_s["id"] == d_s["id"]:
                    continue
                common = self.stop_routes[o_s["id"]].intersection(
                    self.stop_routes[d_s["id"]]
                )
                for r_id in common:
                    intermediate = self.get_intermediate_stops(
                        r_id, o_s["id"], d_s["id"]
                    )
                    score = o_dist + (len(intermediate) * 0.25) + d_dist
                    direct_candidates.append(
                        (
                            score,
                            {
                                "mode": "direct",
                                "board_stop": o_s,
                                "walk1_km": round(o_dist, 2),
                                "route_1": self.routes.get(
                                    r_id, {"name": "Transit", "type": "Metro"}
                                ),
                                "alight_stop": d_s,
                                "walk2_km": round(d_dist, 2),
                                "intermediate_stops": intermediate,
                            },
                        )
                    )

        if direct_candidates:
            direct_candidates.sort(key=lambda x: x[0])
            return direct_candidates[0][1]

        # 2. 1-transfer route candidates
        transfer_candidates = []
        for o_s in orig_cands:
            o_dist = calculate_haversine_km(orig_lat, orig_lon, o_s["lat"], o_s["lon"])
            if o_dist > 3.5:
                continue
            for d_s in dest_cands:
                d_dist = calculate_haversine_km(
                    dest_lat, dest_lon, d_s["lat"], d_s["lon"]
                )
                if d_dist > 3.5 or o_s["id"] == d_s["id"]:
                    continue
                for r1 in self.stop_routes[o_s["id"]]:
                    for r2 in self.stop_routes[d_s["id"]]:
                        if r1 == r2:
                            continue

                        # A) Shared station name transfer
                        common_names = self.route_stop_names[r1].intersection(
                            self.route_stop_names[r2]
                        )
                        for t_raw_name in common_names:
                            t_s1 = next(
                                (
                                    self.stops[sid]
                                    for sid in self.route_stops[r1]
                                    if self.stops[sid]["raw_name"] == t_raw_name
                                ),
                                None,
                            )
                            t_s2 = next(
                                (
                                    self.stops[sid]
                                    for sid in self.route_stops[r2]
                                    if self.stops[sid]["raw_name"] == t_raw_name
                                ),
                                None,
                            )
                            if not t_s1 or not t_s2:
                                continue
                            inter1 = self.get_intermediate_stops(
                                r1, o_s["id"], t_s1["id"]
                            )
                            inter2 = self.get_intermediate_stops(
                                r2, t_s2["id"], d_s["id"]
                            )
                            transfer_walk = calculate_haversine_km(
                                t_s1["lat"], t_s1["lon"], t_s2["lat"], t_s2["lon"]
                            )
                            score = (
                                o_dist
                                + (len(inter1) * 0.25)
                                + transfer_walk
                                + (len(inter2) * 0.25)
                                + d_dist
                            )
                            transfer_candidates.append(
                                (
                                    score,
                                    {
                                        "mode": "transfer",
                                        "board_stop": o_s,
                                        "walk1_km": round(o_dist, 2),
                                        "route_1": self.routes.get(
                                            r1, {"name": "Transit", "type": "Metro"}
                                        ),
                                        "transfer_stop_1": t_s1,
                                        "transfer_stop": t_s1,
                                        "walk_transfer_km": round(transfer_walk, 3),
                                        "transfer_stop_2": t_s2,
                                        "route_2": self.routes.get(
                                            r2, {"name": "Transit", "type": "Metro"}
                                        ),
                                        "alight_stop": d_s,
                                        "walk2_km": round(d_dist, 2),
                                        "intermediate_stops_1": inter1,
                                        "intermediate_stops_2": inter2,
                                    },
                                )
                            )

                        # B) Hub transfer (stations within <= 350m of each other)
                        for s1_id in self.route_stops[r1]:
                            for s2_id, hub_walk in self.transfer_hubs.get(s1_id, []):
                                if r2 in self.stop_routes[s2_id]:
                                    t_s1 = self.stops[s1_id]
                                    t_s2 = self.stops[s2_id]
                                    inter1 = self.get_intermediate_stops(
                                        r1, o_s["id"], s1_id
                                    )
                                    inter2 = self.get_intermediate_stops(
                                        r2, s2_id, d_s["id"]
                                    )
                                    score = (
                                        o_dist
                                        + (len(inter1) * 0.25)
                                        + hub_walk
                                        + (len(inter2) * 0.25)
                                        + d_dist
                                    )
                                    transfer_candidates.append(
                                        (
                                            score,
                                            {
                                                "mode": "transfer",
                                                "board_stop": o_s,
                                                "walk1_km": round(o_dist, 2),
                                                "route_1": self.routes.get(
                                                    r1,
                                                    {
                                                        "name": "Transit",
                                                        "type": "Metro",
                                                    },
                                                ),
                                                "transfer_stop_1": t_s1,
                                                "transfer_stop": t_s1,
                                                "walk_transfer_km": round(hub_walk, 3),
                                                "transfer_stop_2": t_s2,
                                                "route_2": self.routes.get(
                                                    r2,
                                                    {
                                                        "name": "Transit",
                                                        "type": "Metro",
                                                    },
                                                ),
                                                "alight_stop": d_s,
                                                "walk2_km": round(d_dist, 2),
                                                "intermediate_stops_1": inter1,
                                                "intermediate_stops_2": inter2,
                                            },
                                        )
                                    )

        if transfer_candidates:
            transfer_candidates.sort(key=lambda x: x[0])
            return transfer_candidates[0][1]

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
    if not city_clean:
        return None
    if city_clean in _FINDERS:
        return _FINDERS[city_clean]

    base_dir = os.path.realpath(GTFS_BASE_DIR)
    city_gtfs_dir = os.path.realpath(os.path.join(base_dir, city_clean))
    stops_path = os.path.realpath(os.path.join(city_gtfs_dir, "stops.txt"))
    if (
        not city_gtfs_dir.startswith(base_dir + os.sep)
        or not stops_path.startswith(city_gtfs_dir + os.sep)
        or not os.path.isdir(city_gtfs_dir)
        or not os.path.exists(stops_path)
    ):
        _FINDERS[city_clean] = None
        return None

    finder = GTFSRouteFinder(city_gtfs_dir)
    _FINDERS[city_clean] = finder
    return finder
