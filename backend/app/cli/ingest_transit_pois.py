"""CLI tool to ingest real public transit stations and stops into PostgreSQL attractions table."""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import logging
import math
import os
import re
from typing import Any

from sqlalchemy import func, select

from app.db.models import AttractionModel, CityModel
from app.db.session import async_session

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _clean_lines(val: str | None) -> list[str]:
    if not val:
        return []
    parts = re.split(r"[,;/|]", str(val))
    cleaned = []
    for p in parts:
        c = p.strip()
        if c and c not in cleaned:
            cleaned.append(c)
    return cleaned


def extract_transit_from_gtfs(
    gtfs_dir: str, city_name: str, bbox: tuple[float, float, float, float] | None = None
) -> list[dict[str, Any]]:
    stops_file = os.path.join(gtfs_dir, "stops.txt")
    if not os.path.exists(stops_file):
        return []

    min_lat, max_lat, min_lon, max_lon = bbox if bbox else (-90.0, 90.0, -180.0, 180.0)
    stops: list[dict[str, Any]] = []

    try:
        with open(stops_file, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = (row.get("stop_name") or "").strip()
                if not name:
                    continue
                try:
                    lat = float(row["stop_lat"])
                    lon = float(row["stop_lon"])
                except (ValueError, KeyError):
                    continue

                if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
                    continue

                stop_code = (row.get("stop_code") or "").strip()
                category = (
                    "metro"
                    if "subway" in gtfs_dir.lower() or "metro" in gtfs_dir.lower()
                    else "transit"
                )

                wheelchair_val = row.get("wheelchair_boarding")
                wheelchair = (
                    "yes"
                    if wheelchair_val == "1"
                    else ("no" if wheelchair_val == "2" else None)
                )

                stops.append(
                    {
                        "id": f"gtfs-{city_name.lower()}-{row.get('stop_id', name)}",
                        "name": name,
                        "category": category,
                        "lat": lat,
                        "lng": lon,
                        "lines": [],
                        "stop_code": stop_code if stop_code else None,
                        "wheelchair": wheelchair,
                    }
                )
    except Exception as exc:
        logger.warning(f"Error reading GTFS stops from {stops_file}: {exc}")

    return stops


def extract_transit_from_pbf(
    pbf_path: str,
    bbox: tuple[float, float, float, float],
    city_name: str,
) -> list[dict[str, Any]]:
    import osmium

    min_lat, max_lat, min_lon, max_lon = bbox

    class TransitHandler(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.raw_stops: list[dict[str, Any]] = []

        def node(self, n):
            tags = n.tags
            rw = tags.get("railway")
            st = tags.get("station")
            hw = tags.get("highway")
            pt = tags.get("public_transport")
            am = tags.get("amenity")

            if not (
                rw
                or st
                or hw == "bus_stop"
                or am in ("bus_station", "ferry_terminal")
                or pt
            ):
                return

            name = tags.get("name:en") or tags.get("name")
            if not name:
                return

            lat = n.location.lat
            lon = n.location.lon
            if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
                return

            name_lower = name.lower()
            category = None
            if (
                rw == "subway_entrance"
                or st == "subway"
                or tags.get("subway") == "yes"
                or "metro" in name_lower
                or "subway" in name_lower
                or "u-bahn" in name_lower
            ):
                category = "metro"
            elif (
                rw in ("station", "halt")
                or st == "train"
                or "cercanías" in name_lower
                or "renfe" in name_lower
                or "gare" in name_lower
            ):
                category = "train"
            elif (
                rw == "tram_stop"
                or tags.get("tram") == "yes"
                or "tranvía" in name_lower
            ):
                category = "tram"
            elif (
                am == "bus_station"
                or hw == "bus_stop"
                or pt in ("platform", "stop_position")
                or "bus" in name_lower
            ):
                category = "bus_stop"
            elif pt == "station" or am == "ferry_terminal":
                category = "transit"

            if not category:
                return

            # Entrance nodes (subway_entrance) have 'ref' for exit numbers (e.g. Exit 1, 2, A1)
            # Station and stop nodes have 'ref' for internal station/pole codes.
            # Never treat 'ref' as a transit line. Only legitimate route tags indicate serving lines.
            if rw == "subway_entrance":
                lines = _clean_lines(tags.get("route_ref") or tags.get("lines"))
            else:
                lines = _clean_lines(
                    tags.get("lines")
                    or tags.get("route_ref")
                    or tags.get("line")
                    or tags.get("routes")
                )
            # Remove any line that matches stop/entrance ref code
            ref_val = tags.get("ref")
            if ref_val and ref_val in lines:
                lines = [line_code for line_code in lines if line_code != ref_val]
            operator = tags.get("operator") or tags.get("network")

            self.raw_stops.append(
                {
                    "osm_id": n.id,
                    "name": name,
                    "category": category,
                    "lat": lat,
                    "lng": lon,
                    "lines": lines,
                    "operator": operator,
                    "wheelchair": tags.get("wheelchair"),
                    "tags": dict(tags),
                }
            )

    handler = TransitHandler()
    logger.info(
        f"Extracting transit nodes from {pbf_path} for {city_name} (bbox {bbox})..."
    )
    handler.apply_file(pbf_path)
    return handler.raw_stops


def deduplicate_transit_stops(
    stops: list[dict[str, Any]], distance_m: float = 120.0
) -> list[dict[str, Any]]:
    """Merges duplicate entrances / platforms sharing the same name within distance_m."""
    deduped: list[dict[str, Any]] = []

    for s in stops:
        s_name = s["name"].strip().lower()
        s_cat = s["category"]
        match_idx = None

        for idx, ex in enumerate(deduped):
            if ex["category"] == s_cat and ex["name"].strip().lower() == s_name:
                dist = haversine_m(s["lat"], s["lng"], ex["lat"], ex["lng"])
                if dist < distance_m:
                    match_idx = idx
                    break

        if match_idx is not None:
            # Merge lines
            for line_item in s.get("lines", []):
                if line_item not in deduped[match_idx]["lines"]:
                    deduped[match_idx]["lines"].append(line_item)
        else:
            deduped.append(s)

    return deduped


async def ingest_city_transit(
    city_name: str, max_stops: int = 400, force: bool = False
) -> int:
    async with async_session() as session:
        # Resolve city
        city_stmt = select(CityModel).where(
            func.lower(CityModel.name) == city_name.strip().lower()
        )
        res = await session.execute(city_stmt)
        city_obj = res.scalar_one_or_none()
        if not city_obj:
            logger.error(f"City '{city_name}' not found in database.")
            return 0

        cid = city_obj.id
        cname = city_obj.name
        bbox = city_obj.bbox
        if not bbox or len(bbox) != 4:
            logger.error(f"City '{cname}' does not have a valid 4-element bbox.")
            return 0

        # Canonical CityModel.bbox order is [south, west, north, east]
        b0, b1, b2, b3 = bbox
        bbox_tuple = (min(b0, b2), max(b0, b2), min(b1, b3), max(b1, b3))

        if force:
            from sqlalchemy import delete

            del_stmt = delete(AttractionModel).where(
                AttractionModel.city_id == cid,
                AttractionModel.id.like("OSM-transit-%"),
            )
            await session.execute(del_stmt)
            await session.commit()
            logger.info(f"Purged previous transit POIs for {cname}.")
        else:
            # Check existing transit stops count in database
            exist_stmt = select(func.count(AttractionModel.id)).where(
                AttractionModel.city_id == cid,
                AttractionModel.category.in_(
                    ["transit", "metro", "train", "bus_stop", "tram"]
                ),
            )
            existing_count = (await session.execute(exist_stmt)).scalar() or 0
            if existing_count > 50:
                logger.info(
                    f"City '{cname}' already has {existing_count} transit stops in database. Skipping."
                )
                return existing_count

        extracted_stops: list[dict[str, Any]] = []

        # 1. Check GTFS
        gtfs_dir = f"/gtfs_feeds/{cname.lower()}"
        if os.path.exists(gtfs_dir):
            gtfs_stops = extract_transit_from_gtfs(gtfs_dir, cname, bbox_tuple)
            extracted_stops.extend(gtfs_stops)
            logger.info(f"Extracted {len(gtfs_stops)} stops from GTFS for {cname}")

        # 2. Check local PBF
        from app.infrastructure.providers.pbf_poi_extractor import PbfPoiExtractor

        pbf_path = PbfPoiExtractor.find_local_pbf(cname)
        if pbf_path and os.path.exists(pbf_path):
            pbf_stops = extract_transit_from_pbf(pbf_path, bbox_tuple, cname)
            extracted_stops.extend(pbf_stops)
            logger.info(
                f"Extracted {len(pbf_stops)} raw transit stops from PBF for {cname}"
            )

        if not extracted_stops:
            logger.warning(f"No transit stops found for {cname}.")
            return 0

        # Deduplicate
        deduped = deduplicate_transit_stops(extracted_stops)
        logger.info(f"Deduplicated down to {len(deduped)} transit stops.")

        # Balanced quota across all transit categories so all transit modes appear
        by_category: dict[str, list[dict[str, Any]]] = {}
        for s in deduped:
            by_category.setdefault(s["category"], []).append(s)

        target_quotas = {
            "train": 60,
            "metro": 140,
            "tram": 60,
            "bus_stop": 120,
            "transit": 40,
        }
        capped: list[dict[str, Any]] = []
        for cat, limit in target_quotas.items():
            items = by_category.get(cat, [])
            capped.extend(items[:limit])

        inserted = 0
        for s in capped:
            if s.get("osm_id"):
                osm_id = s["osm_id"]
            else:
                raw_fp = f"{s.get('name', '')}:{s.get('lat', 0.0):.6f}:{s.get('lon', 0.0):.6f}"
                osm_id = int(
                    hashlib.sha256(raw_fp.encode("utf-8")).hexdigest()[:12], 16
                )
            poi_id = f"OSM-transit-{s['category']}-{osm_id}"

            # Check if exists
            chk = await session.execute(
                select(AttractionModel.id).where(AttractionModel.id == poi_id)
            )
            if chk.scalar_one_or_none():
                continue

            lines = s.get("lines", [])
            lines_str = f" Lines: {', '.join(lines[:6])}" if lines else ""
            desc = f"Public transit station ({s['category'].upper()}) serving {cname}.{lines_str}"

            tier = 2 if s["category"] in ("metro", "train") else 3
            iconicity = (
                0.85
                if s["category"] == "metro"
                else 0.80
                if s["category"] == "train"
                else 0.65
            )

            transit_meta = {
                "type": s["category"],
                "lines": [
                    line
                    for line in lines
                    if line != s.get("stop_code")
                    and line != s.get("tags", {}).get("ref")
                ],
                "stop_code": s.get("stop_code"),
                "operator": s.get("operator"),
                "wheelchair": s.get("wheelchair"),
                "station_type": f"{s['category'].title()} Station",
                "tags": s.get("tags", {}),
            }

            model = AttractionModel(
                id=poi_id,
                city=cname,
                city_id=cid,
                name=s["name"],
                category=s["category"],
                location={"latitude": float(s["lat"]), "longitude": float(s["lng"])},
                scoring={"rating": 4.2, "reviews": 120, "iconicity_score": iconicity},
                metadata_field={
                    "transit_info": transit_meta,
                    "tags": s.get("tags", {}),
                },
                tier=tier,
                iconicity_score=iconicity,
                duration_mins=10,
                cost_eur=0.0,
                cost_is_estimated=False,
                cost_source="station_free_entry",
                description=desc,
                description_source="paladio_transit_ingest",
                hours_known=True,
                osm_opening_hours="06:00-01:30",
            )
            session.add(model)
            inserted += 1

        await session.commit()
        logger.info(
            f"Successfully committed {inserted} transit POIs for {cname} into attractions table."
        )
        return inserted


async def main():
    parser = argparse.ArgumentParser(description="Ingest transit POIs for cities")
    parser.add_argument(
        "--city", type=str, default="Madrid", help="City name (or 'all')"
    )
    parser.add_argument("--limit", type=int, default=300, help="Max stops per city")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-ingestion and purge previous transit POIs",
    )
    args = parser.parse_args()

    if args.city.lower() == "all":
        async with async_session() as session:
            cities = (await session.execute(select(CityModel.name))).scalars().all()
        for c in cities:
            await ingest_city_transit(c, max_stops=args.limit, force=args.force)
    else:
        await ingest_city_transit(args.city, max_stops=args.limit, force=args.force)


if __name__ == "__main__":
    asyncio.run(main())
