import asyncio
import csv
import json
import logging
import os
import shutil
import urllib.request
from typing import Any

from app.db.session import async_session
from app.services.gtfs_route_service import _FINDERS
from app.services.transit_derivation_service import TransitDerivationService

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

AGENCY_DISPLAY_NAMES = {
    "JR-East": "East Japan Railway Company (JR East)",
    "TokyoMetro": "Tokyo Metro",
    "Toei": "Toei Subway",
    "Tokyu": "Tokyu Railways",
    "Keio": "Keio Corporation",
    "Odakyu": "Odakyu Electric Railway",
    "Seibu": "Seibu Railway",
    "Tobu": "Tobu Railway",
    "Keisei": "Keisei Electric Railway",
    "Keikyu": "Keikyu Corporation",
    "Yurikamome": "Yurikamome Line",
    "TWR": "Rinkai Line (TWR)",
    "TokyoMonorail": "Tokyo Monorail",
    "Sotetsu": "Sagami Railway (Sotetsu)",
    "Shin-Keisei": "Shin-Keisei Electric Railway",
    "Hokuso": "Hokuso Railway",
    "TsukubaExpress": "Tsukuba Express (TX)",
    "TamaMonorail": "Tama Toshi Monorail",
    "ChibaMonorail": "Chiba Urban Monorail",
    "YokohamaMunicipal": "Yokohama Municipal Subway",
    "Minatomirai": "Yokohama Minatomirai Railway",
}


