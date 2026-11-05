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
import logging
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from app.db.models import CityModel, PoiPriceCatalogModel
from app.db.seeds.poi_prices import INITIAL_VERIFIED_PRICES
from app.engine.currency import convert_currency
from app.services.llm_service import LLMService
from app.utils.opening_hours_parser import parse_osm_opening_hours
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class POIPriceExtraction(BaseModel):
    price_eur: float | None = None
    is_free: bool = False


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


_CITY_CURRENCY_CACHE: dict[str, str] = {}


def _ensure_city_currencies_initialized() -> None:
    """Lazily populates in-memory city currency cache dynamically from PostgreSQL if empty."""
    global _CITY_CURRENCY_CACHE
    if _CITY_CURRENCY_CACHE:
        return
    try:
        import asyncio

        from app.db.session import async_session

        async def _fetch():
            async with async_session() as session:
                await PoiPricingService.load_catalog_from_db(session)

        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                asyncio.create_task(_fetch())
                return
        except RuntimeError:
            asyncio.run(_fetch())
    except Exception as exc:
        logger.debug("Could not lazily query city currencies from DB: %s", exc)


def _detect_currency(text: str, city: str = "") -> str:
    """Infers currency ISO code from currency symbols, codes, or destination city dynamically from PostgreSQL."""
    clean_upper = text.upper()
    if any(k in clean_upper for k in ("JPY", "JPN")) or "円" in text or "¥" in text:
        return "JPY"
    if (
        "HUF" in clean_upper
        or " FT" in clean_upper
        or clean_upper.endswith("FT")
        or "FT " in clean_upper
    ):
        return "HUF"
    if "GBP" in clean_upper or "£" in text:
        return "GBP"
    if (
        "USD" in clean_upper
        or "US$" in clean_upper
        or ("$" in text and "CAD" not in clean_upper and "AUD" not in clean_upper)
    ):
        return "USD"
    if "CHF" in clean_upper:
        return "CHF"
    if "CAD" in clean_upper or "C$" in clean_upper:
        return "CAD"
    if "AUD" in clean_upper or "A$" in clean_upper:
        return "AUD"
    if "EUR" in clean_upper or "€" in text:
        return "EUR"

    # Query dynamic database-backed city currency cache (populated from PostgreSQL cities table)
    if city:
        _ensure_city_currencies_initialized()
        city_lower = city.strip().lower()
        if city_lower in _CITY_CURRENCY_CACHE:
            return _CITY_CURRENCY_CACHE[city_lower]
        for key, curr in _CITY_CURRENCY_CACHE.items():
            if key in city_lower or city_lower in key:
                return curr

    return "EUR"


def parse_osm_charge(
    charge_str: str | None, city: str = ""
) -> tuple[float | None, bool]:
    """Parses OSM charge tag strings, detects currency, and converts dynamically to EUR.

    Handles strings like '2500 JPY', '大人300円 子供150円', '500 HUF', '£15', 'free'.
    Rejects percentage-only values like '10%' or '16%'.
    """
    if not charge_str or not isinstance(charge_str, str):
        return None, False

    clean = charge_str.strip()
    if not clean:
        return None, False

    # Check for pure percentage service charges (e.g. "10%", "16%")
    if re.fullmatch(r"^\+?\d+(?:\.\d+)?\s*%$", clean):
        return None, False

    clean_lower = clean.lower()
    if re.search(r"\b(?:free|gratis|gratuit|donation|frei|no charge)\b", clean_lower):
        return 0.0, True

    curr = _detect_currency(clean, city)

    # Extract first nominal numeric value
    m = re.search(r"(\d+(?:[.,]\d{1,2})?)", clean)
    if not m:
        return None, False

    try:
        val = float(m.group(1).replace(",", "."))
    except ValueError:
        return None, False

    if val == 0.0:
        return 0.0, True

    if curr == "EUR":
        return round(val, 2), False

    try:
        eur_val = convert_currency(val, from_currency=curr, to_currency="EUR")
        return eur_val, False
    except Exception as exc:
        logger.warning(f"Failed to convert {val} {curr} to EUR: {exc}")
        return round(val, 2), False


