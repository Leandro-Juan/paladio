#!/usr/bin/env python3
"""
Builds the compact gzipped locations & commercial airports dataset
(`frontend/src/server/demo-locations.json.gz`) for Demo Mode from the same
authoritative `airportsdata` and `geonamescache` sources used by the backend
`AirportService`.
"""

from __future__ import annotations

import gzip
import json
import unicodedata
from pathlib import Path

import airportsdata
import geonamescache

NON_COMMERCIAL_KEYWORDS = (
    "seaplane",
    "heliport",
    "helipad",
    "gliderport",
    "raf ",
    "air force base",
    "air base",
    "naval air",
    "army air",
    "air station",
)

MIN_CITY_POPULATION = 2000

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "frontend" / "src" / "server" / "demo-locations.json.gz"


def _normalize_name(name: str) -> str:
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def build_locations_payload() -> dict[str, object]:
    raw_airports = airportsdata.load("IATA")
    airports: list[list[object]] = []
    for code, ap in sorted(raw_airports.items()):
        iata = (code or "").strip().upper()
        if not iata or iata in ("\\N", "0") or len(iata) != 3:
            continue
        lat = ap.get("lat")
        lon = ap.get("lon")
        if lat is None or lon is None:
            continue
        name = (ap.get("name") or "").strip()
        name_lower = name.lower()
        if any(kw in name_lower for kw in NON_COMMERCIAL_KEYWORDS):
            continue
        elev = ap.get("elevation")
        airports.append(
            [
                iata,
                (ap.get("icao") or "").strip().upper(),
                name,
                (ap.get("city") or "").strip(),
                (ap.get("country") or "").strip().upper(),
                round(float(lat), 5),
                round(float(lon), 5),
                round(float(elev), 1) if elev is not None else None,
            ]
        )

    gc = geonamescache.GeonamesCache(min_city_population=500)
    raw_countries = gc.get_countries()
    countries: dict[str, list[str]] = {}
    for iso2, c_data in sorted(raw_countries.items()):
        countries[iso2] = [
            c_data.get("name", iso2),
            c_data.get("iso3", "") or "",
            c_data.get("capital", "") or "",
        ]

    raw_cities = gc.get_cities()
    cities: list[list[object]] = []
    for city in raw_cities.values():
        pop = int(city.get("population") or 0)
        if pop < MIN_CITY_POPULATION:
            continue
        lat = city.get("latitude")
        lon = city.get("longitude")
        if lat is None or lon is None:
            continue
        name = city.get("name", "")
        row: list[object] = [
            name,
            (city.get("countrycode") or "").upper(),
            pop,
            round(float(lat), 4),
            round(float(lon), 4),
        ]
        if pop >= 50000:
            norm_main = _normalize_name(name)
            seen = {norm_main}
            alts: list[str] = []
            for alt in city.get("alternatenames") or ():
                norm_alt = _normalize_name(alt)
                if (
                    norm_alt
                    and len(norm_alt) >= 3
                    and norm_alt not in seen
                    and all(ord(ch) < 128 for ch in norm_alt)
                ):
                    seen.add(norm_alt)
                    alts.append(alt)
                    if len(alts) >= 6:
                        break
            if alts:
                row.append(alts)
        cities.append(row)

    return {
        "airports": airports,
        "countries": countries,
        "cities": cities,
    }


def main() -> None:
    payload = build_locations_payload()
    raw_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    compressed = gzip.compress(raw_bytes, compresslevel=9)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(compressed)
    print(
        f"Wrote {OUTPUT_PATH} "
        f"({len(payload['airports'])} airports, "  # type: ignore[arg-type]
        f"{len(payload['cities'])} cities, "  # type: ignore[arg-type]
        f"{len(compressed) / 1024:.1f} KiB gzipped)"
    )


if __name__ == "__main__":
    main()
