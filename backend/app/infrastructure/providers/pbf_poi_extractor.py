"""High-Volume Local PBF POI Extractor using pyosmium.

Streams local Geofabrik .osm.pbf extracts and harvests 10,000 to 20,000+
high-quality, deduplicated, noise-free POIs per major city in seconds,
using stratified 6-stream extraction with signal gates and spatial deduplication.
"""

from __future__ import annotations

import logging
import math
import os
import re
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

try:
    import osmium
except ImportError:
    osmium = None

from app.engine.v2.osm_signals import (
    classify_osm_category,
    count_name_languages,
    default_cost_eur,
    default_duration_mins,
    default_hours,
    default_visit_mode,
    extract_osm_signals,
    importance_raw,
)

logger = logging.getLogger(__name__)

# --- Fast-Food Chain Blocklist ------------------------------------------------

GLOBAL_FAST_FOOD_QIDS: set[str] = {
    "Q380",  # McDonald's
    "Q177054",  # Burger King
    "Q244457",  # Subway
    "Q524757",  # KFC
    "Q191560",  # Pizza Hut
    "Q839466",  # Domino's Pizza
    "Q37158",  # Starbucks
    "Q752941",  # Taco Bell
    "Q847743",  # Dunkin'
    "Q550258",  # Wendy's
    "Q2409748",  # Telepizza
    "Q2891963",  # 100 Montaditos
    "Q1626299",  # Five Guys
    "Q1199333",  # Popeyes
    "Q534241",  # Papa John's
}

GLOBAL_FAST_FOOD_NAMES: set[str] = {
    "mcdonald's",
    "mcdonalds",
    "burger king",
    "subway",
    "kfc",
    "kentucky fried chicken",
    "pizza hut",
    "domino's pizza",
    "dominos pizza",
    "domino's",
    "starbucks",
    "taco bell",
    "dunkin'",
    "dunkin donuts",
    "dunkin",
    "wendy's",
    "wendys",
    "telepizza",
    "100 montaditos",
    "five guys",
    "popeyes",
    "papa john's",
    "papa johns",
}

# --- Stream Configuration -----------------------------------------------------


@dataclass
class CityIngestConfig:
    max_stream1_anchor: int = 2500
    max_stream2_parks: int = 1500
    max_stream3_dining: int = 4500
    max_stream4_cafes: int = 2000
    max_stream5_nightlife: int = 2000
    max_stream6_markets: int = 1000
    dedup_distance_m: float = 60.0


# --- Signal Gates & Stream Classification ------------------------------------

_STREAM1_TOURISMS = {
    "attraction",
    "museum",
    "gallery",
    "viewpoint",
    "artwork",
    "theme_park",
    "zoo",
    "aquarium",
}
_STREAM1_HISTORICS = {
    "monument",
    "castle",
    "palace",
    "archaeological_site",
    "ruins",
    "memorial",
    "fort",
    "city_gate",
    "manor",
    "church",
    "cathedral",
    "monastery",
}
_STREAM1_BUILDINGS = {
    "cathedral",
    "basilica",
    "palace",
    "castle",
    "synagogue",
    "mosque",
    "temple",
}

_STREAM2_LEISURE = {"park", "garden", "nature_reserve", "beach_resort"}
_STREAM2_NATURAL = {"beach", "peak", "cliff", "bay", "hot_spring"}

_STREAM3_AMENITY = {"restaurant", "biergarten", "food_court"}
_STREAM4_AMENITY = {"cafe", "ice_cream"}
_STREAM4_SHOP = {"bakery", "pastry", "coffee", "chocolate", "cheese", "deli"}

_STREAM5_AMENITY = {
    "bar",
    "pub",
    "nightclub",
    "theatre",
    "arts_centre",
    "cinema",
    "music_venue",
}

_STREAM6_SHOP = {
    "books",
    "antiques",
    "art",
    "craft",
    "wine",
    "tea",
    "vintage",
    "mall",
    "department_store",
}


def is_fast_food_chain(tags: dict[str, str], name: str) -> bool:
    brand_qid = tags.get("brand:wikidata") or tags.get("wikidata")
    if brand_qid and brand_qid in GLOBAL_FAST_FOOD_QIDS:
        return True
    brand = tags.get("brand", "").lower().strip()
    if brand and any(fn in brand for fn in GLOBAL_FAST_FOOD_NAMES):
        return True
    name_clean = name.lower().strip()
    if any(
        fn == name_clean or name_clean.startswith(f"{fn} ")
        for fn in GLOBAL_FAST_FOOD_NAMES
    ):
        return True
    return False


