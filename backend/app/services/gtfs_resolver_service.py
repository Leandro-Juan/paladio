import asyncio
import csv
import logging
import math
import os
import re
import time
from dataclasses import dataclass

import httpx

from app.services.osm_map_service import OSMMapService

logger = logging.getLogger(__name__)

CATALOG_REMOTE_URL = "https://files.mobilitydatabase.org/feeds_v2.csv"
DEFAULT_CATALOG_DISK_PATH = "/custom_files/gtfs_catalog.csv"
FALLBACK_CATALOG_DISK_PATH = "/tmp/gtfs_catalog.csv"
CATALOG_TTL_SECONDS = 86400.0  # 24 hours

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

TOUR_BLACKLIST_KEYWORDS = (
    "tour",
    "tours",
    "sightseeing",
    "hop-on",
    "hop on",
    "shuttle",
    "cruise",
    "sight seeing",
    "open tour",
    "big bus",
    "daytrip",
)

GEOFABRIK_COUNTRY_TO_ISO = {
    "spain": "ES",
    "france": "FR",
    "germany": "DE",
    "italy": "IT",
    "portugal": "PT",
    "austria": "AT",
    "czech-republic": "CZ",
    "united-kingdom": "GB",
    "great-britain": "GB",
    "netherlands": "NL",
    "belgium": "BE",
    "switzerland": "CH",
    "japan": "JP",
    "us": "US",
    "canada": "CA",
    "australia": "AU",
    "mexico": "MX",
    "ireland": "IE",
    "denmark": "DK",
    "norway": "NO",
    "sweden": "SE",
    "finland": "FI",
    "poland": "PL",
    "greece": "GR",
    "hungary": "HU",
    "croatia": "HR",
}

CITY_COUNTRY_MAP: dict[str, str] = {
    "madrid": "ES",
    "barcelona": "ES",
    "sevilla": "ES",
    "valencia": "ES",
    "malaga": "ES",
    "bilbao": "ES",
    "paris": "FR",
    "lyon": "FR",
    "marseille": "FR",
    "nice": "FR",
    "toulouse": "FR",
    "porto": "PT",
    "oporto": "PT",
    "lisbon": "PT",
    "lisboa": "PT",
    "rome": "IT",
    "roma": "IT",
    "milan": "IT",
    "milano": "IT",
    "florence": "IT",
    "firenze": "IT",
    "venice": "IT",
    "venezia": "IT",
    "berlin": "DE",
    "munich": "DE",
    "muenchen": "DE",
    "münchen": "DE",
    "frankfurt": "DE",
    "hamburg": "DE",
    "cologne": "DE",
    "koeln": "DE",
    "vienna": "AT",
    "wien": "AT",
    "prague": "CZ",
    "praha": "CZ",
    "london": "GB",
    "edinburgh": "GB",
    "manchester": "GB",
    "amsterdam": "NL",
    "rotterdam": "NL",
    "brussels": "BE",
    "tokyo": "JP",
    "kyoto": "JP",
    "osaka": "JP",
    "newyork": "US",
    "new york": "US",
    "chicago": "US",
    "sanfrancisco": "US",
}


@dataclass(slots=True)
class GTFSFeedInfo:
    feed_id: str
    provider: str
    name: str
    municipality: str
    subdivision: str
    country: str
    download_url: str
    is_official: bool
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float

    @property
    def bbox_area(self) -> float:
        return max(
            0.0001, (self.max_lat - self.min_lat) * (self.max_lon - self.min_lon)
        )


