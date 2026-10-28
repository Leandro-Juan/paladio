import csv
import logging
import math
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    TransitAgencyModel,
    TransitCacheModel,
    TransitFareModel,
    TransitLineModel,
    TransitPatternModel,
    TransitPatternStopModel,
    TransitPatternTripModel,
    TransitServiceDayModel,
    TransitServiceSummaryModel,
    TransitShapeModel,
    TransitStationLineModel,
    TransitStationModel,
    TransitTransferModel,
)
from app.services.gtfs_translation_helper import GTFSTranslationHelper

logger = logging.getLogger(__name__)


def calculate_haversine_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
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


def parse_gtfs_time_seconds(time_str: str | None) -> int | None:
    """
    Parses GTFS time HH:MM:SS or H:MM:SS (which can exceed 24:00:00) into integer seconds from midnight.
    Returns None if missing or malformed.
    """
    if not time_str:
        return None
    time_str = time_str.strip()
    parts = time_str.split(":")
    if len(parts) != 3:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    except (ValueError, TypeError):
        return None


def map_gtfs_route_type(route_type_val: Any) -> str:
    """
    Maps GTFS standard & hierarchical route_type codes to standard modes:
    'Metro', 'Rail', 'Tram', 'Bus', 'Ferry', 'Other'.
    """
    if route_type_val is None:
        return "Other"
    try:
        code = int(str(route_type_val).strip())
    except ValueError:
        return "Other"

    # Standard codes (0-7)
    if code == 0:
        return "Tram"
    elif code == 1:
        return "Metro"
    elif code == 2:
        return "Rail"
    elif code == 3:
        return "Bus"
    elif code == 4:
        return "Ferry"
    elif code == 5:
        return "Tram"  # Cable tram
    elif code == 6:
        return "Other"  # Aerial lift
    elif code == 7:
        return "Other"  # Funicular

    # Extended HVT / Hierarchical GTFS codes
    if 100 <= code < 200:
        return "Rail"
    elif 200 <= code < 300:
        return "Rail"  # Coach service is rail/bus, classify Coach / Regional
    elif 400 <= code < 500:
        return "Metro"  # Urban Railway / Metro
    elif 700 <= code < 800:
        return "Bus"
    elif 900 <= code < 1000:
        return "Tram"
    elif 1000 <= code < 1100:
        return "Ferry"

    return "Other"


def compute_contrast_text_color(hex_color: str) -> str:
    """
    Given a hex color (e.g. 'FF0000' or '#FF0000'), returns '#FFFFFF' or '#000000'
    for optimal readability.
    """
    cleaned = hex_color.lstrip("#")
    if len(cleaned) == 3:
        cleaned = "".join(c * 2 for c in cleaned)
    if len(cleaned) != 6:
        return "#FFFFFF"
    try:
        r = int(cleaned[0:2], 16)
        g = int(cleaned[2:4], 16)
        b = int(cleaned[4:6], 16)
        # Relative luminance formula
        luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
        return "#000000" if luminance > 0.6 else "#FFFFFF"
    except Exception:
        return "#FFFFFF"


