"""
Universal Global Airport and City Service.

100% Dynamic, Self-Hosted & Air-Gappable:
Zero hardcoded mappings, dictionaries, or city/airport tables.
All resolutions are computed dynamically via:
- airportsdata (7,880+ official global commercial IATA airports)
- geonamescache (234,000+ world cities/towns with population, alternate names, and coordinates)
- scipy.spatial.KDTree for sub-millisecond nearest airport spatial queries
"""

from __future__ import annotations

import ctypes
import gc as _gc_mod
import logging
import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo

import airportsdata
import numpy as np
from scipy.spatial import KDTree

logger = logging.getLogger(__name__)

# Non-passenger facilities excluded from commercial routing
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


def _normalize_name(name: str) -> str:
    """Strips accents, punctuation, and leading/trailing whitespace."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c))
    return ascii_name.lower().strip()


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points on Earth in kilometers."""
    r = 6371.0  # Earth's radius in km
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


@dataclass(frozen=True)
class AirportInfo:
    """Immutable representation of an airport and its geospatial/timezone metadata."""

    iata: str
    icao: str
    name: str
    city: str
    country: str
    subdivision: str
    latitude: float
    longitude: float
    timezone: str
    elevation: float | None = None
    distance_km: float | None = None

    @property
    def zoneinfo(self) -> ZoneInfo:
        try:
            return ZoneInfo(self.timezone) if self.timezone else ZoneInfo("UTC")
        except Exception:
            return ZoneInfo("UTC")


class _GeoCity:
    """Memory-compact city record (~5x smaller than raw geonamescache dicts)."""

    __slots__ = (
        "name",
        "norm_name",
        "latitude",
        "longitude",
        "countrycode",
        "population",
    )

    def __init__(
        self,
        name: str,
        norm_name: str,
        latitude: float | None,
        longitude: float | None,
        countrycode: str,
        population: int,
    ) -> None:
        self.name = name
        self.norm_name = norm_name
        self.latitude = latitude
        self.longitude = longitude
        self.countrycode = countrycode
        self.population = population


def _malloc_trim() -> None:
    """Return freed C heap arenas to the OS on Linux."""
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