def classify_stream(
    tags: dict[str, str], name: str, area_m2: float = 0.0
) -> int | None:
    """Classifies an OSM element into one of the 6 streams, enforcing signal gates.

    Returns the stream number (1..6) or None if the element fails gates or does not match.
    """
    if not name:
        return None

    tourism = tags.get("tourism")
    historic = tags.get("historic")
    building = tags.get("building")
    leisure = tags.get("leisure")
    natural = tags.get("natural")
    amenity = tags.get("amenity")
    shop = tags.get("shop")
    place = tags.get("place")

    # 1. Stream 1 — Anchor Sights & Museums
    if (
        tourism in _STREAM1_TOURISMS
        or historic in _STREAM1_HISTORICS
        or building in _STREAM1_BUILDINGS
    ):
        if tourism == "artwork" or historic == "memorial":
            if not (
                tags.get("wikidata")
                or tags.get("wikipedia")
                or count_name_languages(tags) >= 2
            ):
                return None
        return 1

    # 2. Stream 2 — Parks, Plazas, Gardens & Beaches
    if leisure in _STREAM2_LEISURE or place == "square" or natural in _STREAM2_NATURAL:
        if not (
            tags.get("wikidata")
            or tags.get("wikipedia")
            or leisure == "garden"
            or area_m2 > 2000.0
            or len(tags) >= 3
        ):
            return None
        return 2

    # 5. Stream 5 — Nightlife, Tapas Bars, Wine Bars & Live Venues (Checked before dining)
    if amenity in _STREAM5_AMENITY:
        return 5

    # 6. Stream 6 — Food Markets, Historic Bookshops & Local Crafts
    if amenity == "marketplace" or building == "market" or shop in _STREAM6_SHOP:
        has_hours_and_site = bool(
            tags.get("opening_hours")
            and (tags.get("website") or tags.get("contact:website"))
        )
        if (
            tags.get("wikidata")
            or tags.get("wikipedia")
            or tags.get("heritage")
            or amenity == "marketplace"
            or has_hours_and_site
        ):
            return 6
        return None

    # 3. Stream 3 — Restaurants & Traditional Dining
    if amenity in _STREAM3_AMENITY:
        if is_fast_food_chain(tags, name):
            return None
        # Quality signal check: at least 1 quality signal
        has_quality = bool(
            tags.get("cuisine")
            or tags.get("opening_hours")
            or tags.get("website")
            or tags.get("contact:website")
            or tags.get("phone")
            or tags.get("contact:phone")
            or tags.get("outdoor_seating")
            or tags.get("wikidata")
            or tags.get("michelin")
            or any(k.startswith("diet:") for k in tags)
        )
        if not has_quality:
            return None
        return 3

    # 4. Stream 4 — Cafes, Bakeries, Gelato & Breakfast Spots
    if amenity in _STREAM4_AMENITY or shop in _STREAM4_SHOP:
        has_quality = bool(
            tags.get("opening_hours")
            or tags.get("cuisine")
            or tags.get("website")
            or tags.get("contact:website")
            or tags.get("outdoor_seating")
            or tags.get("wikidata")
        )
        if not has_quality:
            return None
        return 4

    return None


def tag_completeness_score(tags: dict[str, str]) -> float:
    """Additive completeness score prioritizing rich POIs over bare name-only nodes."""
    score = 0.0
    if tags.get("wikidata"):
        score += 2.0
    if tags.get("wikipedia"):
        score += 2.0
    if tags.get("opening_hours"):
        score += 1.0
    if tags.get("website") or tags.get("contact:website"):
        score += 1.0
    if tags.get("phone") or tags.get("contact:phone"):
        score += 0.5
    if tags.get("cuisine"):
        score += 1.0
    if tags.get("addr:street") or tags.get("addr:housenumber"):
        score += 0.5
    if tags.get("description"):
        score += 1.0
    if tags.get("image") or tags.get("wikimedia_commons"):
        score += 1.0
    score += min(len(tags) * 0.1, 2.0)
    return round(score, 3)


