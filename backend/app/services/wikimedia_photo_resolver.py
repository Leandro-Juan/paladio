"""Wikimedia & Wikipedia Real Photo Resolution Service with Redis Caching.

Dynamically queries Wikipedia REST API and Wikimedia Commons Action API
to resolve authentic, high-resolution photography and Creative Commons licenses
for points of interest. Caches results in Redis with a 7-day TTL.
"""

import json
import logging
import os
import re
import unicodedata
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


def _is_direct_image_url(url: str | None) -> bool:
    """Validates that a URL points directly to a renderable image file rather than an album or web page."""
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return False
    parsed = urllib.parse.urlparse(url)
    netloc = parsed.netloc.lower()
    path = parsed.path.lower()

    # Reject known web page / sharing / album domains
    blocked_domains = (
        "photos.app.goo.gl",
        "photos.google.com",
        "flickr.com",
        "www.flickr.com",
        "instagram.com",
        "www.instagram.com",
        "facebook.com",
        "www.facebook.com",
        "tripadvisor.com",
        "www.tripadvisor.com",
    )
    if any(netloc == b or netloc.endswith("." + b) for b in blocked_domains):
        return False

    # Reject wiki article / file view pages (e.g. https://commons.wikimedia.org/wiki/File:...)
    if "commons.wikimedia.org" in netloc and "/wiki/" in path:
        return False

    # Direct Wikimedia uploads
    if "upload.wikimedia.org" in netloc or "thumb.wikimedia.org" in netloc:
        return True

    # Standard direct image file extensions
    valid_exts = (".jpg", ".jpeg", ".png", ".webp", ".avif")
    return any(path.endswith(ext) for ext in valid_exts)