def parse_wikivoyage_price(
    price_str: str | None, city: str = ""
) -> tuple[float | None, bool]:
    """Parses Wikivoyage listing price strings (e.g. '€15', 'free', '12 EUR', 'CZK 200 (~8 EUR)')."""
    if not price_str or not isinstance(price_str, str):
        return None, False

    clean = price_str.strip()
    clean_lower = clean.lower()
    if any(w in clean_lower for w in ("free", "gratis", "gratuit", "donation", "frei")):
        return 0.0, True

    # If Wikivoyage provides an explicit EUR equivalent in parentheses like (~8 EUR) or (€8), prioritize it
    eur_m = re.search(
        r"\(~?\s*(?:€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*eur)\)",
        clean_lower,
    )
    if eur_m:
        raw_val = eur_m.group(1) or eur_m.group(2)
        try:
            val = float(raw_val.replace(",", "."))
            return round(val, 2), val == 0.0
        except ValueError:
            pass

    curr = _detect_currency(clean, city)

    # Look for numeric patterns like 15, 15.00, 15,50
    m = re.search(r"(\d+(?:[.,]\d{1,2})?)", clean)
    if m:
        try:
            val = float(m.group(1).replace(",", "."))
            if val == 0.0:
                return 0.0, True
            if curr == "EUR":
                return round(val, 2), False
            eur_val = convert_currency(val, from_currency=curr, to_currency="EUR")
            return eur_val, False
        except (ValueError, Exception) as exc:
            logger.debug("Failed parsing wikivoyage price %s: %s", clean, exc)
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
        # Dynamically populate city currencies from PostgreSQL cities table
        global _CITY_CURRENCY_CACHE
        city_res = await session.execute(
            select(CityModel.id, CityModel.name, CityModel.aliases, CityModel.currency)
        )
        for cid, name, aliases, curr in city_res.all():
            if curr:
                _CITY_CURRENCY_CACHE[cid.lower()] = curr.upper()
                _CITY_CURRENCY_CACHE[name.lower()] = curr.upper()
                for alias in aliases or []:
                    _CITY_CURRENCY_CACHE[alias.lower()] = curr.upper()

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
            charge_cost, is_free = parse_osm_charge(osm_charge, city=city)
            if charge_cost is not None:
                return charge_cost, False, "osm_charge_tag"

        # Tier 3: Check Wikivoyage listing price
        if wikivoyage_price:
            wv_cost, wv_free = parse_wikivoyage_price(wikivoyage_price, city=city)
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

        # 4.5 If existing data has a non-zero cost (e.g. scraped estimated cost), preserve it
        if existing_cost is not None and existing_cost > 0.0:
            return existing_cost, True, (existing_source or "existing_estimate")

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

        # Run structured extraction via configured LLM
        prompt = (
            f"Extract the adult admission price in EUR from the following text for {poi_name} in {city}.\n"
            "If admission is completely free of charge, set price_eur to 0.0 and is_free to true.\n"
            "If no price is mentioned, set price_eur to null.\n\n"
            f"Text:\n{extracted_text[:1200]}\n"
        )
        instructions = "You extract adult admission prices from website text. Ensure output matches the schema strictly."

        try:
            res_data = await LLMService.run_structured_extraction(
                output_type=POIPriceExtraction,
                prompt=prompt,
                instructions=instructions,
            )
            if not res_data:
                return None, True, "llm_extraction_failed"

            extracted_price = res_data.price_eur
            is_free = bool(res_data.is_free)

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
                        "LLM extracted price %s for %s, but literal verification failed in source text.",
                        price_val,
                        poi_name,
                    )
                    return None, True, "literal_verification_failed"
        except Exception as e:
            logger.debug("LLM pricing extraction failed: %s", e)

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