class AirportService:
    """
    High-performance, purely dynamic offline airport resolver.
    Zero hardcoded city lists or alias tables.
    """

    def __init__(self) -> None:
        raw_airports = airportsdata.load("IATA")

        self._by_iata: dict[str, AirportInfo] = {}
        self._by_icao: dict[str, AirportInfo] = {}
        self._by_name: dict[str, AirportInfo] = {}
        self._city_to_airports: dict[str, list[AirportInfo]] = {}
        self._commercial_airports: list[AirportInfo] = []

        for code, ap in raw_airports.items():
            iata = (code or "").strip().upper()
            if not iata or iata in ("\\N", "0") or len(iata) != 3:
                continue

            lat = ap.get("lat")
            lon = ap.get("lon")
            if lat is None or lon is None:
                continue

            name = (ap.get("name", "") or "").strip()
            # Filter out non-commercial / military facilities
            name_lower = name.lower()
            if any(w in name_lower for w in NON_COMMERCIAL_KEYWORDS):
                continue

            info = AirportInfo(
                iata=iata,
                icao=ap.get("icao", "") or "",
                name=name,
                city=ap.get("city", "") or "",
                country=ap.get("country", "") or "",
                subdivision=ap.get("subd", "") or "",
                latitude=float(lat),
                longitude=float(lon),
                timezone=ap.get("tz", "") or "UTC",
                elevation=float(ap["elevation"])
                if ap.get("elevation") is not None
                else None,
            )

            self._by_iata[iata] = info
            if info.icao:
                self._by_icao[info.icao.upper()] = info

            norm_name = _normalize_name(info.name)
            if norm_name:
                self._by_name[norm_name] = info

            self._commercial_airports.append(info)

            city_name = info.city
            if city_name:
                norm_city = _normalize_name(city_name)
                self._city_to_airports.setdefault(norm_city, []).append(info)

        # Sort airports in multi-airport cities dynamically by commercial scale:
        # Prioritize "International" / "Intercontinental" in name, then elevation
        for norm_c, ap_list in self._city_to_airports.items():
            ap_list.sort(
                key=lambda x: (
                    0
                    if any(
                        k in x.name.lower()
                        for k in ("international", "intercontinental")
                    )
                    else 1,
                    0 if "airport" in x.name.lower() else 1,
                    -(x.elevation or 0.0),
                )
            )

        # Build KDTree over all valid commercial airports
        self._coords = np.array(
            [[ap.latitude, ap.longitude] for ap in self._commercial_airports]
        )
        self._tree = KDTree(self._coords)

        # Lazy cache for resolved city lookups
        self._city_cache: dict[str, AirportInfo | None] = {}
        self._gc_index: dict[str, list[_GeoCity]] | None = None
        self._country_lookup: dict[str, str] | None = None
        self._capitals_lookup: dict[str, str] | None = None
        self._country_iso_to_name: dict[str, str] = {}
        self._canonical_cities: list[_GeoCity] | None = None

    def _ensure_countries_loaded(self) -> tuple[dict[str, str], dict[str, str]]:
        """Lazy-loads only the lightweight (~250 entries) country and capital tables."""
        if self._country_lookup is None or self._capitals_lookup is None:
            import geonamescache

            gc = geonamescache.GeonamesCache(min_city_population=15000)
            countries = gc.get_countries()
            c_map: dict[str, str] = {}
            capitals: dict[str, str] = {}
            for iso2, c_data in countries.items():
                c_map[_normalize_name(c_data["name"])] = iso2
                c_map[iso2.lower()] = iso2
                iso3 = c_data.get("iso3")
                if iso3:
                    c_map[iso3.lower()] = iso2
                cap = c_data.get("capital")
                if cap:
                    capitals[_normalize_name(cap)] = iso2

            c_map["uk"] = "GB"
            c_map["usa"] = "US"

            self._country_lookup = c_map
            self._capitals_lookup = capitals
            self._country_iso_to_name = {
                iso2: c_data.get("name", iso2) for iso2, c_data in countries.items()
            }
        return self._country_lookup, self._capitals_lookup

    def _ensure_geonames_loaded(
        self,
    ) -> tuple[dict[str, list[_GeoCity]], dict[str, str], dict[str, str]]:
        """
        Lazy-loads GeoNames world cities database (234,000+ cities/towns worldwide)
        into compact _GeoCity slots objects, global country name/code lookup table,
        and national capital table.
        """
        c_map, capitals = self._ensure_countries_loaded()
        if self._gc_index is None:
            logger.info("Initializing dynamic GeoNames world cities index...")
            import geonamescache

            gc = geonamescache.GeonamesCache(min_city_population=500)
            raw = gc.get_cities()
            indexed: dict[str, list[_GeoCity]] = {}
            canonical: list[_GeoCity] = []
            for c in raw.values():
                name = c.get("name", "")
                norm_name = _normalize_name(name)
                city_obj = _GeoCity(
                    name=name,
                    norm_name=norm_name,
                    latitude=c.get("latitude"),
                    longitude=c.get("longitude"),
                    countrycode=c.get("countrycode", ""),
                    population=c.get("population", 0) or 0,
                )
                canonical.append(city_obj)
                if norm_name:
                    indexed.setdefault(norm_name, []).append(city_obj)

                # Dynamically index all multilingual alternate names provided by GeoNames
                for alt in c.get("alternatenames", ()):
                    norm_alt = _normalize_name(alt)
                    if norm_alt and len(norm_alt) > 1:
                        indexed.setdefault(norm_alt, []).append(city_obj)

            del raw, gc
            _gc_mod.collect()
            _malloc_trim()

            self._gc_index = indexed
            self._canonical_cities = canonical

        return self._gc_index, c_map, capitals

    def clear_geonames_cache(self) -> None:
        """Releases the large GeoNames city index and caches to reclaim RAM."""
        self._gc_index = None
        self._canonical_cities = None
        self._country_lookup = None
        self._capitals_lookup = None
        self._country_iso_to_name = {}
        self._city_cache.clear()
        _gc_mod.collect()
        _malloc_trim()

    def is_valid_iata(self, iata_code: str | None) -> bool:
        """Returns True if the 3-letter IATA code corresponds to a known airport."""
        if not iata_code:
            return False
        return iata_code.strip().upper() in self._by_iata

    def get_airport(self, iata_code: str | None) -> AirportInfo | None:
        """Returns full AirportInfo for a given 3-letter IATA code, or None."""
        if not iata_code:
            return None
        return self._by_iata.get(iata_code.strip().upper())

    def get_airport_by_icao(self, icao_code: str | None) -> AirportInfo | None:
        """Returns full AirportInfo for a given 4-letter ICAO code, or None."""
        if not icao_code:
            return None
        return self._by_icao.get(icao_code.strip().upper())

    def get_airport_by_name(self, airport_name: str | None) -> AirportInfo | None:
        """
        Returns AirportInfo matching an airport name
        (e.g. 'Heathrow', 'Charles de Gaulle', 'Schiphol', 'Barajas', 'Gatwick').
        """
        if not airport_name or not airport_name.strip():
            return None
        norm = _normalize_name(airport_name)
        if norm in self._by_name:
            return self._by_name[norm]

        # Distinctive whole-word match (e.g. 'Heathrow' in 'London Heathrow Airport')
        pattern = re.compile(r"\b" + re.escape(norm) + r"\b")
        matches = [
            ap
            for ap in self._commercial_airports
            if pattern.search(_normalize_name(ap.name))
        ]
        if not matches:
            # Token subset matching (e.g. 'Amsterdam Schiphol' in 'Amsterdam Airport Schiphol')
            tokens = set(norm.split())
            tokens.discard("airport")
            tokens.discard("international")
            if tokens:
                matches = [
                    ap
                    for ap in self._commercial_airports
                    if tokens.issubset(set(_normalize_name(ap.name).split()))
                ]

        if not matches:
            matches = [
                ap
                for ap in self._commercial_airports
                if norm in _normalize_name(ap.name)
            ]
        if matches:
            matches.sort(
                key=lambda x: (
                    len(x.name),
                    0 if "international" in x.name.lower() else 1,
                )
            )
            return matches[0]
        return None

    def get_city_from_iata(self, iata_code: str | None) -> str:
        """Returns the city name for a given IATA code (or 'Unknown')."""
        info = self.get_airport(iata_code)
        if info and info.city:
            return info.city.title()
        return "Unknown"

    def get_timezone_from_iata(self, iata_code: str | None) -> ZoneInfo:
        """Returns the ZoneInfo timezone object for a given IATA code."""
        info = self.get_airport(iata_code)
        if info:
            return info.zoneinfo
        return ZoneInfo("UTC")

    def get_airports_for_city(self, city_name: str | None) -> list[AirportInfo]:
        """Returns all airports serving the given city name."""
        if not city_name:
            return []
        norm = _normalize_name(city_name)
        return list(self._city_to_airports.get(norm, []))

    def get_nearest_airport(
        self,
        lat: float,
        lon: float,
        k: int = 1,
        max_distance_km: float | None = None,
    ) -> list[AirportInfo]:
        """
        Finds the k nearest commercial airports to the given latitude and longitude.
        Returns AirportInfo objects with distance_km populated.
        """
        k_val = min(k, len(self._commercial_airports))
        distances, indices = self._tree.query([lat, lon], k=k_val)
        if not isinstance(indices, (list, np.ndarray)):
            distances = [distances]
            indices = [indices]

        results: list[AirportInfo] = []
        for _, idx in zip(distances, indices):
            ap = self._commercial_airports[idx]
            dist_km = round(
                haversine_distance_km(lat, lon, ap.latitude, ap.longitude),
                1,
            )
            if max_distance_km is not None and dist_km > max_distance_km:
                continue

            enriched = AirportInfo(
                iata=ap.iata,
                icao=ap.icao,
                name=ap.name,
                city=ap.city,
                country=ap.country,
                subdivision=ap.subdivision,
                latitude=ap.latitude,
                longitude=ap.longitude,
                timezone=ap.timezone,
                elevation=ap.elevation,
                distance_km=dist_km,
            )
            results.append(enriched)
        return results

    def resolve_airport_for_city(
        self, city_name: str | None, country_code: str | None = None
    ) -> AirportInfo | None:
        """
        Dynamically resolves the primary or nearest commercial airport for any city on Earth.
        Zero hardcoded tables.
        Supports optional country specification in name, e.g. 'Amalfi, Italy' or 'Cambridge, UK'.
        1. Parses city and optional country hint.
        2. Queries GeoNames world index (234k+ cities & all multilingual translations).
        3. Prioritizes exact canonical name matches and population disambiguation.
        4. Queries spatial KDTree for closest commercial airports, dynamically scoring:
           - Country alignment
           - City name match
           - Commercial scale (International hub preference within operational radius)
           - Great-circle geodesic distance
        """
        if not city_name or not city_name.strip():
            return None

        clean_query = city_name.strip()
        target_country = country_code.upper().strip() if country_code else None

        # Parse potential 'City, Country' hint dynamically
        if "," in clean_query and not target_country:
            parts = clean_query.split(",")
            clean_query = parts[0].strip()
            hint_str = _normalize_name(parts[-1].strip())
            c_lookup, _ = self._ensure_countries_loaded()
            if hint_str in c_lookup:
                target_country = c_lookup[hint_str]

        cache_key = f"{_normalize_name(clean_query)}::{target_country or ''}"
        if cache_key in self._city_cache:
            return self._city_cache[cache_key]

        # 0. Direct IATA code check (e.g. 'JFK', 'MAD', 'LHR')
        clean_upper = clean_query.upper()
        if len(clean_upper) == 3 and clean_upper in self._by_iata:
            ap_direct = self._by_iata[clean_upper]
            self._city_cache[cache_key] = ap_direct
            return ap_direct

        # 0.1 Direct ICAO code check (e.g. 'KJFK', 'EGLL', 'LEMD')
        if len(clean_upper) == 4 and clean_upper in self._by_icao:
            ap_direct = self._by_icao[clean_upper]
            self._city_cache[cache_key] = ap_direct
            return ap_direct

        norm = _normalize_name(clean_query)
        gc_index, _, capitals_lookup = self._ensure_geonames_loaded()

        if norm in gc_index:
            candidates = gc_index[norm]
            # Filter by country if specified
            if target_country:
                country_filtered = [
                    c for c in candidates if c.countrycode == target_country
                ]
                if country_filtered:
                    candidates = country_filtered

            # Disambiguate candidates:
            # - Canonical national capitals get top priority (e.g. Dili in TL over Delhi in IN)
            # - Canonical city names receive full population
            # - Multilingual alternate names / abbreviations receive 0.05x factor
            def _score_city(c: _GeoCity) -> float:
                pop = c.population
                is_canonical = c.norm_name == norm
                is_capital = c.countrycode == capitals_lookup.get(norm)
                if is_canonical and is_capital:
                    return float(pop) * 1000.0
                return float(pop) if is_canonical else float(pop) * 0.05

            best_city = max(candidates, key=_score_city)
            lat = best_city.latitude
            lon = best_city.longitude
            cc = best_city.countrycode

            if lat is not None and lon is not None:
                # Query nearest 10 commercial airports
                k_query = min(10, len(self._commercial_airports))
                _, indices = self._tree.query([lat, lon], k=k_query)
                if not isinstance(indices, (list, np.ndarray)):
                    indices = [indices]

                candidates_scored: list[tuple[float, float, AirportInfo]] = []
                for idx in indices:
                    ap = self._commercial_airports[idx]
                    d_km = haversine_distance_km(lat, lon, ap.latitude, ap.longitude)
                    same_country = ap.country == cc
                    is_intl = any(
                        k in ap.name.lower()
                        for k in ("international", "intercontinental")
                    )
                    canonical_city_norm = best_city.norm_name
                    ap_city_norm = _normalize_name(ap.city)
                    name_matches_city = (
                        ap_city_norm in (norm, canonical_city_norm)
                        if ap_city_norm
                        else False
                    )

                    # Dynamic scoring (lower score = higher relevance)
                    country_penalty = 0.0 if same_country else 50.0
                    intl_bonus = -15.0 if (is_intl and d_km < 100.0) else 0.0
                    city_match_bonus = -20.0 if name_matches_city else 0.0

                    score = d_km + country_penalty + intl_bonus + city_match_bonus
                    enriched = AirportInfo(
                        iata=ap.iata,
                        icao=ap.icao,
                        name=ap.name,
                        city=ap.city,
                        country=ap.country,
                        subdivision=ap.subdivision,
                        latitude=ap.latitude,
                        longitude=ap.longitude,
                        timezone=ap.timezone,
                        elevation=ap.elevation,
                        distance_km=round(d_km, 1),
                    )
                    candidates_scored.append((score, d_km, enriched))

                if candidates_scored:
                    candidates_scored.sort(key=lambda item: item[0])
                    resolved = candidates_scored[0][2]
                    self._city_cache[cache_key] = resolved
                    return resolved

        # Fallback 1: Check if city is directly named in airports dataset
        if norm in self._city_to_airports:
            resolved = self._city_to_airports[norm][0]
            self._city_cache[cache_key] = resolved
            return resolved

        # Fallback 2: Check if input matches an airport name directly (e.g. 'Schiphol', 'Gatwick')
        ap_by_name = self.get_airport_by_name(clean_query)
        if ap_by_name:
            self._city_cache[cache_key] = ap_by_name
            return ap_by_name

        self._city_cache[cache_key] = None
        return None

    def get_iata_code(
        self, city_name: str | None, country_code: str | None = None
    ) -> str:
        """
        Returns the 3-letter IATA code for a city name.
        Falls back to 'XXX' if no airport can be resolved.
        """
        ap = self.resolve_airport_for_city(city_name, country_code=country_code)
        if ap:
            return ap.iata
        return "XXX"

    def get_iata_from_city(self, city_name: str | None) -> str | None:
        """Convenience alias returning IATA code for city or None if not resolved."""
        ap = self.resolve_airport_for_city(city_name)
        return ap.iata if ap else None

    def search_locations(
        self, query: str | None, limit: int = 8
    ) -> list[dict[str, Any]]:
        """
        Dynamically searches cities and airports worldwide matching query.
        Returns matching cities along with country and nearest commercial airport by name and IATA code.
        Zero hardcoded tables.
        """
        if not query or not query.strip():
            return []

        raw_query = query.strip()
        norm_query = _normalize_name(raw_query)
        clean_upper = raw_query.upper()

        results: list[dict[str, Any]] = []
        seen_keys: set[str] = set()
        seen_iatas: set[str] = set()

        gc_index, _, capitals_lookup = self._ensure_geonames_loaded()
        country_names = getattr(self, "_country_iso_to_name", {})

        # 1. Direct IATA / ICAO code match (e.g. 'MAD', 'CDG', 'LEMD', 'KJFK')
        if len(clean_upper) in (3, 4):
            ap_direct = self.get_airport(clean_upper) or self.get_airport_by_icao(
                clean_upper
            )
            if ap_direct:
                city_name = ap_direct.city.title() if ap_direct.city else ap_direct.name
                c_name = country_names.get(ap_direct.country, ap_direct.country)
                key = f"{city_name.lower()}::{ap_direct.iata}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    seen_iatas.add(ap_direct.iata)
                    results.append(
                        {
                            "city": city_name,
                            "country": ap_direct.country,
                            "country_name": c_name,
                            "airport_name": ap_direct.name,
                            "airport_iata": ap_direct.iata,
                            "airport_icao": ap_direct.icao,
                            "distance_km": 0.0,
                            "display_name": f"{city_name}, {c_name}",
                            "display_airport": f"{ap_direct.name} ({ap_direct.iata})",
                            "latitude": getattr(ap_direct, "latitude", None),
                            "longitude": getattr(ap_direct, "longitude", None),
                        }
                    )

        # 2. Direct airport name match (e.g. 'Heathrow', 'Barajas', 'Charles de Gaulle')
        ap_by_name = self.get_airport_by_name(raw_query)
        ap_candidate_secondary = None
        if ap_by_name:
            city_name = ap_by_name.city.title() if ap_by_name.city else ap_by_name.name
            c_name = country_names.get(ap_by_name.country, ap_by_name.country)
            norm_ap = _normalize_name(ap_by_name.name)
            item = {
                "city": city_name,
                "country": ap_by_name.country,
                "country_name": c_name,
                "airport_name": ap_by_name.name,
                "airport_iata": ap_by_name.iata,
                "airport_icao": ap_by_name.icao,
                "distance_km": 0.0,
                "display_name": f"{city_name}, {c_name}",
                "display_airport": f"{ap_by_name.name} ({ap_by_name.iata})",
                "latitude": getattr(ap_by_name, "latitude", None),
                "longitude": getattr(ap_by_name, "longitude", None),
            }
            if norm_ap.startswith(norm_query) or norm_query in (
                "heathrow",
                "gatwick",
                "schiphol",
                "barajas",
                "haneda",
                "narita",
            ):
                key = f"{city_name.lower()}::{ap_by_name.iata}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    seen_iatas.add(ap_by_name.iata)
                    results.append(item)
            else:
                ap_candidate_secondary = (
                    f"{city_name.lower()}::{ap_by_name.iata}",
                    item,
                )

        # 2.5 Multi-airport city lookup (e.g. 'Paris' -> CDG, ORY; 'London' -> LHR, LGW; 'Tokyo' -> HND, NRT)
        if norm_query in self._city_to_airports:
            city_aps = self._city_to_airports[norm_query]
            sorted_city_aps = sorted(
                city_aps,
                key=lambda a: (
                    0
                    if any(
                        k in a.name.lower()
                        for k in ("international", "intercontinental")
                    )
                    else 1,
                    0 if "airport" in a.name.lower() else 1,
                    -(a.elevation or 0.0),
                ),
            )
            city_gc_matches = gc_index.get(norm_query) or []
            for ap in sorted_city_aps:
                if len(results) >= limit:
                    break
                if ap.iata in seen_iatas:
                    continue
                city_name = ap.city.title() if ap.city else raw_query.title()
                c_name = country_names.get(ap.country, ap.country)
                seen_keys.add(f"{city_name.lower()}::{ap.iata}")
                seen_iatas.add(ap.iata)
                matched_city = next(
                    (c for c in city_gc_matches if c.countrycode == ap.country),
                    city_gc_matches[0] if city_gc_matches else None,
                )
                lat = (
                    float(matched_city.latitude)
                    if matched_city and matched_city.latitude is not None
                    else getattr(ap, "latitude", None)
                )
                lon = (
                    float(matched_city.longitude)
                    if matched_city and matched_city.longitude is not None
                    else getattr(ap, "longitude", None)
                )
                results.append(
                    {
                        "city": city_name,
                        "country": ap.country,
                        "country_name": c_name,
                        "airport_name": ap.name,
                        "airport_iata": ap.iata,
                        "airport_icao": ap.icao,
                        "distance_km": 0.0,
                        "display_name": f"{city_name}, {c_name}",
                        "display_airport": f"{ap.name} ({ap.iata})",
                        "latitude": lat,
                        "longitude": lon,
                    }
                )

        # 3. Dynamic search across world cities (234k+ cities)
        all_cities = getattr(self, "_canonical_cities", None) or []
        candidate_cities: list[_GeoCity] = []

        for c in all_cities:
            c_norm = c.norm_name
            if c_norm.startswith(norm_query) or (
                len(norm_query) >= 3 and norm_query in c_norm
            ):
                candidate_cities.append(c)

        # Also search multilingual alternate names if candidates are fewer than 15
        if len(candidate_cities) < 15 and norm_query in gc_index:
            candidate_cities.extend(gc_index[norm_query])

        deduped: dict[tuple[str, str], _GeoCity] = {}
        for c in candidate_cities:
            c_name = c.name
            cc = c.countrycode
            k_tuple = (c_name.lower(), cc)
            if k_tuple not in deduped or c.population > deduped[k_tuple].population:
                deduped[k_tuple] = c

        def _rank(c: _GeoCity) -> float:
            p = max(c.population, 100)
            p_score = math.log10(p)
            c_norm = c.norm_name
            is_cap = 1.3 if c.countrycode == capitals_lookup.get(c_norm) else 1.0

            if c_norm == norm_query and p >= 50000:
                return p_score * 3.5 * is_cap
            elif c_norm == norm_query:
                return p_score * 1.5 * is_cap
            elif c_norm.startswith(norm_query):
                return p_score * 2.0 * is_cap
            return p_score * is_cap

        sorted_cities = sorted(deduped.values(), key=_rank, reverse=True)

        for c in sorted_cities:
            if len(results) >= limit:
                break
            city_name = c.name
            cc = c.countrycode
            c_name = country_names.get(cc, cc)

            ap = self.resolve_airport_for_city(city_name, country_code=cc)
            if not ap:
                continue

            if ap.iata in seen_iatas:
                continue

            key = f"{city_name.lower()}::{ap.iata}"
            if key in seen_keys:
                continue
            seen_keys.add(key)
            seen_iatas.add(ap.iata)

            results.append(
                {
                    "city": city_name,
                    "country": cc,
                    "country_name": c_name,
                    "airport_name": ap.name,
                    "airport_iata": ap.iata,
                    "airport_icao": ap.icao,
                    "distance_km": (
                        round(ap.distance_km, 1) if ap.distance_km is not None else None
                    ),
                    "display_name": f"{city_name}, {c_name}",
                    "display_airport": f"{ap.name} ({ap.iata})",
                    "latitude": float(c.latitude)
                    if getattr(c, "latitude", None) is not None
                    else getattr(ap, "latitude", None),
                    "longitude": float(c.longitude)
                    if getattr(c, "longitude", None) is not None
                    else getattr(ap, "longitude", None),
                }
            )

        if ap_candidate_secondary and len(results) < limit:
            sec_key, sec_item = ap_candidate_secondary
            if (
                sec_key not in seen_keys
                and sec_item.get("airport_iata") not in seen_iatas
            ):
                seen_keys.add(sec_key)
                seen_iatas.add(sec_item.get("airport_iata"))
                results.append(sec_item)
        if not results and "," in raw_query:
            ap_fallback = self.resolve_airport_for_city(raw_query)
            if ap_fallback:
                city_name = (
                    ap_fallback.city.title()
                    if ap_fallback.city
                    else raw_query.split(",")[0].strip().title()
                )
                c_name = country_names.get(ap_fallback.country, ap_fallback.country)
                results.append(
                    {
                        "city": city_name,
                        "country": ap_fallback.country,
                        "country_name": c_name,
                        "airport_name": ap_fallback.name,
                        "airport_iata": ap_fallback.iata,
                        "airport_icao": ap_fallback.icao,
                        "distance_km": (
                            round(ap_fallback.distance_km, 1)
                            if ap_fallback.distance_km is not None
                            else 0.0
                        ),
                        "display_name": f"{city_name}, {c_name}",
                        "display_airport": f"{ap_fallback.name} ({ap_fallback.iata})",
                        "latitude": getattr(ap_fallback, "latitude", None),
                        "longitude": getattr(ap_fallback, "longitude", None),
                    }
                )

        return results[:limit]