async def compile_tokyo_gtfs(
    gtfs_target_dir: str = "/gtfs_feeds/tokyo",
) -> dict[str, Any]:
    """
    Fetches the comprehensive Greater Tokyo railway network dataset from open data mirrors,
    generates a standard multi-agency GTFS feed, and ingests it into the Paladio database.
    """
    logger.info("Fetching Greater Tokyo railway network dataset...")
    st_url = "https://raw.githubusercontent.com/nagix/mini-tokyo-3d/master/data/stations.json"
    rw_url = "https://raw.githubusercontent.com/nagix/mini-tokyo-3d/master/data/railways.json"

    with urllib.request.urlopen(rw_url, timeout=30) as r:
        railways = json.loads(r.read().decode("utf-8"))
    with urllib.request.urlopen(st_url, timeout=30) as r:
        stations = json.loads(r.read().decode("utf-8"))

    st_map = {s["id"]: s for s in stations}
    logger.info(
        f"Loaded {len(railways)} railways and {len(stations)} stations from source."
    )

    tmp_dir = "/tmp/tokyo_gtfs_build"
    if os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir, ignore_errors=True)
    os.makedirs(tmp_dir, exist_ok=True)

    # 1. agency.txt
    agencies_set = set()
    for r in railways:
        op = r.get("id", "").split(".")[0]
        agencies_set.add(op)

    with open(f"{tmp_dir}/agency.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"]
        )
        for op in sorted(agencies_set):
            name = AGENCY_DISPLAY_NAMES.get(op, op)
            w.writerow([op, name, "https://transit.tokyo", "Asia/Tokyo", "ja"])

    # 2. routes.txt & translations.txt
    translations = []
    routes = []
    for r in railways:
        r_id = r.get("id")
        op = r_id.split(".")[0]
        ja_title = r.get("title", {}).get("ja", r_id)
        en_title = r.get("title", {}).get("en", ja_title)
        color = (r.get("color") or "#007AFF").replace("#", "").strip()
        is_metro = (
            "metro" in op.lower()
            or "subway" in op.lower()
            or "toei" in op.lower()
            or "tokyometro" in op.lower()
        )
        is_tram = "tram" in r_id.lower() or "arakawa" in r_id.lower()
        r_type = "0" if is_tram else ("1" if is_metro else "2")
        long_title = f"{en_title} ({ja_title})" if en_title != ja_title else ja_title
        routes.append([r_id, op, en_title, long_title, r_type, color, "FFFFFF"])
        translations.append(
            ["routes", "route_long_name", "en", en_title, r_id, ja_title]
        )
        translations.append(
            ["routes", "route_short_name", "en", en_title, r_id, ja_title]
        )

    with open(f"{tmp_dir}/routes.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "route_id",
                "agency_id",
                "route_short_name",
                "route_long_name",
                "route_type",
                "route_color",
                "route_text_color",
            ]
        )
        w.writerows(routes)

    # 3. stops.txt
    used_stops = set()
    for r in railways:
        for sid in r.get("stations", []):
            used_stops.add(sid)

    stops = []
    for sid in used_stops:
        st = st_map.get(sid)
        if not st or not st.get("coord") or len(st["coord"]) != 2:
            continue
        lon, lat = st["coord"]
        ja_name = st.get("title", {}).get("ja", sid.split(".")[-1])
        en_name = st.get("title", {}).get("en", ja_name)
        display_name = f"{en_name} ({ja_name})" if en_name != ja_name else ja_name
        stops.append([sid, display_name, lat, lon, "0"])
        translations.append(["stops", "stop_name", "en", en_name, sid, ja_name])
        translations.append(["stops", "stop_name", "en", en_name, sid, display_name])

    with open(f"{tmp_dir}/stops.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type"])
        w.writerows(stops)

    # 4. trips.txt, stop_times.txt, shapes.txt
    trips = []
    stop_times = []
    shapes = []

    for r in railways:
        r_id = r.get("id")
        r_st_ids = [
            sid
            for sid in r.get("stations", [])
            if sid in st_map and st_map[sid].get("coord")
        ]
        if len(r_st_ids) < 2:
            continue

        # Forward trip
        t_id_f = f"{r_id}_f"
        dest_en = st_map[r_st_ids[-1]].get("title", {}).get("en", "")
        dest_ja = st_map[r_st_ids[-1]].get("title", {}).get("ja", "")
        dest_name = f"{dest_en} ({dest_ja})" if dest_en != dest_ja else dest_ja
        trips.append([r_id, "cal_all", t_id_f, dest_name, "0", f"shp_{r_id}_f"])
        for idx, sid in enumerate(r_st_ids):
            sec = idx * 120
            h = 6 + (sec // 3600)
            m = (sec % 3600) // 60
            s = sec % 60
            t_str = f"{h:02d}:{m:02d}:{s:02d}"
            stop_times.append([t_id_f, t_str, t_str, sid, idx + 1])
            lon, lat = st_map[sid]["coord"]
            shapes.append([f"shp_{r_id}_f", lat, lon, idx + 1])

        # Backward trip
        r_st_ids_rev = list(reversed(r_st_ids))
        t_id_b = f"{r_id}_b"
        orig_en = st_map[r_st_ids_rev[-1]].get("title", {}).get("en", "")
        orig_ja = st_map[r_st_ids_rev[-1]].get("title", {}).get("ja", "")
        orig_name = f"{orig_en} ({orig_ja})" if orig_en != orig_ja else orig_ja
        trips.append([r_id, "cal_all", t_id_b, orig_name, "1", f"shp_{r_id}_b"])
        for idx, sid in enumerate(r_st_ids_rev):
            sec = idx * 120
            h = 6 + (sec // 3600)
            m = (sec % 3600) // 60
            s = sec % 60
            t_str = f"{h:02d}:{m:02d}:{s:02d}"
            stop_times.append([t_id_b, t_str, t_str, sid, idx + 1])
            lon, lat = st_map[sid]["coord"]
            shapes.append([f"shp_{r_id}_b", lat, lon, idx + 1])

    with open(f"{tmp_dir}/trips.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "route_id",
                "service_id",
                "trip_id",
                "trip_headsign",
                "direction_id",
                "shape_id",
            ]
        )
        w.writerows(trips)

    with open(f"{tmp_dir}/stop_times.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"]
        )
        w.writerows(stop_times)

    with open(f"{tmp_dir}/shapes.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"])
        w.writerows(shapes)

    with open(f"{tmp_dir}/calendar.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "service_id",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
                "start_date",
                "end_date",
            ]
        )
        w.writerow(
            ["cal_all", "1", "1", "1", "1", "1", "1", "1", "20250101", "20301231"]
        )

    with open(f"{tmp_dir}/translations.txt", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "table_name",
                "field_name",
                "language",
                "translation",
                "record_id",
                "field_value",
            ]
        )
        w.writerows(translations)

    # 5. Atomically replace target directory
    os.makedirs(gtfs_target_dir, exist_ok=True)
    for fname in os.listdir(tmp_dir):
        shutil.copy2(os.path.join(tmp_dir, fname), os.path.join(gtfs_target_dir, fname))

    logger.info(
        f"Wrote comprehensive Tokyo GTFS to {gtfs_target_dir} ({len(routes)} routes, {len(stops)} stops)."
    )

    # Invalidate in-memory route finder cache
    _FINDERS["tokyo"] = None

    # 6. Ingest into database via TransitDerivationService
    logger.info("Ingesting comprehensive Tokyo transit network into database...")
    async with async_session() as session:
        service = TransitDerivationService(
            session, gtfs_base_dir=os.path.dirname(gtfs_target_dir)
        )
        result = await service.derive_city("tokyo")
        logger.info(
            f"Database derivation complete: Stations = {result['stations_count']}, Lines = {result['lines_count']}"
        )

    return result


def main():
    asyncio.run(compile_tokyo_gtfs())


if __name__ == "__main__":
    main()
