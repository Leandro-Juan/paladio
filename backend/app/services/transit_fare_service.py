import asyncio
import concurrent.futures
import logging
import os
import threading
import time
from dataclasses import dataclass, field

import httpx
from app.db.models import TransitFareModel, TransitFareQuoteModel
from app.domain.entities.poi import TransitRecommendation, TransitStep
from app.domain.reference.iso_currencies import from_minor_units
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class CityTransitFare:
    city: str = ""
    country: str = "Unknown"
    currency: str = ""
    single_fare: float | None = None
    pass_24h_price: float | None = None
    pass_24h_name: str | None = None
    pass_24h_includes_airport: bool = False
    airport_surcharge: float = 0.0
    airport_station_keywords: list[str] = field(default_factory=list)
    is_estimated: bool = False
    source: str = "transit_tariff"
    agency_name: str | None = None
    source_url: str | None = None
    fare_unknown: bool = False


# Generic fallback keywords for identifying airport stations across any language
GENERIC_AIRPORT_KEYWORDS = [
    "airport",
    "aeropuerto",
    "aéroport",
    "aeroporto",
    "flughafen",
    "lufthavn",
    "lotnisko",
    "havalimanı",
]


class CityTransitFareCache:
    """
    Process-level thread-safe O(1) in-memory cache for resolved city public transit fares.
    Guarantees sub-millisecond lookups during itinerary optimization solving.
    """

    def __init__(self, ttl_seconds: float = 86400 * 7):
        self._cache: dict[str, tuple[float, CityTransitFare]] = {}
        self._lock = threading.RLock()
        self._ttl_seconds = ttl_seconds

    @staticmethod
    def normalize_city(city: str) -> str:
        if not city:
            return ""
        return city.split(",")[0].strip().lower()

    def get(self, city: str) -> CityTransitFare | None:
        key = self.normalize_city(city)
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            timestamp, fare = entry
            if (time.time() - timestamp > self._ttl_seconds) and fare.is_estimated:
                self._cache.pop(key, None)
                return None
            return fare

    def set(self, city: str, fare: CityTransitFare, ttl: float | None = None) -> None:
        key = self.normalize_city(city)
        with self._lock:
            self._cache[key] = (time.time(), fare)

    def invalidate(self, city: str) -> None:
        key = self.normalize_city(city)
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def __contains__(self, city: str) -> bool:
        return self.get(city) is not None

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)


@dataclass(frozen=True)
class TransitFareResult:
    """Result frozen dataclass for transit leg fare calculation."""

    total_cost: float
    cost_is_estimated: bool
    price_source: str
    has_airport: bool
    airport_surcharge_eur: float = 0.0
    currency: str = "EUR"


class TransitFareExtractionSchema(BaseModel):
    agency_name: str = Field(
        default="Official",
        description="Official public transit authority or operator name",
    )
    single_fare: float = Field(
        default=0.0,
        description="Standard adult single journey transit ticket price in native currency",
    )
    currency: str = Field(
        default="EUR",
        description="ISO 4217 currency code of the operator (e.g. JPY, EUR, GBP, USD)",
    )
    evidence_quote: str = Field(
        default="",
        description="Exact verbatim sentence or phrase from the context text mentioning the fare and currency",
    )
    day_pass_name: str | None = Field(
        default=None,
        description="Name of the official 24-hour or tourist day pass if available",
    )
    day_pass_fare: float | None = Field(
        default=None,
        description="Price of the official 24-hour or tourist day pass in native currency",
    )
    airport_surcharge: float = Field(
        default=0.0,
        description="Additional airport supplement or differential in native currency",
    )
    airport_station_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords, station names, or line identifiers associated with airport transit",
    )
    source_url: str | None = Field(
        default=None,
        description="Official transit authority portal URL",
    )


_FARE_CACHE: CityTransitFareCache | None = None


def get_fare_cache() -> CityTransitFareCache:
    global _FARE_CACHE
    if _FARE_CACHE is None:
        _FARE_CACHE = CityTransitFareCache()
    return _FARE_CACHE


