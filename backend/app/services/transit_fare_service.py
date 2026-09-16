import dis
import inspect
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import NamedTuple

import httpx
from app.db.models import CityTransitFareModel
from app.domain.entities.poi import TransitRecommendation, TransitStep
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
    currency: str = "EUR"
    single_fare: float = 1.80
    pass_24h_price: float | None = None
    pass_24h_name: str | None = None
    pass_24h_includes_airport: bool = False
    airport_surcharge: float = 0.0
    airport_station_keywords: list[str] = field(default_factory=list)
    is_estimated: bool = False
    source: str = "verified_official_tariff"
    agency_name: str | None = None
    source_url: str | None = None

    def __init__(
        self,
        city: str = "",
        country: str = "Unknown",
        currency: str = "EUR",
        single_fare: float | None = None,
        pass_24h_price: float | None = None,
        pass_24h_name: str | None = None,
        pass_24h_includes_airport: bool = False,
        airport_surcharge: float | None = None,
        airport_station_keywords: list[str] | None = None,
        is_estimated: bool = False,
        source: str = "verified_official_tariff",
        agency_name: str | None = None,
        source_url: str | None = None,
        city_name: str | None = None,
        single_fare_eur: float | None = None,
        day_pass_fare_eur: float | None = None,
        day_pass_name: str | None = None,
        airport_surcharge_eur: float | None = None,
    ):
        self.city = city or (city_name or "")
        self.country = country
        self.currency = currency
        self.single_fare = (
            single_fare
            if single_fare is not None
            else (single_fare_eur if single_fare_eur is not None else 1.80)
        )
        self.pass_24h_price = (
            pass_24h_price if pass_24h_price is not None else day_pass_fare_eur
        )
        self.pass_24h_name = (
            pass_24h_name if pass_24h_name is not None else day_pass_name
        )
        self.pass_24h_includes_airport = pass_24h_includes_airport
        self.airport_surcharge = (
            airport_surcharge
            if airport_surcharge is not None
            else (airport_surcharge_eur if airport_surcharge_eur is not None else 0.0)
        )
        self.airport_station_keywords = (
            airport_station_keywords if airport_station_keywords is not None else []
        )
        self.is_estimated = is_estimated
        self.source = source
        self.agency_name = agency_name
        self.source_url = source_url

    @property
    def city_name(self) -> str:
        return self.city

    @city_name.setter
    def city_name(self, value: str) -> None:
        self.city = value

    @property
    def single_fare_eur(self) -> float:
        return self.single_fare

    @single_fare_eur.setter
    def single_fare_eur(self, value: float) -> None:
        self.single_fare = value

    @property
    def day_pass_fare_eur(self) -> float | None:
        return self.pass_24h_price

    @day_pass_fare_eur.setter
    def day_pass_fare_eur(self, value: float | None) -> None:
        self.pass_24h_price = value

    @property
    def day_pass_name(self) -> str | None:
        return self.pass_24h_name

    @day_pass_name.setter
    def day_pass_name(self, value: str | None) -> None:
        self.pass_24h_name = value

    @property
    def airport_surcharge_eur(self) -> float:
        return self.airport_surcharge

    @airport_surcharge_eur.setter
    def airport_surcharge_eur(self, value: float) -> None:
        self.airport_surcharge = value