def _normalize_text(text: str) -> str:
    """Strips diacritics, lowercase, removes punctuation for robust global matching."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in normalized if not unicodedata.combining(c))
    cleaned = re.sub(r"[^\w\s]", " ", stripped).lower()
    return " ".join(cleaned.split())


def _is_title_relevant(
    candidate_title: str,
    target_name: str,
    aliases: list[str] | None = None,
) -> bool:
    """Validates that a Wikipedia candidate title genuinely belongs to the target POI.

    Rejects:
    - Disambiguation pages (e.g. '(disambiguation)', 'desambiguación', 'homonymie')
    - List pages ('List of ...', 'Liste de ...', 'Lista de ...')
    - Completely unrelated articles (e.g. music albums, band tours, voice actresses)
    """
    if not candidate_title or not target_name:
        return False

    cand_lower = candidate_title.lower()

    # Disambiguation and list rejection
    disallow_keywords = (
        "(disambiguation)",
        "(desambiguacion)",
        "(desambiguación)",
        "(homonymie)",
        "(begriffsklarung)",
        "(begriffsklärung)",
        "list of ",
        "liste de ",
        "liste von ",
        "lista de ",
        "discography",
        "filmography",
    )
    if any(k in cand_lower for k in disallow_keywords):
        return False

    # Check candidate title without parenthetical annotations, e.g. "Prado Museum (Madrid)" -> "Prado Museum"
    cand_base = re.sub(r"\s*\([^)]*\)", "", candidate_title).strip()
    norm_cand = _normalize_text(cand_base)
    cand_tokens = set(norm_cand.split())

    targets_to_check = [target_name] + (aliases or [])
    for tgt in targets_to_check:
        if not tgt:
            continue
        norm_tgt = _normalize_text(tgt)
        if not norm_tgt:
            continue
        tgt_tokens = set(norm_tgt.split())

        # Exact normalized match or full substring containment
        if norm_tgt == norm_cand or norm_tgt in norm_cand or norm_cand in norm_tgt:
            return True

        # Token overlap: if target has multiple words, check overlap
        if tgt_tokens and cand_tokens:
            common = tgt_tokens & cand_tokens
            stops = {
                "the",
                "and",
                "del",
                "der",
                "die",
                "das",
                "los",
                "las",
                "von",
                "san",
                "santa",
                "gate",
                "mon",
                "de",
                "du",
                "la",
                "le",
                "el",
            }
            sig_common = {w for w in common if len(w) > 2 and w not in stops}
            sig_tgt = {w for w in tgt_tokens if len(w) > 2 and w not in stops}
            if sig_tgt and len(sig_common) / len(sig_tgt) >= 0.5:
                return True

    return False


def _is_junk_commons_image(title: str, url: str) -> bool:
    """Filters out non-photos, SVGs, PDFs, maps, coats of arms, flags, user icons, stamps."""
    parsed_path = urllib.parse.urlparse(url).path.lower()
    valid_exts = (".jpg", ".jpeg", ".png", ".webp", ".avif")
    if not any(parsed_path.endswith(ext) for ext in valid_exts):
        return True

    title_lower = (title or "").lower()
    junk_title_patterns = (
        "map",
        "locator",
        "carte",
        "karte",
        "plan",
        "diagram",
        "coat of arms",
        "wappen",
        "escudo",
        "blason",
        "flag of",
        "bandeira",
        "drapeau",
        "banner",
        "logo",
        "icon",
        "signature",
        "stamp",
        "coin",
        "postmark",
        "document",
        "federal register",
    )
    for pat in junk_title_patterns:
        if re.search(rf"\b{re.escape(pat)}\b", title_lower):
            return True

    return False


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
    async def get_cached_extract(
        cls, poi_id: str, target_lang: str = "en"
    ) -> str | None:
        """Retrieves cached Wikipedia extract from Redis if available."""
        if not poi_id:
            return None
        t_lang = (target_lang or "en").lower().split("-")[0]
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            try:
                cached = await r.get(f"poi:extract:{poi_id}:{t_lang}")
                if cached:
                    return cached
                if t_lang == "en":
                    cached = await r.get(f"poi:extract:{poi_id}")
                    if cached:
                        return cached
            finally:
                await r.aclose()
        except Exception as err:
            logger.debug(f"Redis get extract error for poi {poi_id} ({t_lang}): {err}")
        return None

    @classmethod
    async def set_cached_extract(
        cls, poi_id: str, extract: str, target_lang: str = "en"
    ) -> None:
        """Stores resolved Wikipedia extract into Redis with TTL."""
        if not poi_id or not extract:
            return
        t_lang = (target_lang or "en").lower().split("-")[0]
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            try:
                await r.set(
                    f"poi:extract:{poi_id}:{t_lang}",
                    extract,
                    ex=CACHE_TTL_SECONDS,
                )
                if t_lang == "en":
                    await r.set(
                        f"poi:extract:{poi_id}",
                        extract,
                        ex=CACHE_TTL_SECONDS,
                    )
            finally:
                await r.aclose()
        except Exception as err:
            logger.debug(f"Redis set extract error for poi {poi_id} ({t_lang}): {err}")

    @classmethod
    async def resolve_photos(
        cls,
        poi_id: str,
        name: str,
        city: str = "",
        wikipedia_title: str | None = None,
        wikidata_id: str | None = None,
        osm_tags: dict[str, Any] | None = None,
        target_lang: str = "en",
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Resolves photos and an optional lead summary for a POI.

        Returns:
            tuple[list[dict], str | None]: (photos_list, lead_extract)
        """
        target_lang_clean = (target_lang or "en").lower().split("-")[0]

        # 1. Check Redis Cache
        cached_photos = await cls.get_cached_photos(poi_id)
        cached_extract = await cls.get_cached_extract(
            poi_id, target_lang=target_lang_clean
        )
        if cached_photos is not None and cached_extract is not None:
            return cached_photos, cached_extract

        photos: list[ResolvedPhoto] = []
        seen_urls: set[str] = set()
        lead_extract: str | None = None

        headers = {"User-Agent": USER_AGENT}
        osm_tags = osm_tags or {}

        # 2. Extract tag intelligence & aliases (universal across OSM worldwide)
        effective_wiki = (
            wikipedia_title
            or osm_tags.get("wikipedia")
            or osm_tags.get("wikipedia:en")
            or osm_tags.get("wikipedia:es")
        )
        effective_qid = wikidata_id or osm_tags.get("wikidata")
        if effective_qid:
            effective_qid = str(effective_qid).strip().upper()
            if not re.match(r"^Q\d+$", effective_qid):
                effective_qid = None

        alias_candidates: list[str] = []
        for k in (
            "name:en",
            "name:es",
            "name:fr",
            "name:de",
            "name:it",
            "name:pt",
            "name:ja",
            "name:ja-Latn",
            "name:ja-Hira",
            "local_name",
            "alt_name",
            "official_name",
            "int_name",
            "branch",
        ):
            v = osm_tags.get(k)
            if (
                v
                and isinstance(v, str)
                and v.strip()
                and v.strip() not in alias_candidates
            ):
                alias_candidates.append(v.strip())

        # 3. Check direct OSM image tag (only accept verified direct image URLs)
        direct_osm_img = osm_tags.get("image")
        if direct_osm_img and _is_direct_image_url(direct_osm_img):
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

        async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
            from app.engine.retrieval.query_rewriter import (
                resolve_city_primary_language,
            )

            city_lang = resolve_city_primary_language(city)
            primary_lang = city_lang if city_lang else "en"

            # 4. Wikidata Universal Resolution (P18 curated image + authoritative sitelinks)
            wikidata_desc: str | None = None
            wikidata_sitelinks: dict[str, str] = {}
            if effective_qid:
                try:
                    wd_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={effective_qid}&props=claims|sitelinks|descriptions|labels&format=json"
                    wd_resp = await client.get(wd_url)
                    if wd_resp.status_code == 200:
                        wd_data = wd_resp.json()
                        ent = wd_data.get("entities", {}).get(effective_qid, {})

                        # Collect multilingual labels as aliases
                        labels_dict = ent.get("labels", {})
                        for l_code in (
                            "en",
                            primary_lang,
                            "es",
                            "fr",
                            "de",
                            "it",
                            "ja",
                        ):
                            val = labels_dict.get(l_code, {}).get("value")
                            if val and val not in alias_candidates:
                                alias_candidates.append(val)

                        # Extract sitelinks
                        slinks = ent.get("sitelinks", {})
                        for s_key in (
                            f"{target_lang_clean}wiki",
                            f"{primary_lang}wiki",
                            "enwiki",
                            "eswiki",
                            "frwiki",
                            "dewiki",
                            "jawiki",
                        ):
                            if s_key in slinks and slinks[s_key].get("title"):
                                lang_code = s_key.replace("wiki", "")
                                wikidata_sitelinks[lang_code] = slinks[s_key]["title"]

                        # Extract description fallback
                        desc_dict = ent.get("descriptions", {})
                        for l_code in (
                            target_lang_clean,
                            "en",
                            primary_lang,
                            "es",
                            "fr",
                            "de",
                            "ja",
                        ):
                            if l_code in desc_dict and desc_dict[l_code].get("value"):
                                wikidata_desc = (
                                    f"{name} is a {desc_dict[l_code]['value']}."
                                )
                                break

                        # Resolve curated P18 image claim
                        p18_val = None
                        claims = ent.get("claims", {})
                        if "P18" in claims and claims["P18"]:
                            mainsnak = claims["P18"][0].get("mainsnak", {})
                            p18_val = mainsnak.get("datavalue", {}).get("value")

                        if p18_val and isinstance(p18_val, str):
                            try:
                                c_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles=File:{urllib.parse.quote(p18_val)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json"
                                c_resp = await client.get(c_url)
                                if c_resp.status_code == 200:
                                    pages = (
                                        c_resp.json().get("query", {}).get("pages", {})
                                    )
                                    for p in pages.values():
                                        info_list = p.get("imageinfo", [])
                                        if info_list:
                                            info = info_list[0]
                                            p18_url = info.get("url")
                                            p18_thumb = info.get("thumburl") or p18_url
                                            if p18_url and p18_url not in seen_urls:
                                                extm = info.get("extmetadata", {})
                                                p_desc = (
                                                    extm.get("ObjectName", {}).get(
                                                        "value"
                                                    )
                                                    or extm.get(
                                                        "ImageDescription", {}
                                                    ).get("value")
                                                    or name
                                                )
                                                artist = extm.get("Artist", {}).get(
                                                    "value"
                                                )
                                                lic = (
                                                    extm.get(
                                                        "LicenseShortName", {}
                                                    ).get("value")
                                                    or "Creative Commons"
                                                )
                                                lic_u = (
                                                    extm.get("LicenseUrl", {}).get(
                                                        "value"
                                                    )
                                                    or "https://commons.wikimedia.org"
                                                )
                                                seen_urls.add(p18_url)
                                                photos.append(
                                                    ResolvedPhoto(
                                                        url=p18_url,
                                                        thumbnail_url=p18_thumb,
                                                        caption=_strip_html(p_desc),
                                                        author=_strip_html(artist)
                                                        or "Wikimedia Commons",
                                                        license_name=_strip_html(lic),
                                                        license_url=lic_u,
                                                    )
                                                )
                            except Exception as c_err:
                                logger.debug(
                                    f"P18 resolution failed for {p18_val}: {c_err}"
                                )
                except Exception as wd_err:
                    logger.debug(
                        f"Wikidata lookup failed for {effective_qid}: {wd_err}"
                    )

            # 5. Query Wikipedia REST API for lead image & summary
            titles_to_try: list[tuple[str, str]] = []

            # 5a. Prioritize user's target language from Wikidata sitelinks
            if target_lang_clean in wikidata_sitelinks:
                titles_to_try.append(
                    (
                        target_lang_clean,
                        wikidata_sitelinks[target_lang_clean].replace(" ", "_"),
                    )
                )

            # 5b. Prioritize localized OSM wikipedia tag or name
            osm_target_wiki = osm_tags.get(f"wikipedia:{target_lang_clean}")
            if osm_target_wiki:
                tgt_lang, tgt_title = _clean_title(osm_target_wiki)
                if (tgt_lang, tgt_title) not in titles_to_try:
                    titles_to_try.append((tgt_lang, tgt_title))

            osm_target_name = osm_tags.get(f"name:{target_lang_clean}")
            if osm_target_name and isinstance(osm_target_name, str):
                t_clean = osm_target_name.strip().replace(" ", "_")
                if (target_lang_clean, t_clean) not in titles_to_try:
                    titles_to_try.append((target_lang_clean, t_clean))

            if effective_wiki:
                lang, title = _clean_title(effective_wiki)
                if (lang, title) not in titles_to_try:
                    titles_to_try.append((lang, title))
                if lang != "en" and ("en", title) not in titles_to_try:
                    titles_to_try.append(("en", title))

            # Add titles resolved from other Wikidata sitelinks
            for s_lang, s_title in wikidata_sitelinks.items():
                entry = (s_lang, s_title.replace(" ", "_"))
                if entry not in titles_to_try:
                    titles_to_try.append(entry)

            # Add cleaned POI name as trial
            clean_name = name.replace(" ", "_")
            if (target_lang_clean, clean_name) not in titles_to_try:
                titles_to_try.append((target_lang_clean, clean_name))
            if (primary_lang, clean_name) not in titles_to_try:
                titles_to_try.append((primary_lang, clean_name))
            if primary_lang != "en" and ("en", clean_name) not in titles_to_try:
                titles_to_try.append(("en", clean_name))

            for lang, title in titles_to_try:
                try:
                    enc_title = urllib.parse.quote(title)
                    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{enc_title}"
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        data = resp.json()
                        cand_title = data.get("title") or title
                        # If title wasn't from authoritative tags, verify relevance
                        if not effective_wiki and not wikidata_sitelinks:
                            if not _is_title_relevant(
                                cand_title, name, aliases=alias_candidates
                            ):
                                continue

                        if not lead_extract and data.get("extract"):
                            lead_extract = data.get("extract")

                        orig = data.get("originalimage", {}).get("source")
                        thumb = data.get("thumbnail", {}).get("source") or orig
                        if (
                            orig
                            and _is_direct_image_url(orig)
                            and orig not in seen_urls
                        ):
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
                        break  # Found primary authoritative article
                except Exception as err:
                    logger.debug(
                        f"Wikipedia summary lookup failed for {lang}:{title}: {err}"
                    )

            # 6. Fallback A: Query Wikipedia Search API WITH STRICT RELEVANCE VALIDATION
            if not lead_extract:
                search_langs = (
                    [primary_lang, "en"]
                    if primary_lang and primary_lang != "en"
                    else ["en"]
                )
                for s_lang in search_langs:
                    try:
                        q_str = f"{name} {city}".strip() if city else name
                        s_url = (
                            f"https://{s_lang}.wikipedia.org/w/api.php?action=query"
                            f"&list=search&srsearch={urllib.parse.quote(q_str)}"
                            f"&srnamespace=0&srlimit=3&format=json&utf8=1"
                        )
                        s_resp = await client.get(s_url)
                        if s_resp.status_code == 200:
                            s_data = s_resp.json()
                            results = s_data.get("query", {}).get("search", [])
                            matched_valid_title = None
                            for res_item in results:
                                c_title = res_item.get("title")
                                if c_title and _is_title_relevant(
                                    c_title, name, aliases=alias_candidates
                                ):
                                    matched_valid_title = c_title
                                    break

                            if matched_valid_title:
                                sum_url = f"https://{s_lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(matched_valid_title)}"
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
                                        if (
                                            orig
                                            and _is_direct_image_url(orig)
                                            and orig not in seen_urls
                                        ):
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

            # 7. Fallback B: Use Wikidata verified description if Wikipedia article not found
            if not lead_extract and wikidata_desc:
                lead_extract = wikidata_desc

            # 8. Search Wikimedia Commons for gallery imagery (up to 5 authentic images)
            if len(photos) < 6:
                try:
                    search_query = f"{name} {city}".strip()
                    commons_url = "https://commons.wikimedia.org/w/api.php"
                    params = {
                        "action": "query",
                        "generator": "search",
                        "gsrsearch": search_query,
                        "gsrlimit": 8,
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
                            file_title = page.get("title", "")

                            # Filter out non-photo formats, PDFs, SVGs, maps, logos, coats of arms
                            if (
                                not img_url
                                or img_url in seen_urls
                                or _is_junk_commons_image(file_title, img_url)
                            ):
                                continue

                            extmeta = info.get("extmetadata", {})
                            desc = (
                                extmeta.get("ObjectName", {}).get("value")
                                or extmeta.get("ImageDescription", {}).get("value")
                                or file_title.replace("File:", "")
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
                                    author=_strip_html(artist)
                                    or "Wikimedia Contributor",
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
            await cls.set_cached_extract(
                poi_id, lead_extract, target_lang=target_lang_clean
            )

        return serialized, lead_extract