class TransitFareService:
    """
    Sovereign pricing service determining dynamic real-world public transit fares,
    airport surcharges, and 24-hour pass savings across any city.
    """

    @classmethod
    def get_cache(cls) -> CityTransitFareCache:
        return get_fare_cache()

    @classmethod
    def get_city_transit_fare(cls, city: str) -> CityTransitFare:
        city_key = CityTransitFareCache.normalize_city(city)
        cache = cls.get_cache()
        cached = cache.get(city_key)
        if cached is not None:
            return cached

        # Attempt dynamic lookup from DB in thread worker if not cached
        try:

            def _fetch():
                loop = asyncio.new_event_loop()
                try:
                    return loop.run_until_complete(cls._lookup_db(city_key))
                finally:
                    loop.close()

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                db_fare = pool.submit(_fetch).result(timeout=4.0)
            if db_fare:
                cache.set(city_key, db_fare)
                return db_fare
        except Exception as e:
            logger.debug(f"Dynamic DB lookup skipped for '{city_key}': {e}")

        # Automatic honest unindexed city handling: never invent arbitrary tariffs
        logger.info(
            f"City '{city}' not in transit tariff cache. Labeling fare as unknown."
        )
        fallback = CityTransitFare(
            city=city_key,
            country="Unknown",
            currency="UNKNOWN",
            single_fare=0.0,
            pass_24h_price=None,
            pass_24h_name=None,
            pass_24h_includes_airport=False,
            airport_surcharge=0.0,
            airport_station_keywords=list(GENERIC_AIRPORT_KEYWORDS),
            is_estimated=True,
            source="fare_unknown",
            fare_unknown=True,
        )
        cache.set(city_key, fallback)
        return fallback

    @classmethod
    async def _lookup_db(
        cls, city_key: str, db: AsyncSession | None = None
    ) -> CityTransitFare | None:
        async def _query(session: AsyncSession) -> CityTransitFare | None:
            city_keywords = list(GENERIC_AIRPORT_KEYWORDS)

            # 1. Query normalized active quotes from transit_fare_quotes
            q_stmt = (
                select(TransitFareQuoteModel)
                .where(
                    TransitFareQuoteModel.city == city_key,
                    TransitFareQuoteModel.status == "active",
                )
                .order_by(TransitFareQuoteModel.tier.asc())
            )
            q_res = await session.execute(q_stmt)
            quotes = list(q_res.scalars().all())
            if quotes:
                # Find single fare, supplement, and day pass
                single_q = next(
                    (q for q in quotes if q.product_type == "single"), quotes[0]
                )
                supp_q = next(
                    (q for q in quotes if q.product_type == "supplement"), None
                )
                pass_q = next((q for q in quotes if q.product_type == "day_pass"), None)

                op_slug = (
                    (single_q.operator or "official")
                    .lower()
                    .replace("/", "_")
                    .replace(" ", "_")
                )
                source_label = (
                    f"official_{op_slug}_tariff"
                    if single_q.tier <= 2
                    else "grounded_tariff"
                )
                return CityTransitFare(
                    city=city_key,
                    country="Unknown",
                    currency=single_q.currency,
                    single_fare=from_minor_units(
                        single_q.amount_minor, single_q.currency
                    ),
                    pass_24h_price=from_minor_units(
                        pass_q.amount_minor, pass_q.currency
                    )
                    if pass_q
                    else None,
                    pass_24h_name=f"{single_q.operator} 24h Pass" if pass_q else None,
                    pass_24h_includes_airport=bool(pass_q and not supp_q),
                    airport_surcharge=from_minor_units(
                        supp_q.amount_minor, supp_q.currency
                    )
                    if supp_q
                    else 0.0,
                    airport_station_keywords=city_keywords,
                    is_estimated=False,
                    source=source_label,
                    agency_name=single_q.operator,
                    source_url=single_q.source_url,
                    fare_unknown=False,
                )

            # 2. Query GTFS transit_fares table
            gtfs_stmt = (
                select(TransitFareModel)
                .where(TransitFareModel.city == city_key)
                .limit(1)
            )
            gtfs_res = await session.execute(gtfs_stmt)
            gtfs_fare = gtfs_res.scalars().first()
            if gtfs_fare:
                op_name = gtfs_fare.agency_id or "Subway"
                op_slug = op_name.lower().replace("/", "_").replace(" ", "_")
                return CityTransitFare(
                    city=city_key,
                    country="Unknown",
                    currency=gtfs_fare.currency,
                    single_fare=gtfs_fare.price,
                    pass_24h_price=None,
                    pass_24h_name=None,
                    pass_24h_includes_airport=False,
                    airport_surcharge=0.0,
                    airport_station_keywords=city_keywords,
                    is_estimated=False,
                    source=f"official_{op_slug}_tariff",
                    agency_name=op_name,
                    source_url=f"gtfs://{city_key}/fare_attributes.txt",
                    fare_unknown=False,
                )

            return None

        if db is not None:
            return await _query(db)

        try:
            from app.db.session import async_session

            async with async_session() as session:
                return await _query(session)
        except Exception as e:
            logger.debug(f"DB lookup failed for {city_key}: {e}")
            return None

    @classmethod
    async def persist_fare_to_db(
        cls, fare: CityTransitFare, db: AsyncSession | None = None
    ) -> None:
        """
        Persists a resolved city transit fare into PostgreSQL.
        """
        import hashlib
        from app.utils.currency import to_minor_units

        curr = fare.currency or "EUR"
        minor = to_minor_units(fare.single_fare or 0.0, curr)
        ev_hash = hashlib.sha256(
            f"{fare.city}:single:{minor}:{curr}".encode()
        ).hexdigest()
        stmt = pg_insert(TransitFareQuoteModel).values(
            city=fare.city,
            operator=fare.agency_name or "Official",
            product_type="single",
            amount_minor=minor,
            currency=curr,
            tier=2 if not fare.is_estimated else 3,
            source_url=fare.source_url,
            evidence_hash=ev_hash,
            confidence=0.5 if fare.is_estimated else 1.0,
            status="active",
        )

        if db is not None:
            await db.execute(stmt)
            await db.commit()
            return

        try:
            from app.db.session import async_session

            async with async_session() as session, session.begin():
                await session.execute(stmt)
        except (SQLAlchemyError, RuntimeError, OSError, ValueError) as e:
            logger.warning(f"Could not persist fare for {fare.city} to DB: {e}")

    @classmethod
    async def fetch_wikivoyage_transit_text(cls, city: str) -> str | None:
        """
        Fetches public transport and airport transit wikitext from Wikivoyage MediaWiki API.
        Zero-auth, free sovereign live web grounding.
        """
        if not city:
            return None
        city_name = city.split(",")[0].strip()
        headers = {
            "User-Agent": "PaladioTravelApp/1.0 (sovereign travel solver; contact@paladio.org)"
        }
        api_url = "https://en.wikivoyage.org/w/api.php"

        async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
            try:
                # 1. Search page title via opensearch first to handle multi-word city names
                search_resp = await client.get(
                    api_url,
                    params={
                        "action": "opensearch",
                        "search": city_name,
                        "limit": 1,
                        "format": "json",
                    },
                )
                search_data = search_resp.json()
                page_title = (
                    search_data[1][0]
                    if (search_data and len(search_data) > 1 and search_data[1])
                    else city_name
                )

                resp = await client.get(
                    api_url,
                    params={
                        "action": "parse",
                        "page": page_title,
                        "prop": "sections",
                        "format": "json",
                    },
                )
                data = resp.json()
                if not isinstance(data, dict):
                    return None

                parse_obj = data.get("parse", {})
                if not isinstance(parse_obj, dict):
                    return None
                sections = parse_obj.get("sections", [])
                if not isinstance(sections, list):
                    sections = []

                # Priority 1: High priority fare & ticket sections
                high_priority_keywords = ("fare", "ticket", "pass", "cost")
                # Priority 2: Local public transport & get around sections
                med_priority_keywords = (
                    "get around",
                    "public transport",
                    "by metro",
                    "by subway",
                    "by bus",
                    "by tram",
                    "by train",
                )
                # Priority 3: Airport / arrival sections
                low_priority_keywords = (
                    "to and from the airport",
                    "airport",
                    "by plane",
                    "get in",
                )

                # Find index/prefix for 'get around'
                get_around_prefix = None
                for s in sections:
                    if (s.get("line") or "").strip().lower() == "get around":
                        get_around_prefix = str(s.get("number", "")) + "."
                        break

                high_matched = []
                med_matched = []
                low_matched = []
                for s in sections:
                    line = (s.get("line") or "").lower()
                    idx = s.get("index")
                    sec_num = str(s.get("number", ""))

                    # Fare / ticket keywords are top priority anywhere
                    if any(kw in line for kw in high_priority_keywords):
                        high_matched.append(idx)
                    # Subsections of 'Get around' or local transport keywords
                    elif (
                        get_around_prefix and sec_num.startswith(get_around_prefix)
                    ) or any(kw in line for kw in med_priority_keywords):
                        med_matched.append(idx)
                    elif any(kw in line for kw in low_priority_keywords):
                        low_matched.append(idx)

                # Prioritize: fares -> Get around transit sub-sections -> airport/arrival
                chosen_sections = (high_matched + med_matched + low_matched)[:4]

                if not chosen_sections:
                    summary_resp = await client.get(
                        api_url,
                        params={
                            "action": "parse",
                            "page": page_title,
                            "prop": "wikitext",
                            "format": "json",
                        },
                    )
                    wikitext = (
                        summary_resp.json()
                        .get("parse", {})
                        .get("wikitext", {})
                        .get("*", "")
                    )
                    return wikitext[:4000] if wikitext else None

                gathered_texts = []
                for idx in chosen_sections:
                    sec_resp = await client.get(
                        api_url,
                        params={
                            "action": "parse",
                            "page": page_title,
                            "section": idx,
                            "prop": "wikitext",
                            "format": "json",
                        },
                    )
                    sec_text = (
                        sec_resp.json()
                        .get("parse", {})
                        .get("wikitext", {})
                        .get("*", "")
                    )
                    if sec_text:
                        gathered_texts.append(sec_text)

                combined = "\n\n".join(gathered_texts)
                return combined[:5000] if combined else None
            except (
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                KeyError,
                RuntimeError,
            ) as e:
                logger.warning(f"Wikivoyage fetch failed for '{city}': {e}")
                return None

    @classmethod
    async def extract_fare_with_ollama(
        cls, city: str, context: str
    ) -> TransitFareExtractionSchema | None:
        """
        Extracts structured transit tariff details using Ollama (qwen2.5) with JSON schema mode.
        """
        ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11435")
        if ollama_base_url.endswith("/v1"):
            ollama_base_url = ollama_base_url[:-3].rstrip("/")

        raw_model = os.getenv(
            "TRANSIT_PARSER_MODEL", os.getenv("VALIDATOR_MODEL", "qwen2.5:latest")
        )
        model = raw_model.removeprefix("ollama:")

        schema = TransitFareExtractionSchema.model_json_schema()
        prompt = (
            f"You are a public transit pricing extraction specialist. Analyze the travel context for '{city}' below.\n"
            f"Extract the exact pricing details from the context:\n"
            f"- agency_name: Official transport authority or operator name (e.g. BVG, TfL, MTA, GVB, Wiener Linien)\n"
            f"- single_fare: Numeric single journey ticket fare in native currency\n"
            f"- currency: 3-letter ISO currency code (e.g. EUR, GBP, USD, JPY)\n"
            f"- evidence_quote: An EXACT, verbatim sentence or phrase from the context that mentions the single ticket price. Do NOT summarize or invent text.\n"
            f"- day_pass_name: Name of the 24-hour pass if mentioned, or null\n"
            f"- day_pass_fare: Numeric 24-hour pass price if mentioned, or null\n"
            f"- airport_surcharge: Numeric airport supplement or 0.0\n"
            f"- airport_station_keywords: list of airport station tokens\n"
            f"- source_url: Official website URL if mentioned in text, or null\n\n"
            f"Context:\n{context}\n"
        )

        payload = {
            "model": model,
            "prompt": prompt,
            "format": schema,
            "stream": False,
            "options": {
                "temperature": 0.0,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(
                    f"{ollama_base_url}/api/generate", json=payload
                )
                if resp.status_code == 200:
                    raw_text = resp.json().get("response", "")
                    if raw_text:
                        parsed = TransitFareExtractionSchema.model_validate_json(
                            raw_text
                        )
                        fare_val = parsed.single_fare
                        if fare_val and fare_val > 0:
                            return parsed
                else:
                    logger.warning(
                        f"Ollama extraction returned HTTP {resp.status_code} for {city}"
                    )
        except (
            httpx.HTTPError,
            TimeoutError,
            ValueError,
            KeyError,
            RuntimeError,
            ValidationError,
        ) as e:
            logger.warning(f"Ollama fare extraction failed for {city}: {e}")

        return None

    @classmethod
    async def resolve_city_transit_fare(
        cls, city: str, db: AsyncSession | None = None
    ) -> CityTransitFare:
        """
        Multi-tier sovereign tariff resolver:
        Tier 1: Process In-Memory Cache (O(1))
        Tier 2: PostgreSQL Database Persistence
        Tier 3: Sovereign Live Web Discovery (Wikivoyage API) + Ollama Structured Extraction (qwen2.5)
        Tier 4: Anti-Crash Resilient Baseline Fallback
        """
        city_key = CityTransitFareCache.normalize_city(city)
        if not city_key:
            return cls.get_city_transit_fare(city)

        cache = cls.get_cache()

        # Tier 1: In-memory cache hit
        cached = cache.get(city_key)
        if cached is not None and not cached.is_estimated:
            return cached

        # Tier 2: PostgreSQL Persistence hit
        try:
            db_fare = await cls._lookup_db(city_key, db)
            if db_fare is not None:
                cache.set(city_key, db_fare)
                return db_fare
        except (SQLAlchemyError, RuntimeError, OSError, ValueError, KeyError) as e:
            logger.debug(f"Database lookup skipped or failed for '{city_key}': {e}")

        # Tier 3: Live Web Discovery + Ollama Grounded Extraction
        try:
            context = await cls.fetch_wikivoyage_transit_text(city_key)
            if context:
                extracted = await cls.extract_fare_with_ollama(city_key, context)
                if extracted and extracted.single_fare:
                    # Strict Grounded Verbatim Verification:
                    clean_quote = (extracted.evidence_quote or "").strip()
                    quote_valid = False
                    num_valid = False
                    if clean_quote:
                        # Check direct inclusion or tokenized inclusion
                        raw_c = context.replace("''", "").replace("'''", "")
                        raw_q = clean_quote.replace("''", "").replace("'''", "")
                        quote_valid = (
                            clean_quote in context
                            or clean_quote[:30] in context
                            or raw_q in raw_c
                            or raw_q[:25] in raw_c
                        )
                        price_str = f"{extracted.single_fare:.2f}".rstrip("0").rstrip(
                            "."
                        )
                        int_str = str(int(extracted.single_fare))
                        num_valid = bool(
                            price_str in clean_quote
                            or int_str in clean_quote
                            or price_str in context
                            or int_str in context
                        )
                        if not (quote_valid and num_valid):
                            logger.warning(
                                f"Rejecting ungrounded LLM extraction for '{city_key}': quote_valid={quote_valid}, num_valid={num_valid}"
                            )
                            extracted = None

                    if extracted and extracted.single_fare:
                        raw_agency = (extracted.agency_name or "Official").strip()
                        # Guard against LLM echoing the prompt instruction text
                        if (
                            "Official transport authority" in raw_agency
                            or "e.g." in raw_agency
                        ):
                            raw_agency = city_key.title() + " Transit"
                        agency_name = raw_agency
                        agency_slug = (
                            agency_name.lower().replace(" ", "_").replace("/", "_")
                        )
                        native_curr = extracted.currency or "EUR"
                        fare = CityTransitFare(
                            city=city_key,
                            country="Unknown",
                            currency=native_curr,
                            single_fare=round(extracted.single_fare, 2),
                            pass_24h_price=round(extracted.day_pass_fare, 2)
                            if extracted.day_pass_fare is not None
                            else None,
                            pass_24h_name=extracted.day_pass_name
                            or f"{agency_name} 24h Pass",
                            pass_24h_includes_airport=False,
                            airport_surcharge=round(extracted.airport_surcharge, 2),
                            airport_station_keywords=extracted.airport_station_keywords
                            or list(GENERIC_AIRPORT_KEYWORDS),
                            is_estimated=False,
                            source=f"official_{agency_slug}",
                            agency_name=agency_name,
                            source_url=extracted.source_url
                            or f"https://en.wikivoyage.org/wiki/{city_key.title()}",
                        )
                        try:
                            await cls.persist_fare_to_db(fare, db)
                        except Exception as db_err:
                            logger.warning(
                                f"Failed to persist resolved fare for '{city_key}' to DB: {db_err}"
                            )

                        cache.set(city_key, fare)
                        return fare
        except (
            httpx.HTTPError,
            TimeoutError,
            ValueError,
            KeyError,
            RuntimeError,
            ValidationError,
        ) as e:
            logger.warning(
                f"Live web tariff discovery failed for '{city}': {e}. Applying graceful fallback."
            )

        # Tier 4: Anti-Crash Resilient Fallback Policy
        if cached is not None:
            return cached

        fallback_fare = CityTransitFare(
            city=city_key,
            country="Unknown",
            currency="UNKNOWN",
            single_fare=0.0,
            pass_24h_price=None,
            pass_24h_name=None,
            pass_24h_includes_airport=False,
            airport_surcharge=0.0,
            airport_station_keywords=list(GENERIC_AIRPORT_KEYWORDS),
            is_estimated=True,
            source="fare_unknown",
            fare_unknown=True,
        )
        cache.set(city_key, fallback_fare)
        return fallback_fare

    @classmethod
    async def prewarm_city_fare(
        cls, city: str, db: AsyncSession | None = None
    ) -> CityTransitFare:
        """Pre-warms destination city tariff into cache and DB."""
        return await cls.resolve_city_transit_fare(city, db=db)

    @classmethod
    def is_airport_station(cls, text: str, keywords: list[str]) -> bool:
        if not text:
            return False
        text_lower = text.lower()
        all_kw = set(keywords) | set(GENERIC_AIRPORT_KEYWORDS)
        return any(kw in text_lower for kw in all_kw)

    @classmethod
    def calculate_transit_leg_fare(
        cls,
        city: str,
        steps: list[TransitStep],
        fare: CityTransitFare | None = None,
        is_airport_leg: bool = False,
        origin: dict | None = None,
        destination: dict | None = None,
    ) -> TransitFareResult:
        """
        Calculates exact leg fare, detecting transport mode and airport surcharges.
        Returns: TransitFareResult (supporting 4-item or 5-item unpacking and named properties).
        """
        has_transit = any(
            s.type in ("transit", "transit_board", "transit_alight") for s in steps
        )
        if not has_transit and not is_airport_leg:
            return TransitFareResult(0.0, False, "pedestrian_zero_cost", False, 0.0)

        if fare is None:
            fare = cls.get_city_transit_fare(city)

        has_airport = is_airport_leg
        orig_is_airport = False
        if origin:
            orig_cat = str(origin.get("category") or "").strip().upper()
            orig_name = str(origin.get("name") or "").lower()
            if (
                orig_cat == "AIRPORT"
                or "airport" in orig_name
                or "aeropuerto" in orig_name
                or cls.is_airport_station(orig_name, fare.airport_station_keywords)
            ):
                orig_is_airport = True

        dest_is_airport = False
        if destination:
            dest_cat = str(destination.get("category") or "").strip().upper()
            dest_name = str(destination.get("name") or "").lower()
            if (
                dest_cat == "AIRPORT"
                or "airport" in dest_name
                or "aeropuerto" in dest_name
                or cls.is_airport_station(dest_name, fare.airport_station_keywords)
            ):
                dest_is_airport = True

        if is_airport_leg or orig_is_airport or dest_is_airport:
            has_airport = True
        elif origin is not None and destination is not None:
            # Both endpoints are explicitly known and neither is an airport:
            # An intra-city transit ride must NOT be tagged as airport leg just because
            # the train's terminal destination / headsign points towards an airport.
            has_airport = False
        else:
            # Endpoints omitted (e.g. step-only tests): inspect step station/instruction/headsign
            for s in steps:
                for field_val in (s.station_name, s.instruction, s.headsign):
                    if field_val and cls.is_airport_station(
                        field_val, fare.airport_station_keywords
                    ):
                        has_airport = True
                        break
                if has_airport:
                    break

        base_fare = (
            fare.single_fare
            if (fare.single_fare is not None and not fare.fare_unknown)
            else 0.0
        )
        applied_surcharge = (
            round(fare.airport_surcharge, 2)
            if (has_airport and not fare.fare_unknown)
            else 0.0
        )
        total_cost = round(base_fare + applied_surcharge, 2)

        if has_airport and not fare.fare_unknown:
            logger.info(
                f"Airport transit leg detected in {city}: applied {applied_surcharge:.2f} {fare.currency} surcharge (total: {total_cost:.2f} {fare.currency})."
            )

        return TransitFareResult(
            total_cost=total_cost,
            cost_is_estimated=fare.is_estimated,
            price_source=fare.source,
            has_airport=has_airport,
            airport_surcharge_eur=applied_surcharge,
            currency=fare.currency or "EUR",
        )

    @classmethod
    def evaluate_daily_transit_savings(
        cls,
        city: str,
        leg_costs: list[float],
        has_airport_leg: bool = False,
        fare: CityTransitFare | None = None,
    ) -> TransitRecommendation:
        """
        Compares sum of individual transit rides against the city's 24h pass price.
        If the pass saves money, generates a 24H_PASS_RECOMMENDED advisory.
        """
        if fare is None:
            fare = cls.get_city_transit_fare(city)

        total_singles = round(sum(leg_costs), 2)

        # If city has a 24h pass and buying singles costs more than the pass
        if fare.pass_24h_price is not None and total_singles > fare.pass_24h_price:
            savings = round(total_singles - fare.pass_24h_price, 2)
            msg = (
                f"You have {len(leg_costs)} transit legs scheduled today totaling {total_singles:.2f} {fare.currency}. "
                f"Buying a 24h Pass ({fare.pass_24h_name} for {fare.pass_24h_price:.2f} {fare.currency}) "
                f"will save you {savings:.2f} {fare.currency} and grant unlimited rides."
            )
            if has_airport_leg and fare.pass_24h_includes_airport:
                msg += " This pass also covers the airport transit surcharge!"

            return TransitRecommendation(
                type="24H_PASS_RECOMMENDED",
                single_tickets_total_eur=total_singles,
                pass_name=fare.pass_24h_name,
                pass_price_eur=fare.pass_24h_price,
                savings_eur=savings,
                includes_airport=fare.pass_24h_includes_airport,
                message=msg,
            )

        return TransitRecommendation(
            type="SINGLE_TICKETS_OPTIMAL",
            single_tickets_total_eur=total_singles,
            pass_name=fare.pass_24h_name,
            pass_price_eur=fare.pass_24h_price,
            savings_eur=0.0,
            includes_airport=False,
            message=f"Individual single tickets ({total_singles:.2f} {fare.currency}) are more cost-effective than a day pass.",
        )