def approx_polygon_area_m2(lats: list[float], lons: list[float]) -> float:
    """Fast Cartesian shoelace approximation of closed polygon area."""
    if len(lats) < 3:
        return 0.0
    mid_lat = sum(lats) / len(lats)
    m_per_deg_lat = 111132.954
    m_per_deg_lon = 111132.954 * math.cos(math.radians(mid_lat))
    xs = [lon * m_per_deg_lon for lon in lons]
    ys = [lat * m_per_deg_lat for lat in lats]
    area = 0.0
    n = len(xs)
    for i in range(n):
        j = (i + 1) % n
        area += xs[i] * ys[j] - xs[j] * ys[i]
    return abs(area) / 2.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _clean_display_name(tags: dict[str, str]) -> str | None:
    return tags.get("name:en") or tags.get("int_name") or tags.get("name")


def _parse_fee(tags: dict[str, str], category: str) -> tuple[float, bool, str]:
    fee = str(tags.get("fee", "")).lower()
    if fee in ("no", "false", "0"):
        return 0.0, False, "osm_fee_tag_free"
    charge = tags.get("charge")
    if charge:
        digits = "".join(
            c if (c.isdigit() or c == ".") else " " for c in charge
        ).split()
        for tok in digits:
            try:
                return float(tok), False, "osm_charge_tag"
            except ValueError:
                continue
    return default_cost_eur(tags, category), True, "category_benchmark_estimate"


def make_record(
    osm_type: str,
    osm_id: int,
    lat: float,
    lon: float,
    tags: dict[str, str],
    name: str,
    stream: int,
) -> dict[str, Any]:
    category = classify_osm_category(tags)
    sig = extract_osm_signals(tags)
    cost, is_est, cost_src = _parse_fee(tags, category)
    opening = tags.get("opening_hours")
    open_vec: list[int]
    close_vec: list[int]
    hours_source = "osm"
    if opening:
        from app.utils.opening_hours_parser import parse_osm_opening_hours

        sched = parse_osm_opening_hours(opening)
        open_vec = list(sched.open_time_mins_by_day)
        close_vec = list(sched.close_time_mins_by_day)
    else:
        d_open, d_close = default_hours(category, tags)
        open_vec, close_vec = list(d_open), list(d_close)
        hours_source = "assumed_default"

    for i in range(7):
        if open_vec[i] != -1 and close_vec[i] != -1 and open_vec[i] >= close_vec[i]:
            close_vec[i] = open_vec[i] + 60

    score = importance_raw(sig) + tag_completeness_score(tags)

    return {
        "id": f"OSM-{osm_type}-{osm_id}",
        "name": name,
        "category": category,
        "stream": stream,
        "location": {"latitude": float(lat), "longitude": float(lon)},
        "duration_mins": default_duration_mins(tags, category, sig),
        "cost_eur": float(cost),
        "cost_is_estimated": is_est,
        "cost_source": cost_src,
        "osm_opening_hours": opening,
        "scoring": {"rating": 0.0, "reviews": 0},
        "score": score,
        "metadata": {
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "source": "osm_pbf_v2",
            "hours_source": hours_source,
            "local_name": tags.get("name"),
            "cuisine": tags.get("cuisine"),
            "osm": sig,
            "tags": tags,
        },
        "visit_mode": default_visit_mode(tags, category),
        "open_time_mins_by_day": open_vec,
        "close_time_mins_by_day": close_vec,
    }


