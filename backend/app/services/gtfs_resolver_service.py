import asyncio
import csv
import logging
import math
import os
import time
import unicodedata
from dataclasses import dataclass, field

import httpx
from app.domain.city_key import (
    _get_geonamescache,
    clean_ascii_slug,
    resolve_city_identity,
)
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


@dataclass
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
    source: str = "mobility_database"
    licence: str = "open"
    requires_auth: bool = False
    modes: list[str] = field(default_factory=list)
    has_fares: bool = False
    features: list[str] = field(default_factory=list)

    @property
    def bbox_area(self) -> float:
        d_lat = max(0.0001, self.max_lat - self.min_lat)
        d_lon = (
            (self.max_lon - self.min_lon)
            if self.min_lon <= self.max_lon
            else (180.0 - self.min_lon + self.max_lon + 180.0)
        )
        return max(0.0001, d_lat * max(0.0001, d_lon))


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

                    feats_str = (row.get("features") or "").strip()
                    features = [f.strip() for f in feats_str.split("|") if f.strip()]
                    has_fares = any("fare" in f.lower() for f in features)

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
                            has_fares=has_fares,
                            features=features,
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
        aliases: set[str] | list[str] | None = None,
    ) -> float:
        """
        Scores a candidate GTFS feed for a target city.
        Higher score = better match. Returns < 0 for disqualification.
        Unicode-aware: matches against native scripts (東京, Москва, 서울) and Latin aliases.
        """
        # 1. Country code validation: if city country is known, feed MUST match country
        if city_country and feed.country and feed.country != city_country:
            return -1.0

        # Reject corrupt or uninitialized bounding boxes (e.g. 0.0, 0.0)
        if (
            abs(feed.min_lat) < 1e-4
            and abs(feed.max_lat) < 1e-4
            and abs(feed.min_lon) < 1e-4
            and abs(feed.max_lon) < 1e-4
        ):
            return -1.0

        # Reject swapped latitudes
        if feed.min_lat > feed.max_lat:
            return -1.0

        # 2. Spatial check: feed must enclose city center coordinate
        # Latitude containment
        if not (feed.min_lat <= center_lat <= feed.max_lat):
            return -1.0

        # Longitude containment with antimeridian support
        if feed.min_lon <= feed.max_lon:
            if not (feed.min_lon <= center_lon <= feed.max_lon):
                return -1.0
        else:
            # Crosses 180° meridian (e.g. Suva, Fiji or Anadyr, Russia)
            if not (center_lon >= feed.min_lon or center_lon <= feed.max_lon):
                return -1.0

        score = 50.0

        # 3. Anti-Tour Operator Filtering:
        desc_text = f"{feed.provider} {feed.name}".lower()
        for kw in TOUR_BLACKLIST_KEYWORDS:
            if kw in desc_text:
                score -= 150.0

        # 4. Compactness score:
        area = feed.bbox_area
        score += max(0.0, 60.0 - (math.log(area + 1.0) * 12.0))

        # 5. Unicode-aware text relevance
        city_tokens: set[str] = set()
        if aliases:
            for a in aliases:
                if a:
                    city_tokens.add(unicodedata.normalize("NFKC", a.strip()).casefold())
        if city_lower:
            city_tokens.add(
                unicodedata.normalize("NFKC", city_lower.strip()).casefold()
            )

        muni_folded = unicodedata.normalize("NFKC", feed.municipality).casefold()
        subdiv_folded = unicodedata.normalize("NFKC", feed.subdivision).casefold()
        desc_folded = unicodedata.normalize("NFKC", desc_text).casefold()

        for tok in city_tokens:
            if not tok or len(tok) < 2:
                continue
            if tok in muni_folded:
                score += 90.0
                break
            elif tok in subdiv_folded:
                score += 50.0
                break
            elif tok in desc_folded:
                score += 35.0
                break

        # 6. Official Transit Authority boost
        if feed.is_official:
            score += 40.0

        return score

    @classmethod
    async def resolve_gtfs_feeds(
        cls,
        city_identifier: str,
        country_code: str | None = None,
        max_feeds: int = 5,
    ) -> list[GTFSFeedInfo]:
        """
        Dynamically resolves one or more official GTFS transit feeds for any city worldwide.
        Applies multi-feed greedy set cover for multi-operator cities (Metro + Bus + Rail).
        Guarantees zero mocked or synthetic data.
        """
        if not city_identifier or not city_identifier.strip():
            return []

        await cls.ensure_catalog_loaded()
        if not cls._catalog_cache:
            logger.warning(
                f"GTFS catalog is empty; cannot resolve GTFS feeds for {city_identifier}."
            )
            return []

        # 1. Resolve city identity, country, and aliases
        clean_input = city_identifier.strip()
        resolved_name, resolved_cc, geonames_id = resolve_city_identity(
            clean_input, country_code=country_code
        )

        city_country = country_code or resolved_cc
        if city_country == "XX":
            city_country = None

        center_lat: float | None = None
        center_lon: float | None = None
        aliases: set[str] = {
            clean_input.lower(),
            resolved_name.lower(),
            clean_ascii_slug(clean_input),
            clean_ascii_slug(resolved_name),
        }

        # Check GeoNames for alternate names and coordinates
        gc = _get_geonamescache()
        if gc and geonames_id:
            city_entry = gc.get_cities().get(str(geonames_id)) or gc.get_cities().get(
                geonames_id
            )
            if city_entry:
                center_lat = float(city_entry["latitude"])
                center_lon = float(city_entry["longitude"])
                if not city_country:
                    city_country = city_entry.get("countrycode")
                for alt in city_entry.get("alternatenames", []):
                    if alt:
                        aliases.add(alt.strip().lower())

        # Check DB city repository if coordinates not found yet
        if center_lat is None or center_lon is None:
            try:
                from app.adapters.repositories.sql_city_repository import (
                    SqlCityRepository,
                )
                from app.db.session import async_session

                async with async_session() as s:
                    c_repo = SqlCityRepository(s)
                    c_ent = await c_repo.find_by_name_or_alias(clean_input)
                    if c_ent:
                        city_country = c_ent.country_code or city_country
                        center_lat, center_lon = c_ent.center_lat, c_ent.center_lon
                        aliases.add(c_ent.name.lower())
                        for a in c_ent.aliases or []:
                            aliases.add(a.lower())
            except Exception as exc:
                logger.debug(f"City repo lookup skipped: {exc}")

        # OSM geocoder fallback
        if center_lat is None or center_lon is None:
            try:
                from app.infrastructure.providers.osm_city_ingest import geocode_city

                geo = await geocode_city(resolved_name or clean_input)
                if geo:
                    city_country = (
                        geo.country_code.upper() if geo.country_code else city_country
                    )
                    center_lat, center_lon = geo.lat, geo.lon
                    aliases.add(geo.display_name.lower())
            except Exception:
                bounds = await OSMMapService.get_city_extract_bounds(clean_input)
                if bounds:
                    center_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
                    center_lon = (bounds["min_lon"] + bounds["max_lon"]) / 2.0

        if center_lat is None or center_lon is None:
            logger.info(
                f"Could not determine geographic center for {city_identifier}; no GTFS matched."
            )
            return []

        # 2. Score candidates
        scored_candidates: list[tuple[float, GTFSFeedInfo]] = []
        for feed in cls._catalog_cache:
            score = cls._score_candidate(
                feed=feed,
                city_lower=clean_input.lower(),
                center_lat=center_lat,
                center_lon=center_lon,
                city_country=city_country,
                aliases=aliases,
            )
            if score > 0.0:
                scored_candidates.append((score, feed))

        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        if not scored_candidates:
            logger.info(
                f"No valid open GTFS schedule feed found in global catalog for {city_identifier}."
            )
            return []

        # 3. Greedy Set Cover: collect up to max_feeds distinct operators/providers
        selected_feeds: list[GTFSFeedInfo] = []
        seen_providers: set[str] = set()
        best_score = scored_candidates[0][0]

        for score, feed in scored_candidates:
            # Cut off feeds whose score is drastically lower than the best candidate (< 40% of best score)
            if score < max(35.0, best_score * 0.4):
                break
            norm_prov = clean_ascii_slug(feed.provider or feed.name)
            if norm_prov not in seen_providers:
                seen_providers.add(norm_prov)
                selected_feeds.append(feed)
                if len(selected_feeds) >= max_feeds:
                    break

        logger.info(
            f"Resolved {len(selected_feeds)} GTFS feed(s) for {city_identifier}: "
            f"{[f.name for f in selected_feeds]}"
        )
        return selected_feeds

    @classmethod
    async def resolve_gtfs_feed(cls, city_name: str) -> GTFSFeedInfo | None:
        """
        Dynamically finds the best official GTFS transit feed for any city worldwide.
        Returns GTFSFeedInfo if an active open feed is found, or None.
        STRICT ZERO MOCKED FALLBACK: Does not fabricate or return mocked schedule data.
        """
        feeds = await cls.resolve_gtfs_feeds(city_name, max_feeds=1)
        return feeds[0] if feeds else None
