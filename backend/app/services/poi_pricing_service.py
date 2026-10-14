"""POI Admission Pricing Service.

Implements the 4-tier dynamic price resolution cascade:
1. Exact wikidata_id or (city_id, normalized_name) match in database poi_price_catalog.
2. OSM explicit fee="no" (0.0 EUR, cost_source="osm_fee_no") or parsed charge tag.
3. Wikivoyage listing price field.
4. Official website scraping with strict literal verification gate (extracted float
   must literally appear as substring in HTML text).
Fallback: Category benchmark estimation with cost_is_estimated=True.
"""

import asyncio
import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PoiPriceCatalogModel
from app.db.seeds.poi_prices import INITIAL_VERIFIED_PRICES
from app.utils.opening_hours_parser import parse_osm_opening_hours

logger = logging.getLogger(__name__)


@dataclass
class VerifiedPoiPrice:
    name: str
    city: str
    price_eur: float
    is_free: bool
    source: str = "poi_price_catalog"
    wikidata_id: str | None = None


# Category Benchmarks for estimating unindexed POIs
CATEGORY_BENCHMARKS: dict[str, tuple[float, bool]] = {
    "museum": (14.00, False),
    "monument": (10.00, False),
    "park": (0.00, True),
    "viewpoint": (0.00, True),
    "restaurant": (25.00, False),
    "place_of_worship": (0.00, True),
    "generic": (5.00, False),
}


def normalize_string(s: str) -> str:
    """Normalize string by replacing ligatures, removing diacritics and non-alphanumeric chars."""
    if not s:
        return ""
    s = s.replace("œ", "oe").replace("Œ", "oe").replace("æ", "ae").replace("Æ", "ae")
    n = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("utf-8")
    return re.sub(r"[^\w\s]", "", n).lower().strip()


# In-memory caches for fast catalog lookup
_NORMALIZED_CATALOG: dict[tuple[str, str], VerifiedPoiPrice] = {}
_WIKIDATA_CATALOG: dict[str, VerifiedPoiPrice] = {}


def _ensure_catalog_initialized() -> None:
    """Lazily populates in-memory catalog from seed definitions if not yet loaded."""
    global _NORMALIZED_CATALOG, _WIKIDATA_CATALOG
    if _NORMALIZED_CATALOG:
        return

    for item in INITIAL_VERIFIED_PRICES:
        norm_name = normalize_string(item["normalized_name"])
        norm_city = normalize_string(item["city"])
        vp = VerifiedPoiPrice(
            name=item["name"],
            city=item["city"],
            price_eur=float(item["price_eur"]),
            is_free=bool(item["is_free"]),
            source="verified_official_pricing",
            wikidata_id=item.get("wikidata_id"),
        )
        _NORMALIZED_CATALOG[(norm_name, norm_city)] = vp
        if item.get("wikidata_id"):
            _WIKIDATA_CATALOG[item["wikidata_id"]] = vp


def parse_wikivoyage_price(price_str: str | None) -> tuple[float | None, bool]:
    """Parses Wikivoyage listing price strings (e.g. '€15', 'free', '12 EUR')."""
    if not price_str or not isinstance(price_str, str):
        return None, False

    clean = price_str.strip().lower()
    if any(w in clean for w in ("free", "gratis", "gratuit", "donation", "frei")):
        return 0.0, True

    # Look for numeric patterns like 15, 15.00, 15,50
    m = re.search(r"(\d+(?:[.,]\d{1,2})?)", clean)
    if m:
        try:
            val = float(m.group(1).replace(",", "."))
            return val, val == 0.0
        except ValueError:
            pass
    return None, False