class GTFSResolverService:
    """
    Dynamic Global GTFS Feed Resolver Service.
    Resolves official, free open-data transit feeds for any city worldwide
    using the Mobility Database global transit catalog.
    Features:
    - In-memory catalog caching (zero disk re-parsing on requests).
    - Anti-tour operator filtering to prefer public transit authorities.
    - Spatial containment and compactness scoring.
    - Zero mocked fallback guarantee: returns None if no feed is available.
    """

    _catalog_cache: list[GTFSFeedInfo] = []
    _last_loaded_timestamp: float = 0.0
    _load_lock: asyncio.Lock = asyncio.Lock()

    @classmethod
    def _get_storage_path(cls) -> str:
        custom_dir = os.path.dirname(DEFAULT_CATALOG_DISK_PATH)
        if os.path.exists(custom_dir) and os.access(custom_dir, os.W_OK):
            return DEFAULT_CATALOG_DISK_PATH
        return FALLBACK_CATALOG_DISK_PATH

    @classmethod
    async def ensure_catalog_loaded(cls, force_refresh: bool = False) -> None:
        """
        Ensures the Mobility Database catalog is loaded into in-memory cache.
        Only reads from disk or downloads remotely if cache is empty, expired, or forced.
        """
        now = time.time()
        if (
            not force_refresh
            and cls._catalog_cache
            and (now - cls._last_loaded_timestamp) < CATALOG_TTL_SECONDS
        ):
            return

        async with cls._load_lock:
            # Re-check under lock to prevent race conditions
            if (
                not force_refresh
                and cls._catalog_cache
                and (time.time() - cls._last_loaded_timestamp) < CATALOG_TTL_SECONDS
            ):
                return

            catalog_path = cls._get_storage_path()
            need_download = force_refresh or not os.path.exists(catalog_path)

            if not need_download and os.path.exists(catalog_path):
                file_age = now - os.path.getmtime(catalog_path)
                if (
                    file_age >= CATALOG_TTL_SECONDS
                    or os.path.getsize(catalog_path) == 0
                ):
                    need_download = True

            if need_download:
                logger.info(
                    f"Downloading global GTFS catalog from {CATALOG_REMOTE_URL} to {catalog_path}..."
                )
                try:
                    headers = {
                        "User-Agent": BROWSER_USER_AGENT,
                        "Accept": "text/csv, application/octet-stream, */*",
                    }
                    async with httpx.AsyncClient(
                        follow_redirects=True, timeout=60.0
                    ) as client:
                        resp = await client.get(CATALOG_REMOTE_URL, headers=headers)
                        resp.raise_for_status()
                        tmp_path = f"{catalog_path}.tmp"
                        with open(tmp_path, "wb") as f:
                            f.write(resp.content)
                        os.replace(tmp_path, catalog_path)
                        logger.info(
                            f"Global GTFS catalog successfully saved ({len(resp.content)} bytes)."
                        )
                except Exception as exc:
                    logger.warning(
                        f"Could not download remote GTFS catalog ({exc}). Attempting to use existing local file."
                    )
                    if (
                        not os.path.exists(catalog_path)
                        or os.path.getsize(catalog_path) == 0
                    ):
                        logger.error("No local GTFS catalog available to load.")
                        return

            # Parse catalog from disk into memory
            cls._parse_catalog_file(catalog_path)

    @classmethod
    def _parse_catalog_file(cls, filepath: str) -> None:
        """Parses CSV file into lightweight GTFSFeedInfo objects in memory."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                loaded: list[GTFSFeedInfo] = []
                for row in reader:
                    # Filter for active GTFS schedule feeds only
                    if row.get("data_type") != "gtfs" or row.get("status") != "active":
                        continue

                    # Filter for open / unauthenticated feeds (auth type 0 or blank)
                    auth_type = row.get("urls.authentication_type", "0")
                    if auth_type not in ("0", "", None):
                        continue

                    download_url = row.get("urls.latest") or row.get(
                        "urls.direct_download"
                    )
                    if not download_url or not download_url.startswith("http"):
                        continue

                    try:
                        min_lat = float(
                            row.get("location.bounding_box.minimum_latitude", 0)
                        )
                        max_lat = float(
                            row.get("location.bounding_box.maximum_latitude", 0)
                        )
                        min_lon = float(
                            row.get("location.bounding_box.minimum_longitude", 0)
                        )
                        max_lon = float(
                            row.get("location.bounding_box.maximum_longitude", 0)
                        )
                    except (ValueError, TypeError):
                        continue

                    # Discard clearly corrupt bounding boxes
                    if min_lat == 0.0 and max_lon == 0.0:
                        continue
                    if (max_lat - min_lat) > 30.0 or (max_lon - min_lon) > 50.0:
                        continue

                    loaded.append(
                        GTFSFeedInfo(
                            feed_id=row.get("id", "").strip(),
                            provider=(row.get("provider") or "").strip(),
                            name=(row.get("name") or "").strip(),
                            municipality=(
                                row.get("location.municipality") or ""
                            ).strip(),
                            subdivision=(
                                row.get("location.subdivision_name") or ""
                            ).strip(),
                            country=(row.get("location.country_code") or "")
                            .strip()
                            .upper(),
                            download_url=download_url.strip(),
                            is_official=str(row.get("is_official", "")).lower()
                            == "true",
                            min_lat=min_lat,
                            max_lat=max_lat,
                            min_lon=min_lon,
                            max_lon=max_lon,
                        )
                    )

                cls._catalog_cache = loaded
                cls._last_loaded_timestamp = time.time()
                logger.info(
                    f"Loaded {len(loaded)} active GTFS feeds into in-memory catalog."
                )
        except Exception as exc:
            logger.error(f"Failed to parse GTFS catalog from {filepath}: {exc}")

    @classmethod
    def _score_candidate(
        cls,
        feed: GTFSFeedInfo,
        city_lower: str,
        center_lat: float,
        center_lon: float,
        city_country: str | None,
    ) -> float:
        """
        Scores a candidate GTFS feed for a target city.
        Higher score = better match. Returns < 0 for disqualification.
        """
        # 1. Country code validation: if city country is known, feed MUST match country
        if city_country and feed.country and feed.country != city_country:
            return -1.0

        # 2. Spatial check: feed must enclose city center coordinate
        if not (
            feed.min_lat <= center_lat <= feed.max_lat
            and feed.min_lon <= center_lon <= feed.max_lon
        ):
            return -1.0

        score = 50.0

        # 3. Anti-Tour Operator Filtering:
        # Check provider and name against tour/sightseeing blacklist
        desc_text = f"{feed.provider} {feed.name}".lower()
        for kw in TOUR_BLACKLIST_KEYWORDS:
            if kw in desc_text:
                score -= 150.0

        # 4. Compactness score:
        # Penalize huge bounding boxes (continent/state-wide rail) and reward municipal metro networks
        area = feed.bbox_area
        score += max(0.0, 60.0 - (math.log(area + 1.0) * 12.0))

        # 5. Text relevance to city name
        muni_lower = feed.municipality.lower()
        subdiv_lower = feed.subdivision.lower()

        if city_lower in muni_lower:
            score += 90.0
        elif city_lower in subdiv_lower:
            score += 50.0
        elif city_lower in desc_text:
            score += 35.0

        # 6. Official Transit Authority boost
        if feed.is_official:
            score += 40.0

        return score

    @classmethod
    async def resolve_gtfs_feed(cls, city_name: str) -> GTFSFeedInfo | None:
        """
        Dynamically finds the best official GTFS transit feed for any city worldwide.
        Returns GTFSFeedInfo if an active open feed is found, or None.
        STRICT ZERO MOCKED FALLBACK: Does not fabricate or return mocked schedule data.
        """
        if not city_name:
            return None

        city_clean = re.sub(r"[^a-z0-9_-]", "", city_name.strip().lower())
        if not city_clean:
            return None

        await cls.ensure_catalog_loaded()
        if not cls._catalog_cache:
            logger.warning(
                f"GTFS catalog is empty; cannot resolve GTFS feed for {city_name}."
            )
            return None

        # 1. Determine city country code
        city_country = CITY_COUNTRY_MAP.get(city_clean)
        if not city_country:
            try:
                osm_url, _ = await OSMMapService.resolve_osm_pbf_url(city_clean)
                for part in osm_url.lower().split("/"):
                    clean_part = part.replace("-latest.osm.pbf", "")
                    if clean_part in GEOFABRIK_COUNTRY_TO_ISO:
                        city_country = GEOFABRIK_COUNTRY_TO_ISO[clean_part]
                        break
            except Exception:
                pass

        # 2. Obtain geographic center for city
        known_lat, known_lon = cls._get_fallback_coords(city_clean)
        bounds = await OSMMapService.get_city_extract_bounds(city_clean)

        if known_lat is not None and known_lon is not None:
            center_lat, center_lon = known_lat, known_lon
        elif bounds:
            center_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
            center_lon = (bounds["min_lon"] + bounds["max_lon"]) / 2.0
        else:
            logger.info(
                f"Could not determine geographic center for {city_name}; no GTFS matched."
            )
            return None

        # 3. In-memory candidate evaluation & scoring
        best_feed: GTFSFeedInfo | None = None
        best_score = 0.0

        for feed in cls._catalog_cache:
            score = cls._score_candidate(
                feed=feed,
                city_lower=city_clean,
                center_lat=center_lat,
                center_lon=center_lon,
                city_country=city_country,
            )
            if score > best_score:
                best_score = score
                best_feed = feed

        if best_feed:
            logger.info(
                f"Resolved GTFS feed for {city_name} (score {best_score:.1f}): "
                f"[{best_feed.feed_id}] {best_feed.provider} - {best_feed.name} ({best_feed.download_url})"
            )
            return best_feed

        logger.info(
            f"No valid open GTFS schedule feed found in global catalog for {city_name}."
        )
        return None

    @staticmethod
    def _get_fallback_coords(city_lower: str) -> tuple[float | None, float | None]:
        """Known anchor coordinates for key destination cities if extract bounds are unavailable."""
        known_coords: dict[str, tuple[float, float]] = {
            "madrid": (40.4168, -3.7038),
            "paris": (48.8566, 2.3522),
            "porto": (41.1579, -8.6291),
            "oporto": (41.1579, -8.6291),
            "barcelona": (41.3874, 2.1686),
            "rome": (41.9028, 12.4964),
            "roma": (41.9028, 12.4964),
            "milan": (45.4642, 9.1900),
            "london": (51.5074, -0.1278),
            "berlin": (52.5200, 13.4050),
            "vienna": (48.2082, 16.3738),
            "prague": (50.0755, 14.4378),
            "amsterdam": (52.3676, 4.9041),
            "lisbon": (38.7223, -9.1393),
            "tokyo": (35.6762, 139.6503),
            "newyork": (40.7128, -74.0060),
            "new york": (40.7128, -74.0060),
        }
        return known_coords.get(city_lower, (None, None))