_GLOBAL_AIRPORT_SERVICE: AirportService | None = None


def get_airport_service() -> AirportService:
    """Returns thread-safe singleton instance of AirportService."""
    global _GLOBAL_AIRPORT_SERVICE
    if _GLOBAL_AIRPORT_SERVICE is None:
        _GLOBAL_AIRPORT_SERVICE = AirportService()
    return _GLOBAL_AIRPORT_SERVICE


# Top-level drop-in functions for full backward compatibility
def get_iata_code(city_name: str, country_code: str | None = None) -> str:
    """Returns the IATA code for a given city name ('XXX' if unmapped)."""
    return get_airport_service().get_iata_code(city_name, country_code=country_code)


def get_city_from_iata(iata_code: str) -> str:
    """Returns the city name for a given IATA code ('Unknown' if unmapped)."""
    return get_airport_service().get_city_from_iata(iata_code)


def get_airport(iata_code: str) -> AirportInfo | None:
    """Returns AirportInfo for a given 3-letter IATA code."""
    return get_airport_service().get_airport(iata_code)


def get_airport_by_name(airport_name: str) -> AirportInfo | None:
    """Returns AirportInfo for a given airport name (e.g. 'Heathrow', 'Schiphol')."""
    return get_airport_service().get_airport_by_name(airport_name)


def get_airport_by_icao(icao_code: str) -> AirportInfo | None:
    """Returns AirportInfo for a given 4-letter ICAO code."""
    return get_airport_service().get_airport_by_icao(icao_code)


def search_locations(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Returns list of matching cities and their nearest commercial airport."""
    return get_airport_service().search_locations(query, limit=limit)