def spatial_deduplicate(
    records: list[dict[str, Any]], dedup_distance_m: float = 60.0
) -> list[dict[str, Any]]:
    """Deduplicates POIs sharing the same wikidata_id or normalized name within dedup_distance_m.

    When merging, preserves the union of tags and retains the higher-scoring record.
    """
    if not records:
        return []

    # Sort descending by score
    sorted_records = sorted(
        records, key=lambda r: float(r.get("score", 0.0)), reverse=True
    )

    kept: list[dict[str, Any]] = []
    # Fast spatial grid index (cells of ~100m, step ~0.001 deg)
    grid: dict[tuple[int, int], list[int]] = {}
    cell_size = 0.001
    qid_to_kept_idx: dict[str, int] = {}

    for rec in sorted_records:
        r_tags = rec["metadata"]["tags"]
        r_qid = r_tags.get("wikidata") or r_tags.get("wikidata_id")
        r_lat = rec["location"]["latitude"]
        r_lon = rec["location"]["longitude"]
        r_name_norm = rec["name"].strip().lower()

        dup_idx: int | None = None

        # 1. Match by Wikidata ID
        if r_qid and r_qid in qid_to_kept_idx:
            dup_idx = qid_to_kept_idx[r_qid]

        # 2. Match by normalized name + proximity
        if dup_idx is None:
            c_lat = int(math.floor(r_lat / cell_size))
            c_lon = int(math.floor(r_lon / cell_size))
            candidate_indices: list[int] = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    candidate_indices.extend(grid.get((c_lat + dx, c_lon + dy), []))

            for idx in candidate_indices:
                k = kept[idx]
                k_lat = k["location"]["latitude"]
                k_lon = k["location"]["longitude"]
                k_name_norm = k["name"].strip().lower()

                if r_name_norm == k_name_norm:
                    if haversine_m(r_lat, r_lon, k_lat, k_lon) <= dedup_distance_m:
                        dup_idx = idx
                        break

        if dup_idx is not None:
            # Merge tags into the kept record without losing any information
            target = kept[dup_idx]
            target_tags = target["metadata"]["tags"]
            for k, v in r_tags.items():
                if k not in target_tags:
                    target_tags[k] = v
            # If target lacked opening hours or website, adopt from incoming
            if not target.get("osm_opening_hours") and rec.get("osm_opening_hours"):
                target["osm_opening_hours"] = rec["osm_opening_hours"]
                target["open_time_mins_by_day"] = rec["open_time_mins_by_day"]
                target["close_time_mins_by_day"] = rec["close_time_mins_by_day"]
                target["metadata"]["hours_source"] = rec["metadata"]["hours_source"]
        else:
            kept_idx = len(kept)
            kept.append(rec)
            if r_qid:
                qid_to_kept_idx[r_qid] = kept_idx
            c_lat = int(math.floor(r_lat / cell_size))
            c_lon = int(math.floor(r_lon / cell_size))
            grid.setdefault((c_lat, c_lon), []).append(kept_idx)

    return kept


# --- pyosmium Handler ---------------------------------------------------------


class PoiPbfHandler(osmium.SimpleHandler if osmium is not None else object):  # type: ignore[misc]
    """Streams .osm.pbf, filters within city bounding box, and buckets into 6 streams."""

    def __init__(self, bbox: tuple[float, float, float, float]) -> None:
        super().__init__()
        b0, b1, b2, b3 = bbox
        if (
            abs(b0) <= 90
            and abs(b1) <= 90
            and (abs(b2) > 90 or b2 < 0 or abs(b3) > 90 or b3 < 0 or b2 < b1)
        ):
            self.min_lat, self.max_lat = min(b0, b1), max(b0, b1)
            self.min_lon, self.max_lon = min(b2, b3), max(b2, b3)
        else:
            self.min_lat, self.max_lat = min(b0, b2), max(b0, b2)
            self.min_lon, self.max_lon = min(b1, b3), max(b1, b3)

        self.streams: dict[int, list[dict[str, Any]]] = {
            1: [],
            2: [],
            3: [],
            4: [],
            5: [],
            6: [],
        }

    def _in_bbox(self, lat: float, lon: float) -> bool:
        return (
            self.min_lat <= lat <= self.max_lat and self.min_lon <= lon <= self.max_lon
        )

    def node(self, n: osmium.osm.Node) -> None:
        if not n.location.valid():
            return
        lat = n.location.lat
        lon = n.location.lon
        if not self._in_bbox(lat, lon):
            return

        tags = {tag.k: tag.v for tag in n.tags}
        name = _clean_display_name(tags)
        if not name:
            return

        stream = classify_stream(tags, name, area_m2=0.0)
        if stream is None:
            return

        rec = make_record("node", n.id, lat, lon, tags, name, stream)
        self.streams[stream].append(rec)

    def way(self, w: osmium.osm.Way) -> None:
        tags = {tag.k: tag.v for tag in w.tags}
        name = _clean_display_name(tags)
        if not name:
            return

        # Check preliminary stream match before computing way coordinates
        stream = classify_stream(tags, name, area_m2=0.0)
        if stream is None:
            return

        lats: list[float] = []
        lons: list[float] = []
        for n in w.nodes:
            if n.location.valid():
                lats.append(n.location.lat)
                lons.append(n.location.lon)

        if not lats:
            return

        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)

        if not self._in_bbox(centroid_lat, centroid_lon):
            return

        area_m2 = 0.0
        if w.is_closed() and len(lats) >= 4:
            area_m2 = approx_polygon_area_m2(lats, lons)

        # Re-check stream 2 area gate with actual calculated polygon area
        if stream == 2:
            stream = classify_stream(tags, name, area_m2=area_m2)
            if stream is None:
                return

        rec = make_record("way", w.id, centroid_lat, centroid_lon, tags, name, stream)
        self.streams[stream].append(rec)


