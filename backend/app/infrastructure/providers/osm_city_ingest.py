"""Universal OpenStreetMap city ingestion (Nominatim geocode + Overpass).

Fetches the high-signal sights of ANY city (wikidata/wikipedia/heritage-tagged objects
are always retrieved first, never lost to an arbitrary result limit), plus real
dining venues. Results are plain dict records ready for tiering and persistence.
Failures raise `CityIngestError`: there is no silent fallback to made-up data.
"""

import asyncio
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from app.engine.v2.osm_signals import (
    classify_osm_category,
    default_cost_eur,
    default_duration_mins,
    default_hours,
    default_visit_mode,
    extract_osm_signals,
)

logger = logging.getLogger(__name__)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "PaladioItineraryEngine/1.0 (https://github.com/Leandro-Juan/Paladio; contact@paladio.local)"

_SETTLEMENT_TYPES = {
    "city",
    "town",
    "village",
    "municipality",
    "administrative",
    "hamlet",
    "suburb",
    "island",
    "borough",
    "county",
}

_nominatim_lock = asyncio.Lock()
_nominatim_last_called = 0.0


class CityIngestError(RuntimeError):
    """Raised when a city cannot be geocoded or its POIs cannot be fetched."""


@dataclass(frozen=True)
class CityGeo:
    name: str
    display_name: str
    lat: float
    lon: float
    radius_km: float
    country_code: str | None
    bbox: list[float] = field(default_factory=list)


def compute_search_radius_km(
    south: float, north: float, west: float, east: float
) -> float:
    """Tourist-core radius derived from the administrative bounding box (3..9 km)."""
    mid_lat = (south + north) / 2.0
    height_km = abs(north - south) * 111.0
    width_km = abs(east - west) * 111.0 * math.cos(math.radians(mid_lat))
    return max(3.0, min(9.0, 0.30 * max(height_km, width_km)))


async def geocode_city(city: str, client: httpx.AsyncClient | None = None) -> CityGeo:
    """Resolves a free-text city name to a centre point and tourist-core radius."""
    global _nominatim_last_called
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        async with _nominatim_lock:
            wait = 1.1 - (time.time() - _nominatim_last_called)
            if wait > 0:
                await asyncio.sleep(wait)
            _nominatim_last_called = time.time()
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "q": city,
                    "format": "jsonv2",
                    "limit": 5,
                    "addressdetails": 1,
                    "accept-language": "en",
                },
                headers={"User-Agent": USER_AGENT},
            )
        resp.raise_for_status()
        results = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CityIngestError(f"Geocoding failed for '{city}': {exc}") from exc
    finally:
        if own_client:
            await client.aclose()

    places = [
        r
        for r in results
        if r.get("addresstype") in _SETTLEMENT_TYPES
        or r.get("type") in _SETTLEMENT_TYPES
        or r.get("category") in ("place", "boundary")
    ]
    if not places:
        raise CityIngestError(f"No settlement found for '{city}'.")
    best = max(places, key=lambda r: float(r.get("importance", 0.0)))
    bbox = [float(x) for x in best.get("boundingbox", [])]
    if len(bbox) == 4:
        radius = compute_search_radius_km(bbox[0], bbox[1], bbox[2], bbox[3])
    else:
        radius = 4.0
    addr = best.get("address", {})
    return CityGeo(
        name=best.get("name") or city,
        display_name=best.get("display_name", city),
        lat=float(best["lat"]),
        lon=float(best["lon"]),
        radius_km=round(radius, 2),
        country_code=addr.get("country_code"),
        bbox=bbox
        if len(bbox) == 4
        else [
            float(best["lat"]) - 0.1,
            float(best["lon"]) - 0.1,
            float(best["lat"]) + 0.1,
            float(best["lon"]) + 0.1,
        ],
    )


# --- Overpass queries ---------------------------------------------------------

_SIGHT_TYPE_FILTERS = [
    '["tourism"~"^(museum|attraction|viewpoint|gallery|zoo|aquarium)$"]',
    '["historic"~"^(monument|ruins|castle|archaeological_site|fort|palace|manor|city_gate|citywalls|tower)$"]',
    '["building"~"^(cathedral|palace|castle|basilica)$"]',
]
_SIGNAL_FILTERS = [
    '["tourism"="artwork"]["wikidata"]',
    '["historic"]["wikidata"]',
    '["amenity"="place_of_worship"]["wikidata"]',
    '["leisure"~"^(park|garden)$"]["wikidata"]',
    '["natural"~"^(peak|beach|waterfall|cave_entrance)$"]["wikidata"]',
    '["man_made"~"^(tower|lighthouse|bridge|obelisk|windmill)$"]["wikidata"]',
    '["tourism"]["wikipedia"]',
    '["heritage"]',
]


def build_sights_query(
    lat: float, lon: float, radius_m: int, high_signal: bool, limit: int
) -> str:
    """Overpass QL for sights. `high_signal=True` selects wikidata/heritage-tagged objects."""
    around = f"(around:{radius_m},{lat},{lon})"
    filters = _SIGNAL_FILTERS if high_signal else _SIGHT_TYPE_FILTERS
    body = "\n".join(f'  nwr{f}["name"]{around};' for f in filters)
    return f"[out:json][timeout:45];\n(\n{body}\n);\nout center tags {limit};"