class TransitDerivationService:
    """
    Derives compact, high-performance PostgreSQL tables from a pruned GTFS feed.
    Zero fake data: respects capability flags, parent stations, versioned builds, and streaming CSVs.
    """

    def __init__(self, db: AsyncSession, gtfs_base_dir: str = "/gtfs_feeds"):
        self.db = db
        self.gtfs_base_dir = gtfs_base_dir

    async def derive_city(self, city_name: str) -> dict[str, Any]:
        city_lower = city_name.strip().lower()
        feed_dir = os.path.join(self.gtfs_base_dir, city_lower)
        if not os.path.isdir(feed_dir):
            raise FileNotFoundError(
                f"GTFS directory not found for {city_lower}: {feed_dir}"
            )

        build_id = str(uuid.uuid4())
        quality_report: dict[str, Any] = {
            "rows_read": {},
            "rows_skipped": {},
            "warnings": [],
        }
        capabilities: dict[str, Any] = {
            "has_shapes": False,
            "has_frequencies": False,
            "has_translations": False,
            "has_route_colors": False,
            "has_headsigns": False,
            "has_transfers": False,
            "has_wheelchair_info": False,
            "has_gtfs_fares": False,
            "has_calendar_dates": False,
            "covered_date_range": None,
            "agencies": [],
        }

        logger.info(
            f"Starting transit derivation for {city_lower} (build_id: {build_id})"
        )

        # 1. Load Translations
        translation_helper = GTFSTranslationHelper(feed_dir)
        if translation_helper.translations:
            capabilities["has_translations"] = True

        # 2. Derive Agencies
        agencies = self._derive_agencies(feed_dir, build_id, city_lower, quality_report)
        capabilities["agencies"] = [a.name for a in agencies]

        # 3. Derive Lines (routes)
        lines, has_colors = self._derive_lines(
            feed_dir, build_id, city_lower, translation_helper, quality_report
        )
        capabilities["has_route_colors"] = has_colors

        # 4. Derive Stations (stops & platform collapsing)
        stations, stop_to_station_id, has_wheelchair = self._derive_stations(
            feed_dir, build_id, city_lower, translation_helper, quality_report
        )
        capabilities["has_wheelchair_info"] = has_wheelchair

        # 5. Derive Service Days (calendar & calendar_dates)
        service_days, feed_valid_from, feed_valid_to, has_calendar_dates = (
            self._derive_service_days(feed_dir, build_id, city_lower, quality_report)
        )
        capabilities["has_calendar_dates"] = has_calendar_dates
        if feed_valid_from and feed_valid_to:
            capabilities["covered_date_range"] = {
                "start": feed_valid_from.strftime("%Y-%m-%d"),
                "end": feed_valid_to.strftime("%Y-%m-%d"),
            }

        # 6. Derive Trips, Patterns & Pattern Stops, Pattern Trips & Service Summaries
        (
            patterns,
            pattern_stops,
            pattern_trips,
            station_lines,
            service_summaries,
            has_headsigns,
        ) = self._derive_patterns_and_summaries(
            feed_dir,
            build_id,
            city_lower,
            lines,
            stop_to_station_id,
            service_days,
            quality_report,
        )
        capabilities["has_headsigns"] = has_headsigns

        # 7. Derive Shapes (optional)
        shapes = self._derive_shapes(feed_dir, build_id, city_lower, quality_report)
        if shapes:
            capabilities["has_shapes"] = True

        # 8. Derive Transfers (optional)
        transfers = self._derive_transfers(
            feed_dir, build_id, city_lower, stop_to_station_id, quality_report
        )
        if transfers:
            capabilities["has_transfers"] = True

        # 9. Derive Fares (optional)
        fares = self._derive_fares(feed_dir, build_id, city_lower, quality_report)
        if fares:
            capabilities["has_gtfs_fares"] = True

        # 10. Check frequencies.txt
        freq_path = os.path.join(feed_dir, "frequencies.txt")
        if os.path.exists(freq_path) and os.path.getsize(freq_path) > 10:
            capabilities["has_frequencies"] = True

        # Write everything in batches and atomically update TransitCacheModel
        await self._commit_build(
            build_id=build_id,
            city_lower=city_lower,
            agencies=agencies,
            lines=lines,
            stations=stations,
            patterns=patterns,
            pattern_stops=pattern_stops,
            pattern_trips=pattern_trips,
            station_lines=station_lines,
            service_summaries=service_summaries,
            service_days=service_days,
            shapes=shapes,
            transfers=transfers,
            fares=fares,
            capabilities=capabilities,
            quality_report=quality_report,
            feed_valid_from=feed_valid_from,
            feed_valid_to=feed_valid_to,
        )

        logger.info(
            f"Derivation complete for {city_lower} (build_id: {build_id}). "
            f"Stations: {len(stations)}, Lines: {len(lines)}, Patterns: {len(patterns)}, Shapes: {len(shapes)}"
        )
        return {
            "status": "success",
            "build_id": build_id,
            "capabilities": capabilities,
            "quality": quality_report,
            "stations_count": len(stations),
            "lines_count": len(lines),
        }

    def _derive_agencies(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        quality_report: dict[str, Any],
    ) -> list[TransitAgencyModel]:
        agency_file = os.path.join(feed_dir, "agency.txt")
        agencies: list[TransitAgencyModel] = []
        if not os.path.exists(agency_file):
            return agencies

        read_count = 0
        skip_count = 0
        with open(agency_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_count += 1
                name = (row.get("agency_name") or "").strip()
                if not name:
                    skip_count += 1
                    continue
                agency_id = (row.get("agency_id") or name).strip()
                url = (row.get("agency_url") or "").strip() or None
                tz = (row.get("agency_timezone") or "").strip() or None
                phone = (row.get("agency_phone") or "").strip() or None
                fare_url = (row.get("agency_fare_url") or "").strip() or None

                agencies.append(
                    TransitAgencyModel(
                        build_id=build_id,
                        city=city_lower,
                        agency_id=agency_id,
                        name=name,
                        url=url,
                        timezone=tz,
                        phone=phone,
                        fare_url=fare_url,
                    )
                )

        quality_report["rows_read"]["agency.txt"] = read_count
        quality_report["rows_skipped"]["agency.txt"] = skip_count
        return agencies

    def _derive_lines(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        translations: GTFSTranslationHelper,
        quality_report: dict[str, Any],
    ) -> tuple[list[TransitLineModel], bool]:
        routes_file = os.path.join(feed_dir, "routes.txt")
        lines: list[TransitLineModel] = []
        has_colors = False
        if not os.path.exists(routes_file):
            return lines, False

        # Fallback palette for lines lacking official GTFS color
        fallback_palette = [
            "#007AFF",
            "#34C759",
            "#FF9500",
            "#FF2D55",
            "#AF52DE",
            "#5856D6",
            "#00C7BE",
            "#32ADE6",
        ]

        read_count = 0
        skip_count = 0
        with open(routes_file, "r", encoding="utf-8", errors="replace") as f:
            for i, row in enumerate(csv.DictReader(f)):
                read_count += 1
                route_id = (row.get("route_id") or "").strip()
                if not route_id:
                    skip_count += 1
                    continue

                short_name = (row.get("route_short_name") or "").strip() or None
                long_name = (row.get("route_long_name") or "").strip() or None
                if long_name:
                    long_name = translations.get_route_name(long_name)
                if short_name:
                    short_name = translations.get_route_name(short_name)

                # Fallback to route_id or 'Transit' if both names missing
                if not short_name and not long_name:
                    short_name = f"Line {route_id}"

                mode = map_gtfs_route_type(row.get("route_type"))
                agency_id = (row.get("agency_id") or "").strip() or None

                gtfs_color = (row.get("route_color") or "").strip().upper()
                gtfs_text_color = (row.get("route_text_color") or "").strip().upper()

                if gtfs_color:
                    color = f"#{gtfs_color.lstrip('#')}"
                    color_source = "gtfs"
                    has_colors = True
                else:
                    color = fallback_palette[i % len(fallback_palette)]
                    color_source = "fallback"

                if gtfs_text_color:
                    text_color = f"#{gtfs_text_color.lstrip('#')}"
                else:
                    text_color = compute_contrast_text_color(color)

                sort_order = 0
                if row.get("route_sort_order"):
                    try:
                        sort_order = int(row["route_sort_order"])
                    except ValueError:
                        pass

                lines.append(
                    TransitLineModel(
                        build_id=build_id,
                        city=city_lower,
                        line_id=route_id,
                        agency_id=agency_id,
                        short_name=short_name,
                        long_name=long_name,
                        mode=mode,
                        color=color,
                        text_color=text_color,
                        color_source=color_source,
                        sort_order=sort_order,
                    )
                )

        quality_report["rows_read"]["routes.txt"] = read_count
        quality_report["rows_skipped"]["routes.txt"] = skip_count
        return lines, has_colors

    def _derive_stations(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        translations: GTFSTranslationHelper,
        quality_report: dict[str, Any],
    ) -> tuple[list[TransitStationModel], dict[str, str], bool]:
        stops_file = os.path.join(feed_dir, "stops.txt")
        stations: list[TransitStationModel] = []
        stop_to_station_id: dict[str, str] = {}
        has_wheelchair = False
        if not os.path.exists(stops_file):
            return stations, stop_to_station_id, False

        raw_stops: list[dict[str, Any]] = []
        parent_stations: dict[str, dict[str, Any]] = {}
        has_any_parent = False

        read_count = 0
        skip_count = 0
        with open(stops_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_count += 1
                stop_id = (row.get("stop_id") or "").strip()
                raw_name = (row.get("stop_name") or "").strip()
                if not stop_id or not raw_name:
                    skip_count += 1
                    continue

                lat_str = row.get("stop_lat")
                lon_str = row.get("stop_lon")
                lat: float | None = None
                lon: float | None = None
                if lat_str and lon_str:
                    try:
                        lat = float(lat_str)
                        lon = float(lon_str)
                    except ValueError:
                        lat, lon = None, None

                loc_type = str(row.get("location_type", "0")).strip()
                parent_id = (row.get("parent_station") or "").strip() or None
                if parent_id:
                    has_any_parent = True

                wb_val = row.get("wheelchair_boarding")
                wb: int | None = None
                if wb_val is not None and str(wb_val).strip() in ("1", "2"):
                    wb = int(str(wb_val).strip())
                    has_wheelchair = True

                stop_dict = {
                    "stop_id": stop_id,
                    "raw_name": raw_name,
                    "lat": lat,
                    "lon": lon,
                    "location_type": loc_type,
                    "parent_station": parent_id,
                    "wheelchair_boarding": wb,
                }
                raw_stops.append(stop_dict)
                if loc_type == "1":
                    parent_stations[stop_id] = stop_dict

        # Resolve parent station references
        # If a child stop has no coordinates, inherit from parent
        for s in raw_stops:
            if (s["lat"] is None or s["lon"] is None) and s[
                "parent_station"
            ] in parent_stations:
                p = parent_stations[s["parent_station"]]
                s["lat"] = p["lat"]
                s["lon"] = p["lon"]

        # If feed has parent stations: group platforms under parent_station
        station_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        if has_any_parent:
            for s in raw_stops:
                if s["location_type"] == "1":
                    # It's an explicit station definition
                    station_groups[s["stop_id"]].append(s)
                elif s["parent_station"]:
                    station_groups[s["parent_station"]].append(s)
                    stop_to_station_id[s["stop_id"]] = s["parent_station"]
                else:
                    station_groups[s["stop_id"]].append(s)
                    stop_to_station_id[s["stop_id"]] = s["stop_id"]
        else:
            # Fallback heuristic: merge by identical name within 150m if feed has no parent_stations
            name_clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for s in raw_stops:
                if s["lat"] is not None and s["lon"] is not None:
                    name_clusters[s["raw_name"]].append(s)
                else:
                    station_groups[s["stop_id"]].append(s)
                    stop_to_station_id[s["stop_id"]] = s["stop_id"]

            for name, stops in name_clusters.items():
                if len(stops) == 1:
                    s = stops[0]
                    station_groups[s["stop_id"]].append(s)
                    stop_to_station_id[s["stop_id"]] = s["stop_id"]
                else:
                    # Spatial grouping by 150m
                    assigned = [False] * len(stops)
                    for idx, s in enumerate(stops):
                        if assigned[idx]:
                            continue
                        cluster_id = s["stop_id"]
                        station_groups[cluster_id].append(s)
                        stop_to_station_id[s["stop_id"]] = cluster_id
                        assigned[idx] = True
                        for other_idx in range(idx + 1, len(stops)):
                            if not assigned[other_idx]:
                                other = stops[other_idx]
                                dist = calculate_haversine_meters(
                                    s["lat"], s["lon"], other["lat"], other["lon"]
                                )
                                if dist <= 150.0:
                                    station_groups[cluster_id].append(other)
                                    stop_to_station_id[other["stop_id"]] = cluster_id
                                    assigned[other_idx] = True

        # Build TransitStationModel objects
        for st_id, members in station_groups.items():
            # Filter members with valid lat/lon
            valid_members = [
                m for m in members if m["lat"] is not None and m["lon"] is not None
            ]
            if not valid_members:
                skip_count += len(members)
                continue

            # Station name
            # Prefer parent_stations definition or first member
            p_def = parent_stations.get(st_id)
            raw_name = p_def["raw_name"] if p_def else valid_members[0]["raw_name"]
            display_name, orig_name = translations.get_stop_name(raw_name)

            avg_lat = sum(m["lat"] for m in valid_members) / len(valid_members)
            avg_lon = sum(m["lon"] for m in valid_members) / len(valid_members)

            wb = None
            for m in valid_members:
                if m["wheelchair_boarding"] is not None:
                    wb = m["wheelchair_boarding"]
                    break

            stations.append(
                TransitStationModel(
                    build_id=build_id,
                    city=city_lower,
                    station_id=st_id,
                    name=display_name,
                    original_name=orig_name,
                    lat=avg_lat,
                    lon=avg_lon,
                    wheelchair_boarding=wb,
                    stop_count=len(members),
                )
            )

        quality_report["rows_read"]["stops.txt"] = read_count
        quality_report["rows_skipped"]["stops.txt"] = skip_count
        return stations, stop_to_station_id, has_wheelchair

    def _derive_service_days(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        quality_report: dict[str, Any],
    ) -> tuple[
        dict[str, TransitServiceDayModel], datetime | None, datetime | None, bool
    ]:
        service_days: dict[str, TransitServiceDayModel] = {}
        feed_valid_from: datetime | None = None
        feed_valid_to: datetime | None = None
        has_calendar_dates = False

        cal_file = os.path.join(feed_dir, "calendar.txt")
        cal_dates_file = os.path.join(feed_dir, "calendar_dates.txt")

        # Parse calendar.txt
        if os.path.exists(cal_file):
            read_count = 0
            with open(cal_file, "r", encoding="utf-8", errors="replace") as f:
                for row in csv.DictReader(f):
                    read_count += 1
                    s_id = (row.get("service_id") or "").strip()
                    if not s_id:
                        continue
                    try:
                        s_date = int(row["start_date"])
                        e_date = int(row["end_date"])
                        mon = int(row.get("monday", 0))
                        tue = int(row.get("tuesday", 0))
                        wed = int(row.get("wednesday", 0))
                        thu = int(row.get("thursday", 0))
                        fri = int(row.get("friday", 0))
                        sat = int(row.get("saturday", 0))
                        sun = int(row.get("sunday", 0))
                    except (ValueError, KeyError):
                        continue

                    model = TransitServiceDayModel(
                        build_id=build_id,
                        city=city_lower,
                        service_id=s_id,
                        start_date=s_date,
                        end_date=e_date,
                        monday=mon,
                        tuesday=tue,
                        wednesday=wed,
                        thursday=thu,
                        friday=fri,
                        saturday=sat,
                        sunday=sun,
                        exception_dates={},
                    )
                    service_days[s_id] = model

                    # Update validity span
                    try:
                        dt_start = datetime.strptime(str(s_date), "%Y%m%d").replace(
                            tzinfo=timezone.utc
                        )
                        dt_end = datetime.strptime(str(e_date), "%Y%m%d").replace(
                            tzinfo=timezone.utc
                        )
                        if feed_valid_from is None or dt_start < feed_valid_from:
                            feed_valid_from = dt_start
                        if feed_valid_to is None or dt_end > feed_valid_to:
                            feed_valid_to = dt_end
                    except ValueError:
                        pass
            quality_report["rows_read"]["calendar.txt"] = read_count

        # Parse calendar_dates.txt
        if os.path.exists(cal_dates_file):
            read_count = 0
            with open(cal_dates_file, "r", encoding="utf-8", errors="replace") as f:
                for row in csv.DictReader(f):
                    read_count += 1
                    has_calendar_dates = True
                    s_id = (row.get("service_id") or "").strip()
                    date_str = (row.get("date") or "").strip()
                    ex_type = (row.get("exception_type") or "").strip()
                    if not s_id or not date_str or not ex_type:
                        continue

                    try:
                        date_int = int(date_str)
                        ex_int = int(ex_type)
                    except ValueError:
                        continue

                    if s_id not in service_days:
                        service_days[s_id] = TransitServiceDayModel(
                            build_id=build_id,
                            city=city_lower,
                            service_id=s_id,
                            start_date=date_int,
                            end_date=date_int,
                            monday=0,
                            tuesday=0,
                            wednesday=0,
                            thursday=0,
                            friday=0,
                            saturday=0,
                            sunday=0,
                            exception_dates={},
                        )

                    day_model = service_days[s_id]
                    day_model.exception_dates = dict(day_model.exception_dates or {})
                    day_model.exception_dates[date_str] = ex_int

                    try:
                        dt = datetime.strptime(date_str, "%Y%m%d").replace(
                            tzinfo=timezone.utc
                        )
                        if feed_valid_from is None or dt < feed_valid_from:
                            feed_valid_from = dt
                        if feed_valid_to is None or dt > feed_valid_to:
                            feed_valid_to = dt
                    except ValueError:
                        pass
            quality_report["rows_read"]["calendar_dates.txt"] = read_count

        return service_days, feed_valid_from, feed_valid_to, has_calendar_dates

    def _derive_patterns_and_summaries(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        lines: list[TransitLineModel],
        stop_to_station_id: dict[str, str],
        service_days: dict[str, TransitServiceDayModel],
        quality_report: dict[str, Any],
    ) -> tuple[
        list[TransitPatternModel],
        list[TransitPatternStopModel],
        list[TransitPatternTripModel],
        list[TransitStationLineModel],
        list[TransitServiceSummaryModel],
        bool,
    ]:
        trips_file = os.path.join(feed_dir, "trips.txt")
        stop_times_file = os.path.join(feed_dir, "stop_times.txt")
        has_headsigns = False

        if not os.path.exists(trips_file) or not os.path.exists(stop_times_file):
            return [], [], [], [], [], False

        # 1. Load trips metadata: trip_id -> (route_id, service_id, direction_id, headsign, shape_id)
        trip_meta: dict[str, dict[str, Any]] = {}
        read_trips = 0
        with open(trips_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_trips += 1
                t_id = (row.get("trip_id") or "").strip()
                r_id = (row.get("route_id") or "").strip()
                s_id = (row.get("service_id") or "").strip()
                if not t_id or not r_id:
                    continue

                dir_id = 0
                if row.get("direction_id"):
                    try:
                        dir_id = int(row["direction_id"])
                    except ValueError:
                        dir_id = 0

                headsign = (row.get("trip_headsign") or "").strip() or None
                if headsign:
                    has_headsigns = True

                trip_meta[t_id] = {
                    "route_id": r_id,
                    "service_id": s_id,
                    "direction_id": dir_id,
                    "headsign": headsign,
                    "shape_id": (row.get("shape_id") or "").strip() or None,
                }
        quality_report["rows_read"]["trips.txt"] = read_trips

        # 2. Stream stop_times.txt in memory-efficient chunks to group stop sequences per trip
        # trip_id -> list of (stop_sequence, station_id, departure_seconds)
        trip_stops: dict[str, list[tuple[int, str, int]]] = defaultdict(list)
        read_stop_times = 0
        skip_stop_times = 0

        with open(stop_times_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_stop_times += 1
                t_id = (row.get("trip_id") or "").strip()
                if t_id not in trip_meta:
                    skip_stop_times += 1
                    continue

                stop_id = (row.get("stop_id") or "").strip()
                st_id = stop_to_station_id.get(stop_id)
                if not st_id:
                    skip_stop_times += 1
                    continue

                dep_str = row.get("departure_time") or row.get("arrival_time")
                dep_secs = parse_gtfs_time_seconds(dep_str)
                if dep_secs is None:
                    # Non-timepoint stop: placeholder offset for interpolation
                    dep_secs = -1

                seq = 0
                try:
                    seq = int(row.get("stop_sequence", 0))
                except ValueError:
                    pass

                trip_stops[t_id].append((seq, st_id, dep_secs))

        quality_report["rows_read"]["stop_times.txt"] = read_stop_times
        quality_report["rows_skipped"]["stop_times.txt"] = skip_stop_times

        # 3. Deduplicate patterns per (route_id, direction_id)
        # Key: (route_id, direction_id, tuple_of_station_ids) -> pattern_id
        pattern_map: dict[tuple[str, int, tuple[str, ...]], str] = {}
        pattern_trips_list: list[TransitPatternTripModel] = []
        pattern_stops_list: list[TransitPatternStopModel] = []
        pattern_headsigns: dict[str, str | None] = {}
        pattern_trip_counts: dict[str, int] = defaultdict(int)

        # For service summaries:
        # (station_id, line_id, direction_id, day_type) -> list of departure_seconds
        station_departures: dict[tuple[str, str, int, str], list[int]] = defaultdict(
            list
        )
        station_lines_set: set[tuple[str, str, int, str | None]] = set()

        for t_id, stops in trip_stops.items():
            if not stops:
                continue
            stops.sort(key=lambda s: s[0])

            # Collapse consecutive duplicate stations if any platform transfers exist
            collapsed_stops: list[tuple[int, str, int]] = []
            for s in stops:
                if not collapsed_stops or collapsed_stops[-1][1] != s[1]:
                    collapsed_stops.append(s)

            if len(collapsed_stops) < 2:
                continue

            station_sequence = tuple(s[1] for s in collapsed_stops)
            meta = trip_meta[t_id]
            r_id = meta["route_id"]
            dir_id = meta["direction_id"]
            key = (r_id, dir_id, station_sequence)

            if key not in pattern_map:
                pat_id = f"{r_id}_{dir_id}_{len(pattern_map) + 1}"
                pattern_map[key] = pat_id

                # Calculate average or sample time offsets from first stop
                first_dep = collapsed_stops[0][2]
                if first_dep < 0:
                    first_dep = 0
                for idx, (seq, st_id, dep_s) in enumerate(collapsed_stops):
                    offset = max(0, dep_s - first_dep) if dep_s >= 0 else (idx * 120)
                    pattern_stops_list.append(
                        TransitPatternStopModel(
                            build_id=build_id,
                            city=city_lower,
                            pattern_id=pat_id,
                            stop_sequence=idx + 1,
                            station_id=st_id,
                            time_offset_seconds=offset,
                        )
                    )

            pat_id = pattern_map[key]
            pattern_trip_counts[pat_id] += 1
            if not pattern_headsigns.get(pat_id) and meta["headsign"]:
                pattern_headsigns[pat_id] = meta["headsign"]

            # First departure for this trip
            first_dep = collapsed_stops[0][2]
            if first_dep >= 0:
                pattern_trips_list.append(
                    TransitPatternTripModel(
                        build_id=build_id,
                        city=city_lower,
                        pattern_id=pat_id,
                        service_id=meta["service_id"],
                        departure_seconds=first_dep,
                        trip_id=t_id,
                    )
                )

                # Determine day types for this service_id
                s_day = service_days.get(meta["service_id"])
                day_types = []
                if s_day:
                    if (
                        s_day.monday
                        or s_day.tuesday
                        or s_day.wednesday
                        or s_day.thursday
                        or s_day.friday
                    ):
                        day_types.append("weekday")
                    if s_day.saturday:
                        day_types.append("saturday")
                    if s_day.sunday:
                        day_types.append("sunday")
                else:
                    day_types.append("weekday")

                # Accumulate station departures for headways
                for idx, (seq, st_id, dep_s) in enumerate(collapsed_stops):
                    st_dep = dep_s if dep_s >= 0 else (first_dep + idx * 120)
                    station_lines_set.add((st_id, r_id, dir_id, meta["headsign"]))
                    for d_type in day_types:
                        station_departures[(st_id, r_id, dir_id, d_type)].append(st_dep)

        # Build TransitPatternModel list and identify primary pattern per route/direction
        # Group patterns by (route_id, direction_id)
        route_patterns: dict[tuple[str, int], list[tuple[str, int, int]]] = defaultdict(
            list
        )
        for (r_id, dir_id, seq), pat_id in pattern_map.items():
            trip_count = pattern_trip_counts.get(pat_id, 0)
            route_patterns[(r_id, dir_id)].append((pat_id, trip_count, len(seq)))

        patterns_list: list[TransitPatternModel] = []
        for (r_id, dir_id), plist in route_patterns.items():
            plist.sort(key=lambda p: (p[1], p[2]), reverse=True)
            for rank, (pat_id, trip_cnt, stop_cnt) in enumerate(plist):
                is_primary = rank == 0
                patterns_list.append(
                    TransitPatternModel(
                        build_id=build_id,
                        city=city_lower,
                        pattern_id=pat_id,
                        line_id=r_id,
                        direction_id=dir_id,
                        headsign=pattern_headsigns.get(pat_id),
                        is_primary=is_primary,
                        stop_count=stop_cnt,
                    )
                )

        # Build station_lines
        station_lines_dict: dict[tuple[str, str, int], str | None] = {}
        for st_id, r_id, dir_id, hsign in station_lines_set:
            sl_key = (st_id, r_id, dir_id)
            if sl_key not in station_lines_dict or (
                not station_lines_dict[sl_key] and hsign
            ):
                station_lines_dict[sl_key] = hsign

        station_lines_list = [
            TransitStationLineModel(
                build_id=build_id,
                city=city_lower,
                station_id=st_id,
                line_id=r_id,
                direction_id=dir_id,
                headsign=hsign,
            )
            for (st_id, r_id, dir_id), hsign in station_lines_dict.items()
        ]

        # Build service summaries per station/line/direction/day_type
        # Headways by time band: morning (06-09), midday (09-16), evening (16-19), night (19-24)
        service_summaries_list: list[TransitServiceSummaryModel] = []
        for (st_id, r_id, dir_id, d_type), deps in station_departures.items():
            if not deps:
                continue
            deps.sort()
            first_dep = deps[0]
            last_dep = deps[-1]

            bands: dict[str, list[int]] = {
                "morning": [d for d in deps if 6 * 3600 <= d < 9 * 3600],
                "midday": [d for d in deps if 9 * 3600 <= d < 16 * 3600],
                "evening": [d for d in deps if 16 * 3600 <= d < 19 * 3600],
                "night": [d for d in deps if 19 * 3600 <= d < 24 * 3600],
            }
            headways: dict[str, int | None] = {}
            for band_name, band_deps in bands.items():
                if len(band_deps) >= 3:
                    diffs = [
                        band_deps[k + 1] - band_deps[k]
                        for k in range(len(band_deps) - 1)
                    ]
                    avg_mins = round((sum(diffs) / len(diffs)) / 60.0)
                    headways[band_name] = max(1, avg_mins)
                else:
                    headways[band_name] = None

            service_summaries_list.append(
                TransitServiceSummaryModel(
                    build_id=build_id,
                    city=city_lower,
                    station_id=st_id,
                    line_id=r_id,
                    direction_id=dir_id,
                    day_type=d_type,
                    first_departure_seconds=first_dep,
                    last_departure_seconds=last_dep,
                    headways_by_band=headways,
                )
            )

        return (
            patterns_list,
            pattern_stops_list,
            pattern_trips_list,
            station_lines_list,
            service_summaries_list,
            has_headsigns,
        )

    def _derive_shapes(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        quality_report: dict[str, Any],
    ) -> list[TransitShapeModel]:
        shapes_file = os.path.join(feed_dir, "shapes.txt")
        shapes: list[TransitShapeModel] = []
        if not os.path.exists(shapes_file):
            return shapes

        shape_points: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
        read_count = 0
        with open(shapes_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_count += 1
                sh_id = (row.get("shape_id") or "").strip()
                if not sh_id:
                    continue
                try:
                    lat = float(row["shape_pt_lat"])
                    lon = float(row["shape_pt_lon"])
                    seq = int(row.get("shape_pt_sequence", 0))
                    shape_points[sh_id].append((seq, lat, lon))
                except (ValueError, KeyError):
                    continue

        quality_report["rows_read"]["shapes.txt"] = read_count

        for sh_id, pts in shape_points.items():
            pts.sort(key=lambda p: p[0])
            coords = [[round(p[1], 6), round(p[2], 6)] for p in pts]
            shapes.append(
                TransitShapeModel(
                    build_id=build_id,
                    city=city_lower,
                    shape_id=sh_id,
                    coordinates=coords,
                )
            )
        return shapes

    def _derive_transfers(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        stop_to_station_id: dict[str, str],
        quality_report: dict[str, Any],
    ) -> list[TransitTransferModel]:
        transfers_file = os.path.join(feed_dir, "transfers.txt")
        transfers: list[TransitTransferModel] = []
        if not os.path.exists(transfers_file):
            return transfers

        seen_pairs: set[tuple[str, str]] = set()
        read_count = 0
        with open(transfers_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_count += 1
                from_s = stop_to_station_id.get((row.get("from_stop_id") or "").strip())
                to_s = stop_to_station_id.get((row.get("to_stop_id") or "").strip())
                if not from_s or not to_s or from_s == to_s:
                    continue
                if (from_s, to_s) in seen_pairs:
                    continue
                seen_pairs.add((from_s, to_s))

                t_type = 0
                try:
                    t_type = int(row.get("transfer_type", 0))
                except ValueError:
                    pass

                min_t = None
                if row.get("min_transfer_time"):
                    try:
                        min_t = int(row["min_transfer_time"])
                    except ValueError:
                        pass

                transfers.append(
                    TransitTransferModel(
                        build_id=build_id,
                        city=city_lower,
                        from_station_id=from_s,
                        to_station_id=to_s,
                        transfer_type=t_type,
                        min_transfer_time=min_t,
                    )
                )

        quality_report["rows_read"]["transfers.txt"] = read_count
        return transfers

    def _derive_fares(
        self,
        feed_dir: str,
        build_id: str,
        city_lower: str,
        quality_report: dict[str, Any],
    ) -> list[TransitFareModel]:
        fare_file = os.path.join(feed_dir, "fare_attributes.txt")
        fares: list[TransitFareModel] = []
        if not os.path.exists(fare_file):
            return fares

        read_count = 0
        with open(fare_file, "r", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                read_count += 1
                fare_id = (row.get("fare_id") or "").strip()
                if not fare_id:
                    continue
                try:
                    price = float(row["price"])
                except (ValueError, KeyError):
                    continue

                curr = (row.get("currency_type") or "EUR").strip().upper()
                pay_method = 0
                try:
                    pay_method = int(row.get("payment_method", 0))
                except ValueError:
                    pass

                transfers = None
                if (
                    row.get("transfers") is not None
                    and str(row.get("transfers")).strip() != ""
                ):
                    try:
                        transfers = int(row["transfers"])
                    except ValueError:
                        pass

                trans_dur = None
                if row.get("transfer_duration"):
                    try:
                        trans_dur = int(row["transfer_duration"])
                    except ValueError:
                        pass

                fares.append(
                    TransitFareModel(
                        build_id=build_id,
                        city=city_lower,
                        fare_id=fare_id,
                        price=price,
                        currency=curr,
                        payment_method=pay_method,
                        transfers=transfers,
                        transfer_duration=trans_dur,
                    )
                )

        quality_report["rows_read"]["fare_attributes.txt"] = read_count
        return fares

    async def _commit_build(
        self,
        build_id: str,
        city_lower: str,
        agencies: list[TransitAgencyModel],
        lines: list[TransitLineModel],
        stations: list[TransitStationModel],
        patterns: list[TransitPatternModel],
        pattern_stops: list[TransitPatternStopModel],
        pattern_trips: list[TransitPatternTripModel],
        station_lines: list[TransitStationLineModel],
        service_summaries: list[TransitServiceSummaryModel],
        service_days: dict[str, TransitServiceDayModel],
        shapes: list[TransitShapeModel],
        transfers: list[TransitTransferModel],
        fares: list[TransitFareModel],
        capabilities: dict[str, Any],
        quality_report: dict[str, Any],
        feed_valid_from: datetime | None,
        feed_valid_to: datetime | None,
    ) -> None:
        """
        Commits all derived objects in batches, atomically points active_build_id to build_id,
        and cleanly prunes previous build rows.
        """
        # Save previous build id for deletion after atomic swap
        query_cache = await self.db.execute(
            select(TransitCacheModel).where(TransitCacheModel.city == city_lower)
        )
        cache_row = query_cache.scalars().first()
        old_build_id = cache_row.active_build_id if cache_row else None

        # Bulk write new records
        batch_collections = [
            agencies,
            lines,
            stations,
            patterns,
            pattern_stops,
            pattern_trips,
            station_lines,
            service_summaries,
            list(service_days.values()),
            shapes,
            transfers,
            fares,
        ]

        for items in batch_collections:
            if not items:
                continue
            batch_size = 5000
            for i in range(0, len(items), batch_size):
                self.db.add_all(items[i : i + batch_size])
                await self.db.flush()

        now = datetime.now(timezone.utc)
        if cache_row:
            cache_row.derived_status = "READY"
            cache_row.derived_at = now
            cache_row.active_build_id = build_id
            cache_row.capabilities = capabilities
            cache_row.feed_valid_from = feed_valid_from
            cache_row.feed_valid_to = feed_valid_to
            cache_row.quality = quality_report
        else:
            new_cache = TransitCacheModel(
                city=city_lower,
                status="READY",
                gtfs_status="READY",
                derived_status="READY",
                derived_at=now,
                active_build_id=build_id,
                capabilities=capabilities,
                feed_valid_from=feed_valid_from,
                feed_valid_to=feed_valid_to,
                quality=quality_report,
            )
            self.db.add(new_cache)

        await self.db.commit()

        # Cleanly delete old build records if one existed
        if old_build_id and old_build_id != build_id:
            logger.info(
                f"Purging old derived transit build {old_build_id} for {city_lower}"
            )
            for model_cls in [
                TransitFareModel,
                TransitTransferModel,
                TransitShapeModel,
                TransitServiceDayModel,
                TransitServiceSummaryModel,
                TransitStationLineModel,
                TransitPatternTripModel,
                TransitPatternStopModel,
                TransitPatternModel,
                TransitStationModel,
                TransitLineModel,
                TransitAgencyModel,
            ]:
                await self.db.execute(
                    delete(model_cls).where(
                        model_cls.build_id == old_build_id,
                        model_cls.city == city_lower,
                    )
                )
            await self.db.commit()