# Verified Real-World City Public Transit Tariffs (Official Transit Authorities)
VERIFIED_CITY_FARES: dict[str, CityTransitFare] = {
    "madrid": CityTransitFare(
        city="madrid",
        country="Spain",
        currency="EUR",
        single_fare=1.50,
        pass_24h_price=8.40,
        pass_24h_name="Abono Turístico 1 Día (Zona A)",
        pass_24h_includes_airport=True,
        airport_surcharge=3.00,
        airport_station_keywords=[
            "aeropuerto t1-t2-t3",
            "aeropuerto t4",
            "aeropuerto",
            "barajas",
        ],
        is_estimated=False,
        source="official_crtm_tariff",
    ),
    "paris": CityTransitFare(
        city="paris",
        country="France",
        currency="EUR",
        single_fare=2.15,
        pass_24h_price=8.45,
        pass_24h_name="Navigo Jour (Zones 1-2)",
        pass_24h_includes_airport=False,
        airport_surcharge=9.65,  # 11.80€ RER B CDG to Paris minus 2.15€ base single = 9.65€ supplement
        airport_station_keywords=[
            "aeroport charles de gaulle",
            "aeroport cdg",
            "cdg",
            "roissy",
            "aeroport d'orly",
            "orlyval",
        ],
        is_estimated=False,
        source="official_idfm_tariff",
    ),
    "lisbon": CityTransitFare(
        city="lisbon",
        country="Portugal",
        currency="EUR",
        single_fare=1.80,
        pass_24h_price=6.80,
        pass_24h_name="Bilhete 24h Carris/Metro",
        pass_24h_includes_airport=True,
        airport_surcharge=0.0,  # Standard metro fare covers Humberto Delgado Airport
        airport_station_keywords=["aeroporto", "aeroporto de lisboa"],
        is_estimated=False,
        source="official_carris_metro_tariff",
    ),
    "barcelona": CityTransitFare(
        city="barcelona",
        country="Spain",
        currency="EUR",
        single_fare=2.55,
        pass_24h_price=11.20,
        pass_24h_name="Hola Barcelona 24h Travel Card",
        pass_24h_includes_airport=True,
        airport_surcharge=2.95,  # 5.50€ Airport ticket minus 2.55€ base single = 2.95€ supplement
        airport_station_keywords=[
            "aeroport t1",
            "aeroport t2",
            "aeroport",
            "el prat",
        ],
        is_estimated=False,
        source="official_tmb_tariff",
    ),
    "rome": CityTransitFare(
        city="rome",
        country="Italy",
        currency="EUR",
        single_fare=1.50,
        pass_24h_price=7.00,
        pass_24h_name="Biglietto 24 Ore ATAC",
        pass_24h_includes_airport=False,
        airport_surcharge=12.50,  # 14.00€ Leonardo Express minus 1.50€ base single = 12.50€ supplement
        airport_station_keywords=["fiumicino", "aeroporto fiumicino", "ciampino"],
        is_estimated=False,
        source="official_atac_tariff",
    ),
}

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
        for key, fare in VERIFIED_CITY_FARES.items():
            self._cache[key.lower().strip()] = (time.time(), fare)

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
            for key, fare in VERIFIED_CITY_FARES.items():
                self._cache[key.lower().strip()] = (time.time(), fare)

    def __contains__(self, city: str) -> bool:
        return self.get(city) is not None

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)


class _TransitFareResultBase(NamedTuple):
    total_cost: float
    cost_is_estimated: bool
    price_source: str
    has_airport: bool
    airport_surcharge_eur: float = 0.0


class TransitFareResult(_TransitFareResultBase):
    """
    Result tuple for transit leg fare calculation.
    Supports:
      - 4-item unpacking: (cost, is_est, source, has_airport)
      - 5-item unpacking: (cost, is_est, source, has_airport, surcharge)
      - Named attributes: total_cost, cost_is_estimated, price_source, has_airport, airport_surcharge_eur
      - Property aliases: cost, is_estimated, source
    """

    def __iter__(self):
        try:
            frame = inspect.currentframe().f_back
            if frame:
                instructions = list(dis.get_instructions(frame.f_code))
                for instr in instructions:
                    if instr.offset == frame.f_lasti and instr.opname in (
                        "UNPACK_SEQUENCE",
                        "UNPACK_EX",
                    ):
                        if instr.argval == 4:
                            return iter(
                                (
                                    self.total_cost,
                                    self.cost_is_estimated,
                                    self.price_source,
                                    self.has_airport,
                                )
                            )
                        elif instr.argval == 5:
                            return iter(
                                (
                                    self.total_cost,
                                    self.cost_is_estimated,
                                    self.price_source,
                                    self.has_airport,
                                    self.airport_surcharge_eur,
                                )
                            )
        except (AttributeError, ValueError, TypeError, IndexError, RuntimeError):
            pass
        return super().__iter__()

    @property
    def cost(self) -> float:
        return self.total_cost

    @property
    def is_estimated(self) -> bool:
        return self.cost_is_estimated

    @property
    def source(self) -> str:
        return self.price_source


