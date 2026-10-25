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
    async def get_cached_extract(cls, poi_id: str) -> str | None:
        """Retrieves cached Wikipedia extract from Redis if available."""
        if not poi_id:
            return None
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            try:
                cached = await r.get(f"poi:extract:{poi_id}")
                if cached:
                    return cached
            finally:
                await r.aclose()
        except Exception as err:
            logger.debug(f"Redis get extract error for poi {poi_id}: {err}")
        return None

    @classmethod
    async def set_cached_extract(cls, poi_id: str, extract: str) -> None:
        """Stores resolved Wikipedia extract into Redis with TTL."""
        if not poi_id or not extract:
            return
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            try:
                await r.set(
                    f"poi:extract:{poi_id}",
                    extract,
                    ex=CACHE_TTL_SECONDS,
                )
            finally:
                await r.aclose()
        except Exception as err:
            logger.debug(f"Redis set extract error for poi {poi_id}: {err}")

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
        cached_photos = await cls.get_cached_photos(poi_id)
        cached_extract = await cls.get_cached_extract(poi_id)
        if cached_photos is not None and cached_extract is not None:
            return cached_photos, cached_extract

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

            # Fallback A: Query Wikipedia Search API if summary not found by direct title
            if not lead_extract:
                clean_city = (city or "").lower()
                search_langs = ["en"]
                if clean_city in ("madrid", "barcelona", "seville", "valencia"):
                    search_langs = ["es", "en"]
                elif clean_city in ("porto", "lisbon", "lisboa"):
                    search_langs = ["pt", "en"]
                elif clean_city in ("paris", "lyon", "marseille"):
                    search_langs = ["fr", "en"]
                elif clean_city in ("rome", "milan", "florence", "venice"):
                    search_langs = ["it", "en"]
                elif clean_city in ("tokyo", "kyoto", "osaka"):
                    search_langs = ["ja", "en"]

                for s_lang in search_langs:
                    try:
                        q_str = f"{name} {city}".strip() if city else name
                        s_url = f"https://{s_lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(q_str)}&format=json&utf8=1&srlimit=1"
                        s_resp = await client.get(s_url)
                        if s_resp.status_code == 200:
                            s_data = s_resp.json()
                            results = s_data.get("query", {}).get("search", [])
                            if results and results[0].get("title"):
                                matched_title = results[0]["title"]
                                sum_url = f"https://{s_lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(matched_title)}"
                                sum_resp = await client.get(sum_url)
                                if sum_resp.status_code == 200:
                                    sum_data = sum_resp.json()
                                    if sum_data.get("extract"):
                                        lead_extract = sum_data.get("extract")
                                        orig = sum_data.get("originalimage", {}).get(
                                            "source"
                                        )
                                        thumb = (
                                            sum_data.get("thumbnail", {}).get("source")
                                            or orig
                                        )
                                        if orig and orig not in seen_urls:
                                            seen_urls.add(orig)
                                            photos.append(
                                                ResolvedPhoto(
                                                    url=orig,
                                                    thumbnail_url=thumb,
                                                    caption=sum_data.get("description")
                                                    or sum_data.get("title")
                                                    or name,
                                                    author="Wikimedia Commons / Wikipedia",
                                                    license_name="Creative Commons",
                                                    license_url="https://commons.wikimedia.org",
                                                )
                                            )
                                        break
                    except Exception as s_err:
                        logger.debug(
                            f"Wikipedia search lookup failed for {s_lang}:{name}: {s_err}"
                        )

            # Fallback B: Query Wikidata description if still no extract
            if not lead_extract and wikidata_id:
                try:
                    wd_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={wikidata_id}&props=descriptions&languages=en|es|pt|fr|de|ja&format=json"
                    wd_resp = await client.get(wd_url)
                    if wd_resp.status_code == 200:
                        wd_data = wd_resp.json()
                        desc_dict = (
                            wd_data.get("entities", {})
                            .get(wikidata_id, {})
                            .get("descriptions", {})
                        )
                        for lang_code in ["en", "es", "pt", "fr", "de", "ja"]:
                            if lang_code in desc_dict and desc_dict[lang_code].get(
                                "value"
                            ):
                                lead_extract = (
                                    f"{name} is a {desc_dict[lang_code]['value']}."
                                )
                                break
                except Exception as wd_err:
                    logger.debug(
                        f"Wikidata description lookup failed for {wikidata_id}: {wd_err}"
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
        if cached_photos and not serialized:
            serialized = cached_photos
        elif cached_photos and serialized:
            cached_urls = {cp.get("url") for cp in cached_photos}
            for sp in serialized:
                if sp.get("url") not in cached_urls:
                    cached_photos.append(sp)
            serialized = cached_photos

        if serialized:
            await cls.set_cached_photos(poi_id, serialized)
        if lead_extract:
            await cls.set_cached_extract(poi_id, lead_extract)

        return serialized, lead_extract
