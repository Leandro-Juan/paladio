"""Wikimedia & Wikipedia Real Photo Resolution Service with Redis Caching.

Dynamically queries Wikipedia REST API and Wikimedia Commons Action API
to resolve authentic, high-resolution photography and Creative Commons licenses
for points of interest. Caches results in Redis with a 7-day TTL.
"""

import json
import logging
import os
import re
import urllib.parse
from dataclasses import asdict, dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "PaladioTravelEngine/1.0 (https://paladio.local; contact@paladio.local)"
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CACHE_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


@dataclass
class ResolvedPhoto:
    url: str
    thumbnail_url: str
    caption: str | None = None
    author: str | None = None
    license_name: str | None = None
    license_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _strip_html(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = re.sub(r"<[^>]+>", "", text).strip()
    return cleaned if cleaned else None


def _clean_title(raw_title: str) -> tuple[str, str]:
    """Extracts (lang, clean_title) from inputs like 'es:Museo del Prado' or 'Museo del Prado'."""
    clean = raw_title.strip()
    lang = "en"
    if ":" in clean:
        parts = clean.split(":", 1)
        if len(parts[0]) in (2, 3) and parts[0].isalpha():
            lang = parts[0].lower()
            clean = parts[1]
    return lang, clean.replace(" ", "_")


class WikimediaPhotoResolver:
    """Resolves real photos and licenses from Wikipedia and Wikimedia Commons."""

    @classmethod
    async def get_cached_photos(cls, poi_id: str) -> list[dict[str, Any]] | None:
        """Retrieves cached photos from Redis if available."""
        if not poi_id:
            return None
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            try:
                cached = await r.get(f"poi:photos:{poi_id}")
                if cached:
                    return json.loads(cached)
            finally:
                await r.aclose()
        except Exception as err:
            logger.debug(f"Redis get cache miss/error for poi {poi_id}: {err}")
        return None

    @classmethod
    async def set_cached_photos(cls, poi_id: str, photos: list[dict[str, Any]]) -> None:
        """Stores resolved photos into Redis with TTL."""
        if not poi_id or not photos:
            return
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            try:
                await r.set(
                    f"poi:photos:{poi_id}",
                    json.dumps(photos),
                    ex=CACHE_TTL_SECONDS,
                )
            finally:
                await r.aclose()
        except Exception as err:
            logger.debug(f"Redis set cache failed for poi {poi_id}: {err}")

    @classmethod
    async def resolve_photos(
        cls,
        poi_id: str,
        name: str,
        city: str = "",
        wikipedia_title: str | None = None,
        wikidata_id: str | None = None,
        osm_tags: dict[str, Any] | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Resolves photos and an optional lead summary for a POI.

        Returns:
            tuple[list[dict], str | None]: (photos_list, lead_extract)
        """
        # 1. Check Redis Cache
        cached = await cls.get_cached_photos(poi_id)
        if cached is not None:
            return cached, None

        photos: list[ResolvedPhoto] = []
        seen_urls: set[str] = set()
        lead_extract: str | None = None

        headers = {"User-Agent": USER_AGENT}
        osm_tags = osm_tags or {}

        # 2. Check direct OSM image tag
        direct_osm_img = osm_tags.get("image")
        if direct_osm_img and direct_osm_img.startswith("http"):
            photos.append(
                ResolvedPhoto(
                    url=direct_osm_img,
                    thumbnail_url=direct_osm_img,
                    caption=f"{name} (OpenStreetMap)",
                    author="OpenStreetMap Contributor",
                    license_name="Open Database License / CC",
                    license_url="https://www.openstreetmap.org/copyright",
                )
            )
            seen_urls.add(direct_osm_img)

        # 3. Query Wikipedia REST API for lead image & summary
        titles_to_try: list[tuple[str, str]] = []
        if wikipedia_title:
            lang, title = _clean_title(wikipedia_title)
            titles_to_try.append((lang, title))
            if lang != "en":
                titles_to_try.append(("en", title))
        else:
            clean_name = name.replace(" ", "_")
            # Try Spanish Wikipedia first if city is Madrid or in Spain, else English
            primary_lang = (
                "es"
                if city.lower() in ("madrid", "barcelona", "seville", "valencia")
                else "en"
            )
            titles_to_try.append((primary_lang, clean_name))
            if primary_lang != "en":
                titles_to_try.append(("en", clean_name))

        async with httpx.AsyncClient(headers=headers, timeout=4.0) as client:
            for lang, title in titles_to_try:
                try:
                    enc_title = urllib.parse.quote(title)
                    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{enc_title}"
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        data = resp.json()
                        if not lead_extract and data.get("extract"):
                            lead_extract = data.get("extract")

                        orig = data.get("originalimage", {}).get("source")
                        thumb = data.get("thumbnail", {}).get("source") or orig
                        if orig and orig not in seen_urls:
                            seen_urls.add(orig)
                            photos.append(
                                ResolvedPhoto(
                                    url=orig,
                                    thumbnail_url=thumb,
                                    caption=data.get("description")
                                    or data.get("title")
                                    or name,
                                    author="Wikimedia Commons / Wikipedia",
                                    license_name="Creative Commons",
                                    license_url="https://commons.wikimedia.org",
                                )
                            )
                        break  # Found primary article
                except Exception as err:
                    logger.debug(
                        f"Wikipedia summary lookup failed for {lang}:{title}: {err}"
                    )

            # 4. Search Wikimedia Commons for gallery imagery (up to 5 images)
            try:
                search_query = f"{name} {city}".strip()
                commons_url = "https://commons.wikimedia.org/w/api.php"
                params = {
                    "action": "query",
                    "generator": "search",
                    "gsrsearch": search_query,
                    "gsrlimit": 6,
                    "gsrnamespace": 6,  # File namespace
                    "prop": "imageinfo",
                    "iiprop": "url|extmetadata",
                    "iiurlwidth": 900,
                    "format": "json",
                }
                c_resp = await client.get(commons_url, params=params)
                if c_resp.status_code == 200:
                    pages = c_resp.json().get("query", {}).get("pages", {})
                    for page in pages.values():
                        imageinfo = page.get("imageinfo", [])
                        if not imageinfo:
                            continue
                        info = imageinfo[0]
                        img_url = info.get("url")
                        thumb_url = info.get("thumburl") or img_url
                        if not img_url or img_url in seen_urls:
                            continue

                        # Filter out non-photo formats (svg, icons, audio)
                        parsed_path = urllib.parse.urlparse(img_url).path.lower()
                        if not any(
                            parsed_path.endswith(ext)
                            for ext in (".jpg", ".jpeg", ".png", ".webp")
                        ):
                            continue

                        extmeta = info.get("extmetadata", {})
                        desc = (
                            extmeta.get("ObjectName", {}).get("value")
                            or extmeta.get("ImageDescription", {}).get("value")
                            or page.get("title", "").replace("File:", "")
                        )
                        artist = extmeta.get("Artist", {}).get("value")
                        license_name = extmeta.get("LicenseShortName", {}).get(
                            "value"
                        ) or extmeta.get("License", {}).get("value")
                        license_url = extmeta.get("LicenseUrl", {}).get("value")

                        seen_urls.add(img_url)
                        photos.append(
                            ResolvedPhoto(
                                url=img_url,
                                thumbnail_url=thumb_url,
                                caption=_strip_html(desc),
                                author=_strip_html(artist) or "Wikimedia Contributor",
                                license_name=_strip_html(license_name)
                                or "Creative Commons",
                                license_url=license_url
                                or "https://commons.wikimedia.org",
                            )
                        )
                        if len(photos) >= 6:
                            break
            except Exception as c_err:
                logger.debug(
                    f"Wikimedia Commons gallery fetch failed for {name}: {c_err}"
                )

        serialized = [p.to_dict() for p in photos]
        if serialized:
            await cls.set_cached_photos(poi_id, serialized)

        return serialized, lead_extract