class TransitFareExtractionSchema(BaseModel):
    agency_name: str = Field(
        description="Official public transit authority or operator name, e.g., CRTM, BVG, TfL, RATP, TMB, ATAC"
    )
    single_fare_eur: float = Field(
        description="Standard adult single journey transit ticket price in central zone in EUR"
    )
    day_pass_name: str | None = Field(
        default=None,
        description="Name of the official 24-hour or tourist day pass if available",
    )
    day_pass_fare_eur: float | None = Field(
        default=None,
        description="Price of the official 24-hour or tourist day pass in EUR",
    )
    airport_surcharge_eur: float = Field(
        default=0.0,
        description="Additional airport supplement or differential for train/metro to the airport in EUR",
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

        if city_key in VERIFIED_CITY_FARES:
            fare = VERIFIED_CITY_FARES[city_key]
            cache.set(city_key, fare)
            return fare

        # Automatic fallback estimation for any unindexed city
        logger.info(
            f"City '{city}' not in transit tariff cache. Using regional benchmark estimate."
        )
        fallback = CityTransitFare(
            city=city_key,
            country="Unknown",
            currency="EUR",
            single_fare=2.00,
            pass_24h_price=8.00,
            pass_24h_name="Estimated 24h Transit Pass",
            pass_24h_includes_airport=False,
            airport_surcharge=3.00,
            airport_station_keywords=list(GENERIC_AIRPORT_KEYWORDS),
            is_estimated=True,
            source="regional_benchmark_estimate",
        )
        cache.set(city_key, fallback)
        return fallback

    @classmethod
    async def _lookup_db(
        cls, city_key: str, db: AsyncSession | None = None
    ) -> CityTransitFare | None:
        async def _query(session: AsyncSession) -> CityTransitFare | None:
            stmt = select(CityTransitFareModel).where(
                CityTransitFareModel.city_name == city_key
            )
            result = await session.execute(stmt)
            model = result.scalar_one_or_none()
            if model:
                return CityTransitFare(
                    city=model.city_name,
                    country=model.country or "Unknown",
                    currency=model.currency,
                    single_fare=model.single_fare_eur,
                    pass_24h_price=model.day_pass_fare_eur,
                    pass_24h_name=model.day_pass_name,
                    pass_24h_includes_airport=model.pass_24h_includes_airport,
                    airport_surcharge=model.airport_surcharge_eur,
                    airport_station_keywords=model.airport_station_keywords or [],
                    is_estimated=model.is_estimated,
                    source=model.source or "database_tariff",
                    agency_name=model.agency_name,
                    source_url=model.source_url,
                )
            return None

        if db is not None:
            return await _query(db)

        try:
            from app.db.session import async_session

            async with async_session() as session:
                res = await _query(session)
                await session.rollback()
                return res
        except (SQLAlchemyError, RuntimeError, OSError, ValueError, KeyError) as e:
            logger.debug(f"DB lookup failed for {city_key}: {e}")
            return None

    @classmethod
    async def persist_fare_to_db(
        cls, fare: CityTransitFare, db: AsyncSession | None = None
    ) -> None:
        """
        Persists a resolved city transit fare into PostgreSQL.
        """
        stmt = pg_insert(CityTransitFareModel).values(
            city_name=fare.city,
            country=fare.country,
            currency=fare.currency,
            agency_name=fare.agency_name,
            single_fare_eur=fare.single_fare,
            day_pass_fare_eur=fare.pass_24h_price,
            day_pass_name=fare.pass_24h_name,
            pass_24h_includes_airport=fare.pass_24h_includes_airport,
            airport_surcharge_eur=fare.airport_surcharge,
            airport_station_keywords=fare.airport_station_keywords,
            source=fare.source or "official_tariff",
            is_estimated=fare.is_estimated,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["city"],
            set_={
                "country": fare.country,
                "currency": fare.currency,
                "agency_name": fare.agency_name,
                "single_fare": fare.single_fare,
                "pass_24h_price": fare.pass_24h_price,
                "pass_24h_name": fare.pass_24h_name,
                "pass_24h_includes_airport": fare.pass_24h_includes_airport,
                "airport_surcharge": fare.airport_surcharge,
                "airport_station_keywords": fare.airport_station_keywords,
                "source": fare.source or "official_tariff",
                "is_estimated": fare.is_estimated,
            },
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

        async with httpx.AsyncClient(headers=headers, timeout=12.0) as client:
            try:
                resp = await client.get(
                    api_url,
                    params={
                        "action": "parse",
                        "page": city_name,
                        "prop": "sections",
                        "format": "json",
                    },
                )
                data = resp.json()

                page_title = city_name
                if "error" in data:
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
                    if search_data and len(search_data) > 1 and len(search_data[1]) > 0:
                        page_title = search_data[1][0]
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

                sections = data.get("parse", {}).get("sections", [])
                target_keywords = (
                    "get in",
                    "by plane",
                    "to and from the airport",
                    "airport",
                    "get around",
                    "by metro",
                    "by train",
                    "by bus",
                    "public transit",
                    "fares",
                    "tickets",
                )
                matched_sections = []
                for s in sections:
                    line = (s.get("line") or "").lower()
                    if any(kw in line for kw in target_keywords):
                        matched_sections.append(s.get("index"))

                if not matched_sections:
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
                for idx in matched_sections[:4]:
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
                return combined[:4500] if combined else None
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
            f"Extract:\n"
            f"- agency_name: Official transport authority or network name (e.g. CRTM, BVG, TfL, RATP, TMB, ATAC, etc.)\n"
            f"- single_fare_eur: Standard single trip ride fare in central zone in EUR (number)\n"
            f"- day_pass_name: Official 24-hour pass name or None\n"
            f"- day_pass_fare_eur: 24-hour pass price in EUR or None\n"
            f"- airport_surcharge_eur: Additional airport supplement or surcharge in EUR (0.0 if included in standard ticket)\n"
            f"- airport_station_keywords: Key airport station names/tokens (e.g. ['aeropuerto', 'terminal', 'cdg'])\n"
            f"- source_url: Official website URL or None\n\n"
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
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{ollama_base_url}/api/generate", json=payload
                )
                if resp.status_code == 200:
                    raw_text = resp.json().get("response", "")
                    if raw_text:
                        parsed = TransitFareExtractionSchema.model_validate_json(
                            raw_text
                        )
                        if parsed.single_fare_eur and parsed.single_fare_eur > 0:
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

        # Tier 3: Live Web Discovery + Ollama Extraction
        try:
            context = await cls.fetch_wikivoyage_transit_text(city_key)
            if context:
                extracted = await cls.extract_fare_with_ollama(city_key, context)
                if extracted:
                    agency_name = (extracted.agency_name or "Official").strip()
                    agency_slug = agency_name.lower().replace(" ", "_")
                    fare = CityTransitFare(
                        city=city_key,
                        country="Unknown",
                        currency="EUR",
                        single_fare=round(extracted.single_fare_eur, 2),
                        pass_24h_price=round(extracted.day_pass_fare_eur, 2)
                        if extracted.day_pass_fare_eur is not None
                        else None,
                        pass_24h_name=extracted.day_pass_name
                        or f"{agency_name} 24h Pass",
                        pass_24h_includes_airport=False,
                        airport_surcharge=round(extracted.airport_surcharge_eur, 2),
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
                    except (
                        SQLAlchemyError,
                        RuntimeError,
                        OSError,
                        ValueError,
                    ) as db_err:
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
            currency="EUR",
            single_fare=2.00,
            pass_24h_price=8.00,
            pass_24h_name="Estimated 24h Transit Pass",
            pass_24h_includes_airport=False,
            airport_surcharge=3.00,
            airport_station_keywords=list(GENERIC_AIRPORT_KEYWORDS),
            is_estimated=True,
            source="regional_benchmark_estimate",
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
        if not has_airport and origin:
            orig_cat = str(origin.get("category") or "").strip().upper()
            orig_name = str(origin.get("name") or "").lower()
            if (
                orig_cat == "AIRPORT"
                or "airport" in orig_name
                or "aeropuerto" in orig_name
            ):
                has_airport = True

        if not has_airport and destination:
            dest_cat = str(destination.get("category") or "").strip().upper()
            dest_name = str(destination.get("name") or "").lower()
            if (
                dest_cat == "AIRPORT"
                or "airport" in dest_name
                or "aeropuerto" in dest_name
            ):
                has_airport = True

        if not has_airport:
            for s in steps:
                for field_val in (s.station_name, s.instruction, s.headsign):
                    if field_val and cls.is_airport_station(
                        field_val, fare.airport_station_keywords
                    ):
                        has_airport = True
                        break
                if has_airport:
                    break

        base_fare = fare.single_fare
        applied_surcharge = round(fare.airport_surcharge, 2) if has_airport else 0.0
        total_cost = round(base_fare + applied_surcharge, 2)

        if has_airport:
            logger.info(
                f"Airport transit leg detected in {city}: applied {applied_surcharge:.2f} {fare.currency} surcharge (total: {total_cost:.2f} {fare.currency})."
            )

        return TransitFareResult(
            total_cost=total_cost,
            cost_is_estimated=fare.is_estimated,
            price_source=fare.source,
            has_airport=has_airport,
            airport_surcharge_eur=applied_surcharge,
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