class PoiPricingService:
    """Service responsible for resolving admission prices for POIs across any city."""

    @classmethod
    async def load_catalog_from_db(cls, session: AsyncSession) -> int:
        """Load catalog from PostgreSQL poi_price_catalog table into memory."""
        global _NORMALIZED_CATALOG, _WIKIDATA_CATALOG
        res = await session.execute(select(PoiPriceCatalogModel))
        rows = res.scalars().all()
        count = 0
        for row in rows:
            vp = VerifiedPoiPrice(
                name=row.normalized_name,
                city="",
                price_eur=row.price_eur,
                is_free=row.is_free,
                source="poi_price_catalog",
                wikidata_id=row.wikidata_id,
            )
            norm_name = normalize_string(row.normalized_name)
            _NORMALIZED_CATALOG[(norm_name, "")] = vp
            if row.wikidata_id:
                _WIKIDATA_CATALOG[row.wikidata_id] = vp
            count += 1
        return count

    @classmethod
    def get_verified_poi_price(
        cls,
        poi_name: str,
        city: str,
        wikidata_id: str | None = None,
    ) -> VerifiedPoiPrice | None:
        """Finds verified price by wikidata_id or normalized name and city."""
        _ensure_catalog_initialized()

        # 1. Exact wikidata_id match
        if wikidata_id and wikidata_id in _WIKIDATA_CATALOG:
            return _WIKIDATA_CATALOG[wikidata_id]

        norm_name = normalize_string(poi_name)
        norm_city = normalize_string(city)

        # 2. Exact (name, city) match
        if (norm_name, norm_city) in _NORMALIZED_CATALOG:
            return _NORMALIZED_CATALOG[(norm_name, norm_city)]

        # Check match without city constraint if city is empty
        if (norm_name, "") in _NORMALIZED_CATALOG:
            return _NORMALIZED_CATALOG[(norm_name, "")]

        # 3. Fuzzy / substring match
        for (k_name, k_city), v in _NORMALIZED_CATALOG.items():
            if (not k_city or k_city == norm_city) and (
                k_name in norm_name or norm_name in k_name
            ):
                return v

        return None

    @classmethod
    def resolve_poi_price(
        cls,
        poi_name: str,
        city: str,
        category: str = "generic",
        osm_fee: str | None = None,
        osm_charge: str | None = None,
        wikidata_id: str | None = None,
        wikivoyage_price: str | None = None,
        existing_cost: float | None = None,
        existing_is_estimated: bool | None = None,
        existing_source: str | None = None,
    ) -> tuple[float, bool, str]:
        """Determines admission price using the 4-tier resolution cascade.

        Returns: (cost_eur, is_estimated, price_source)
        """
        # Tier 1: Check verified catalog
        verified = cls.get_verified_poi_price(poi_name, city, wikidata_id=wikidata_id)
        if verified is not None:
            return verified.price_eur, False, verified.source

        # Tier 2: Check OSM explicit fee / charge
        if osm_fee and str(osm_fee).strip().lower() in ["no", "false", "0", "free"]:
            return 0.0, False, "osm_fee_no"

        if osm_charge:
            try:
                cleaned = re.sub(r"[^\d.]", " ", str(osm_charge))
                nums = [
                    float(p)
                    for p in cleaned.split()
                    if p and p.replace(".", "", 1).isdigit()
                ]
                if nums:
                    return nums[0], False, "osm_charge_tag"
            except (ValueError, TypeError) as parse_err:
                logger.debug("Could not parse charge tag: %s", parse_err)

        # Tier 3: Check Wikivoyage listing price
        if wikivoyage_price:
            wv_cost, wv_free = parse_wikivoyage_price(wikivoyage_price)
            if wv_cost is not None:
                return wv_cost, False, "wikivoyage_listing"

        # Tier 4: Check if existing data already has a verified real price
        if (
            existing_cost is not None
            and existing_is_estimated is False
            and existing_source
            and "estimate" not in existing_source
        ):
            return existing_cost, False, existing_source

        if (
            existing_cost is not None
            and existing_cost > 0.0
            and existing_is_estimated is False
        ):
            return existing_cost, False, (existing_source or "existing_verified")

        # Fallback: Category benchmark estimation
        cat_key = category.lower() if category else "generic"
        benchmark_cost, is_free = CATEGORY_BENCHMARKS.get(
            cat_key, CATEGORY_BENCHMARKS["generic"]
        )
        cost = 0.0 if is_free else benchmark_cost
        return cost, True, "category_benchmark_estimate"

    @classmethod
    async def scrape_and_verify_official_price(
        cls,
        website_url: str,
        poi_name: str,
        city: str,
        ollama_url: str = "http://localhost:11434",
        model: str = "qwen2.5:3b",
    ) -> tuple[float | None, bool, str]:
        """Tier 4: Scrapes official website and verifies admission price with a strict literal verification gate.

        Guarantees: Any extracted numeric price must literally appear in the fetched text.
        """
        if not website_url or not website_url.startswith(("http://", "https://")):
            return None, True, "invalid_url"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Paladio/1.0"
        }
        candidate_urls = [website_url]
        for sub in ("/tickets", "/visita", "/tarifs", "/en/tickets", "/prices"):
            candidate_urls.append(urljoin(website_url, sub))

        extracted_text = ""
        try:
            async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
                for target_url in candidate_urls[:2]:
                    try:
                        resp = await client.get(target_url, headers=headers)
                        if resp.status_code == 200:
                            # Strip script, style and html tags
                            raw_html = resp.text
                            clean = re.sub(
                                r"<(script|style)[^>]*>.*?</\1>",
                                " ",
                                raw_html,
                                flags=re.DOTALL | re.IGNORECASE,
                            )
                            clean = re.sub(r"<[^>]+>", " ", clean)
                            clean = re.sub(r"\s+", " ", clean).strip()

                            # Extract paragraphs with pricing signals
                            matches = re.findall(
                                r"[^.!?\n]{10,200}?(?:€|EUR|eur|\$|£|admission|ticket|entry|entrada|tarifs?|billet|free|gratis|gratuit)[^.!?\n]{0,100}",
                                clean,
                                re.IGNORECASE,
                            )
                            if matches:
                                extracted_text = " ".join(matches[:8])
                                break
                    except (httpx.HTTPError, asyncio.TimeoutError):
                        continue
        except Exception as e:
            logger.debug("Failed fetching official website %s: %s", website_url, e)
            return None, True, "fetch_failed"

        if not extracted_text:
            return None, True, "no_price_text_found"

        # Ask Ollama for structured extraction
        prompt = (
            f"Extract the adult admission price in EUR from the following text for {poi_name} in {city}.\n"
            "If admission is completely free of charge, set price_eur to 0.0 and is_free to true.\n"
            "If no price is mentioned, set price_eur to null.\n\n"
            f"Text:\n{extracted_text[:1200]}\n\n"
            'Respond ONLY in valid JSON matching schema: {"price_eur": <float or null>, "is_free": <bool>}'
        )

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                ollama_resp = await client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                if ollama_resp.status_code != 200:
                    return None, True, "ollama_error"

                res_data = json.loads(ollama_resp.json().get("response", "{}"))
                extracted_price = res_data.get("price_eur")
                is_free = bool(res_data.get("is_free"))

                if is_free and (extracted_price == 0.0 or extracted_price is None):
                    # Literal check for free terms
                    if any(
                        term in extracted_text.lower()
                        for term in ("free", "gratis", "gratuit", "libre")
                    ):
                        return 0.0, False, "official_website_literal_verified"

                if extracted_price is not None:
                    price_val = float(extracted_price)
                    if price_val < 0.0:
                        return None, True, "negative_price_rejected"

                    # STRICT LITERAL VERIFICATION GATE:
                    # The numeric representation must literally appear in extracted_text!
                    int_str = str(int(price_val))
                    float_str_dot = f"{price_val:.2f}"
                    float_str_comma = f"{price_val:.2f}".replace(".", ",")
                    simple_float = str(price_val)

                    candidates = [int_str, float_str_dot, float_str_comma, simple_float]
                    matched_literal = any(c in extracted_text for c in candidates if c)

                    if matched_literal:
                        return price_val, False, "official_website_literal_verified"
                    else:
                        logger.warning(
                            "Ollama extracted price %s for %s, but literal verification failed in source text.",
                            price_val,
                            poi_name,
                        )
                        return None, True, "literal_verification_failed"
        except Exception as e:
            logger.debug("Ollama pricing extraction failed: %s", e)

        return None, True, "extraction_unsuccessful"

    @classmethod
    async def batch_resolve_unindexed_pois(
        cls, pois: list[dict], city: str
    ) -> list[dict]:
        """Enriches candidate POI dictionaries with verified prices and opening hours."""
        unindexed_indices = []

        for idx, p in enumerate(pois):
            name = p.get("name", "")
            cat = p.get("category", "generic")
            raw_cost = p.get("cost_eur")
            osm_fee = p.get("osm_fee")
            osm_charge = p.get("osm_charge")
            wikidata_id = p.get("wikidata_id") or (
                p.get("metadata", {}).get("wikidata_id")
                if isinstance(p.get("metadata"), dict)
                else None
            )
            wv_price = p.get("wikivoyage_price") or (
                p.get("metadata", {}).get("wikivoyage", {}).get("price")
                if isinstance(p.get("metadata"), dict)
                else None
            )
            osm_h = p.get("osm_opening_hours") or (
                p.get("schedule", {}).get("osm_opening_hours")
                if isinstance(p.get("schedule"), dict)
                else None
            )

            # Resolve price via 4-tier cascade
            cost, is_est, src = cls.resolve_poi_price(
                poi_name=name,
                city=city,
                category=cat,
                osm_fee=osm_fee,
                osm_charge=osm_charge,
                wikidata_id=wikidata_id,
                wikivoyage_price=wv_price,
                existing_cost=raw_cost,
                existing_is_estimated=p.get("cost_is_estimated"),
                existing_source=p.get("cost_source"),
            )
            p["cost_eur"] = cost
            p["cost_is_estimated"] = is_est
            p["cost_source"] = src

            # Resolve opening hours
            if (
                not p.get("open_time_mins_by_day")
                or len(p["open_time_mins_by_day"]) != 7
            ):
                parsed = parse_osm_opening_hours(osm_h)
                p["open_time_mins_by_day"] = parsed.open_time_mins_by_day
                p["close_time_mins_by_day"] = parsed.close_time_mins_by_day
                p["daily_windows"] = parsed.daily_windows
                p["hours_known"] = parsed.hours_known
                p["has_split_hours"] = parsed.has_split_hours
                p["osm_opening_hours"] = osm_h

            if is_est and (p.get("website") or p.get("url")):
                unindexed_indices.append(idx)

        # For unindexed POIs with website URL, attempt Tier 4 official website grounding
        if unindexed_indices:
            candidates = [pois[i] for i in unindexed_indices[:5]]
            for c_poi in candidates:
                web_url = c_poi.get("website") or c_poi.get("url")
                if web_url:
                    (
                        cost_val,
                        est_val,
                        src_val,
                    ) = await cls.scrape_and_verify_official_price(
                        website_url=web_url,
                        poi_name=c_poi.get("name", ""),
                        city=city,
                    )
                    if cost_val is not None and not est_val:
                        c_poi["cost_eur"] = cost_val
                        c_poi["cost_is_estimated"] = False
                        c_poi["cost_source"] = src_val

        return pois