# --- PBF File Discovery & Extractor Runner -------------------------------------


class PbfPoiExtractor:
    """Orchestrates streaming extraction from .osm.pbf files."""

    @classmethod
    def find_local_pbf(cls, city_name: str) -> str | None:
        """Looks for existing .osm.pbf on disk in standard paths."""
        city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())
        search_dirs = [
            os.environ.get("OSM_PBF_DIR", "/custom_files"),
            "/custom_files",
            os.path.abspath("./data/custom_files"),
            os.path.abspath("./custom_files"),
        ]

        for d in search_dirs:
            if not os.path.isdir(d):
                continue
            for f in os.listdir(d):
                if f.endswith(".osm.pbf"):
                    f_lower = f.lower()
                    if city_clean in f_lower or f_lower.startswith(city_clean):
                        full_path = os.path.join(d, f)
                        if os.path.getsize(full_path) > 0:
                            return full_path
        return None

    @classmethod
    async def ensure_city_pbf(cls, city_name: str) -> str | None:
        """Finds or dynamically downloads the city's Geofabrik .osm.pbf extract."""
        existing = cls.find_local_pbf(city_name)
        if existing:
            logger.info(f"Using existing local OSM PBF at {existing}")
            return existing

        try:
            from app.services.osm_map_service import OSMMapService

            url, filename = await OSMMapService.resolve_osm_pbf_url(city_name)
            target_dir = os.environ.get("OSM_PBF_DIR", "/custom_files")
            if not os.path.exists(target_dir):
                try:
                    os.makedirs(target_dir, exist_ok=True)
                except OSError:
                    target_dir = os.path.abspath("./data/custom_files")
                    os.makedirs(target_dir, exist_ok=True)

            dest_path = os.path.join(target_dir, filename)
            if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
                return dest_path

            logger.info(
                f"Downloading OSM PBF for '{city_name}' from {url} to {dest_path}..."
            )
            urllib.request.urlretrieve(url, dest_path)
            if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
                logger.info(
                    f"Successfully downloaded {filename} ({os.path.getsize(dest_path)} bytes)"
                )
                return dest_path
        except Exception as exc:
            logger.warning(f"Could not download PBF extract for '{city_name}': {exc}")
        return None

    @classmethod
    def extract_from_pbf(
        cls,
        pbf_path: str,
        bbox: tuple[float, float, float, float],
        config: CityIngestConfig | None = None,
    ) -> list[dict[str, Any]]:
        """Extracts, deduplicates, and caps POIs across 6 streams from a local .osm.pbf."""
        config = config or CityIngestConfig()
        logger.info(
            f"Streaming OSM PBF {pbf_path} for bbox {bbox} across 6 stratified streams..."
        )
        handler = PoiPbfHandler(bbox)
        handler.apply_file(pbf_path, locations=True)

        caps = {
            1: config.max_stream1_anchor,
            2: config.max_stream2_parks,
            3: config.max_stream3_dining,
            4: config.max_stream4_cafes,
            5: config.max_stream5_nightlife,
            6: config.max_stream6_markets,
        }

        all_curated_pois: list[dict[str, Any]] = []

        for stream_id in sorted(handler.streams.keys()):
            raw_recs = handler.streams[stream_id]
            deduped = spatial_deduplicate(
                raw_recs, dedup_distance_m=config.dedup_distance_m
            )
            # Sort descending by score
            deduped.sort(key=lambda r: float(r.get("score", 0.0)), reverse=True)
            stream_cap = caps.get(stream_id, 2000)
            capped = deduped[:stream_cap]
            logger.info(
                f"Stream {stream_id}: raw={len(raw_recs)}, deduped={len(deduped)}, "
                f"capped={len(capped)} (budget={stream_cap})"
            )
            all_curated_pois.extend(capped)

        logger.info(
            f"PBF extraction complete: total curated POIs = {len(all_curated_pois)} for {pbf_path}"
        )
        return all_curated_pois