def build_dining_query(lat: float, lon: float, radius_m: int, limit: int) -> str:
    around = f"(around:{radius_m},{lat},{lon})"
    return (
        "[out:json][timeout:25];\n(\n"
        f'  node["amenity"~"^(restaurant|cafe)$"]["name"]{around};\n'
        f");\nout {limit};"
    )


async def _overpass(
    query: str, client: httpx.AsyncClient, attempts: int = 2
) -> list[dict[str, Any]]:
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    last_exc: Exception | None = None
    for attempt in range(attempts):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                resp = await client.post(
                    endpoint, data={"data": query}, headers=headers, timeout=50.0
                )
                resp.raise_for_status()
                return resp.json().get("elements", [])
            except (httpx.HTTPError, ValueError) as exc:
                last_exc = exc
                continue
        await asyncio.sleep(2.0 * (attempt + 1))
    raise CityIngestError(f"All Overpass endpoints failed: {last_exc}")


# --- Parsing -----------------------------------------------------------------


def _display_name(tags: dict[str, str]) -> str | None:
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


def parse_element(el: dict[str, Any]) -> dict[str, Any] | None:
    """Turns one raw Overpass element into a persistable POI record (or None)."""
    tags: dict[str, str] = el.get("tags") or {}
    name = _display_name(tags)
    if not name:
        return None
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lon is None:
        return None
    if tags.get("tourism") == "theme_park" or tags.get("attraction") in (
        "amusement_ride",
        "carousel",
        "roller_coaster",
        "water_slide",
    ):
        return None

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

    record: dict[str, Any] = {
        "id": f"OSM-{el.get('type', 'node')}-{el.get('id')}",
        "name": name,
        "category": category,
        "location": {"latitude": float(lat), "longitude": float(lon)},
        "duration_mins": default_duration_mins(tags, category, sig),
        "cost_eur": float(cost),
        "cost_is_estimated": is_est,
        "cost_source": cost_src,
        "osm_opening_hours": opening,
        "scoring": {"rating": 0.0, "reviews": 0},
        "metadata": {
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "source": "osm_v2",
            "hours_source": hours_source,
            "local_name": tags.get("name"),
            "cuisine": tags.get("cuisine"),
            "osm": sig,
        },
        "visit_mode": default_visit_mode(tags, category),
    }
    if open_vec is not None and close_vec is not None:
        record["open_time_mins_by_day"] = open_vec
        record["close_time_mins_by_day"] = close_vec
    return record


def _dedupe(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drops duplicate objects (same id) and same-name objects within ~150 m."""
    by_id: dict[str, dict[str, Any]] = {}
    for r in records:
        prev = by_id.get(r["id"])
        if prev is None or _imp(r) > _imp(prev):
            by_id[r["id"]] = r

    kept: list[dict[str, Any]] = []
    for r in sorted(by_id.values(), key=lambda x: (-_imp(x), x["name"])):
        dup = False
        for k in kept:
            if k["name"].lower() == r["name"].lower() and (
                _haversine_m(k["location"], r["location"]) < 150.0
            ):
                dup = True
                break
        if not dup:
            kept.append(r)
    return kept


def _imp(rec: dict[str, Any]) -> float:
    return float((rec["metadata"].get("osm") or {}).get("importance_raw", 0.0))


def _haversine_m(a: dict[str, float], b: dict[str, float]) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dphi = p2 - p1
    dl = math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


async def fetch_city_records(
    geo: CityGeo,
    max_sights: int = 220,
    max_dining: int = 200,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Fetches sights (high-signal first) and dining venues for a geocoded city."""
    own_client = client is None
    client = client or httpx.AsyncClient()
    radius_m = int(geo.radius_km * 1000)
    try:
        high = (
            await _overpass(
                build_sights_query(geo.lat, geo.lon, radius_m, True, 1500), client
            )
            if max_sights > 0
            else []
        )
        low = (
            await _overpass(
                build_sights_query(geo.lat, geo.lon, radius_m, False, 800), client
            )
            if max_sights > 0
            else []
        )
        dining_radius = int(min(geo.radius_km, 3.5) * 1000)
        dining = (
            await _overpass(
                build_dining_query(geo.lat, geo.lon, dining_radius, 600), client
            )
            if max_dining > 0
            else []
        )
    finally:
        if own_client:
            await client.aclose()

    sights = [r for r in (parse_element(e) for e in high + low) if r]
    sights = _dedupe(sights)[:max_sights]

    meals = [r for r in (parse_element(e) for e in dining) if r]
    meals = [m for m in meals if m["category"] in ("restaurant", "cafe")]
    # Prefer venues with real data (hours/cuisine/website) over bare name-only nodes.
    meals.sort(
        key=lambda m: (
            -(
                (1 if m["osm_opening_hours"] else 0)
                + (1 if m["metadata"].get("cuisine") else 0)
                + (1 if (m["metadata"]["osm"] or {}).get("website") else 0)
            ),
            m["name"],
        )
    )
    meals = _dedupe(meals)[:max_dining]

    logger.info(
        f"Fetched {len(sights)} sights and {len(meals)} dining venues for {geo.name} "
        f"(radius {geo.radius_km} km)."
    )
    if max_sights > 0 and not sights:
        raise CityIngestError(
            f"No sights found around {geo.name} ({geo.lat:.4f},{geo.lon:.4f})."
        )
    return sights + meals
