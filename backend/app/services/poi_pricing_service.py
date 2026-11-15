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
from app.db.models import CityModel, PoiPriceCatalogModel
from app.db.seeds.poi_prices import INITIAL_VERIFIED_PRICES
from app.engine.currency import convert_currency
from app.utils.opening_hours_parser import parse_osm_opening_hours
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


_CITY_CURRENCY_CACHE: dict[str, str] = {}


def _ensure_city_currencies_initialized() -> None:
    """Lazily populates in-memory city currency cache dynamically from PostgreSQL if empty."""
    global _CITY_CURRENCY_CACHE
    if _CITY_CURRENCY_CACHE:
        return
    try:
        import asyncio

        from sqlalchemy.ext.asyncio import (
            AsyncSession,
            async_sessionmaker,
            create_async_engine,
        )
        from sqlalchemy.pool import NullPool

        from app.db.session import DATABASE_URL, async_session

        async def _fetch_on_current_pool():
            async with async_session() as session:
                await PoiPricingService.load_catalog_from_db(session)

        async def _fetch_isolated():
            # Never check out shared engine pool connections inside a throwaway asyncio.run loop.
            iso_engine = create_async_engine(
                DATABASE_URL, echo=False, future=True, poolclass=NullPool
            )
            try:
                iso_session = async_sessionmaker(
                    iso_engine, class_=AsyncSession, expire_on_commit=False
                )
                async with iso_session() as session:
                    await PoiPricingService.load_catalog_from_db(session)
            finally:
                await iso_engine.dispose()

        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                asyncio.create_task(_fetch_on_current_pool())
                return
        except RuntimeError:
            asyncio.run(_fetch_isolated())
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
    def _extract_jsonld_price(
        cls, raw_html: str, city: str
    ) -> tuple[float | None, bool] | None:
        """Deterministically inspects JSON-LD structured data blocks for offer prices or free access."""
        blocks = re.findall(
            r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            raw_html,
            flags=re.DOTALL | re.IGNORECASE,
        )
        for block in blocks:
            try:
                data = json.loads(block.strip())
            except (json.JSONDecodeError, TypeError):
                continue

            queue: list[object] = [data]
            while queue:
                node = queue.pop(0)
                if isinstance(node, list):
                    queue.extend(node)
                    continue
                if not isinstance(node, dict):
                    continue

                if node.get("isAccessibleForFree") is True:
                    return 0.0, False

                offers = node.get("offers")
                if isinstance(offers, dict):
                    offers = [offers]
                if isinstance(offers, list):
                    for offer in offers:
                        if not isinstance(offer, dict):
                            continue
                        raw_p = offer.get("price")
                        if raw_p is None:
                            continue
                        try:
                            val = float(str(raw_p).replace(",", ".").strip())
                        except ValueError:
                            continue
                        if val < 0.0:
                            continue
                        raw_num_str = str(raw_p).strip()
                        if raw_num_str not in raw_html:
                            continue
                        if val == 0.0:
                            return 0.0, False
                        curr = str(
                            offer.get("priceCurrency") or ""
                        ).strip().upper() or _detect_currency(block, city)
                        eur_val = (
                            val
                            if curr == "EUR"
                            else convert_currency(
                                val, from_currency=curr, to_currency="EUR"
                            )
                        )
                        return round(eur_val, 2), False

                for v in node.values():
                    if isinstance(v, (dict, list)):
                        queue.append(v)
        return None

    @classmethod
    async def scrape_and_verify_official_price(
        cls,
        website_url: str,
        poi_name: str,
        city: str,
    ) -> tuple[float | None, bool, str]:
        """Tier 4: Scrapes official website and extracts admission price deterministically.

        Guarantees: Any extracted numeric price must literally appear in the fetched HTML/text.
        """
        if not website_url or not website_url.startswith(("http://", "https://")):
            return None, True, "invalid_url"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Paladio/1.0"
        }
        candidate_urls = [website_url]
        for sub in ("/tickets", "/visita", "/tarifs", "/en/tickets", "/prices"):
            candidate_urls.append(urljoin(website_url, sub))

        raw_html = ""
        extracted_text = ""
        try:
            async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
                for target_url in candidate_urls[:2]:
                    try:
                        resp = await client.get(target_url, headers=headers)
                        if resp.status_code == 200:
                            raw_html = resp.text
                            jsonld_res = cls._extract_jsonld_price(raw_html, city)
                            if jsonld_res is not None:
                                return (
                                    jsonld_res[0],
                                    jsonld_res[1],
                                    "official_website_literal_verified",
                                )

                            # Strip script, style and html tags
                            clean = re.sub(
                                r"<(script|style)[^>]*>.*?</\1>",
                                " ",
                                raw_html,
                                flags=re.DOTALL | re.IGNORECASE,
                            )
                            clean = re.sub(r"<[^>]+>", " ", clean)
                            clean = re.sub(r"\s+", " ", clean).strip()

                            # Extract sentences/segments with pricing signals without splitting decimals
                            segments = [
                                seg.strip()
                                for seg in re.split(r"(?<!\d)\.(?!\d)|[!\?\n]+", clean)
                                if seg.strip()
                            ]
                            signal_re = re.compile(
                                r"(?:€|EUR|\$|£|¥|CHF|HUF|CZK|admission|ticket|entry|entrada|tarifs?|billet|free|gratis|gratuit)",
                                re.IGNORECASE,
                            )
                            matches = [seg for seg in segments if signal_re.search(seg)]
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

        price_re = re.compile(
            r"(?:"
            r"(?P<pre_curr>US\$|C\$|A\$|[€£$¥]|(?:EUR|GBP|USD|JPY|CHF|HUF|CZK|PLN)\b)\s*(?P<pre_num>\d{1,5}(?:[.,]\d{1,2})?)"
            r"|"
            r"(?P<post_num>\d{1,5}(?:[.,]\d{1,2})?)\s*(?P<post_curr>[€£$¥円]|(?:EUR|GBP|USD|JPY|CHF|HUF|CZK|PLN|euros?)\b)"
            r")",
            re.IGNORECASE,
        )

        best_candidate: tuple[int, float, str, str] | None = None
        for m in price_re.finditer(extracted_text):
            if m.start() > 0 and extracted_text[m.start() - 1] == "-":
                continue
            raw_curr = (m.group("pre_curr") or m.group("post_curr") or "").strip()
            raw_num = (m.group("pre_num") or m.group("post_num") or "").strip()
            if not raw_curr or not raw_num:
                continue
            if re.fullmatch(r"\d{1,3}(?:,\d{3})+", raw_num):
                norm_num = raw_num.replace(",", "")
            else:
                norm_num = raw_num.replace(",", ".")
            try:
                val = float(norm_num)
            except ValueError:
                continue
            if val <= 0.0:
                continue

            window = extracted_text[
                max(0, m.start() - 45) : min(len(extracted_text), m.end() + 35)
            ].lower()
            score = 0
            if re.search(
                r"\b(?:adult|general\s+admission|standard|regular|full\s+price)\b",
                window,
            ):
                score += 3
            if re.search(
                r"\b(?:admission|ticket|entry|entrada|tarif|billet)\b", window
            ):
                score += 1
            if re.search(
                r"\b(?:child|children|kid|student|senior|concession|reduced|youth|discount)\b",
                window,
            ):
                score -= 3

            if best_candidate is None or score > best_candidate[0]:
                best_candidate = (score, val, raw_curr, raw_num)

        if best_candidate is not None:
            _, price_val, raw_curr, raw_num = best_candidate
            int_str = str(int(price_val))
            float_str_dot = f"{price_val:.2f}"
            float_str_comma = float_str_dot.replace(".", ",")
            candidates = [
                raw_num,
                int_str,
                float_str_dot,
                float_str_comma,
                str(price_val),
            ]
            if any(c in extracted_text for c in candidates if c):
                curr = _detect_currency(f"{raw_curr} {extracted_text}", city)
                eur_val = (
                    price_val
                    if curr == "EUR"
                    else convert_currency(
                        price_val, from_currency=curr, to_currency="EUR"
                    )
                )
                return round(eur_val, 2), False, "official_website_literal_verified"
            return None, True, "literal_verification_failed"

        # Check explicit free-admission phrases only when no ticket price was found
        if re.search(
            r"\b(?:free\s+(?:admission|entry|access)|(?:admission|entry)\s+is\s+free|free\s+of\s+charge|entrada\s+gratuita|entr[ée]e\s+gratuite)\b",
            extracted_text.lower(),
        ):
            return 0.0, False, "official_website_literal_verified"

        return None, True, "no_price_extracted"

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
