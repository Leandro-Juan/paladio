"""
Ryanair public fare API provider.
Includes oneWayFares standard query and cheapestPerDay bulk month sweep for day-0 baselines.
"""

import json
import logging
from datetime import date, datetime, timezone
from typing import Any
import httpx
from app.engine.market.config import config
from app.engine.market.ports import FareObservation, FlightQuote
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    ParseDriftError,
    ProviderBlockedError,
)

logger = logging.getLogger(__name__)


class RyanairProvider(BaseQuoteProvider):
    """
    Tier 1 Flight Provider using Ryanair public endpoints.
    Direct live fares, schedules, and carrier confirmation.
    """

    BASE_URL = "https://www.ryanair.com/api/farfnd/v4/oneWayFares"

    def __init__(self, timeout_sec: float = 12.0):
        super().__init__(name="ryanair", asset_type="flight", cloud=False)
        self.timeout_sec = timeout_sec
        self.headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Paladio/1.0",
            "Accept": "application/json",
        }

    def _redis_cache_key(self, origin: str, dest: str, month_str: str) -> str:
        return f"market:ryanair:raw:{origin.upper()}:{dest.upper()}:{month_str}"

    async def _get_cached_raw_response(self, cache_key: str) -> dict[str, Any] | None:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.debug(f"[Ryanair] Redis cache read bypassed: {e}")
        return None

    async def _set_cached_raw_response(
        self, cache_key: str, data: dict[str, Any], ttl_sec: int = 86400
    ) -> None:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            await redis.set(cache_key, json.dumps(data), ex=ttl_sec)
        except Exception as e:
            logger.debug(f"[Ryanair] Redis cache write bypassed: {e}")

    async def is_healthy(self) -> bool:
        return True

    async def fetch_cached_flights(
        self,
        origin_iata: str,
        dest_iata: str,
        date_from: date,
        date_to: date,
        session: Any = None,
    ) -> list[FlightQuote]:
        from app.engine.market.flights.classifier import route_classifier

        classification = route_classifier.classify_corridor(origin_iata, dest_iata)
        if not classification.is_europe:
            return []

        params = {
            "departureAirportIataCode": origin_iata,
            "arrivalAirportIataCode": dest_iata,
            "language": "en",
            "limit": 100,
            "market": "en-gb",
            "offset": 0,
            "outboundDepartureDateFrom": date_from.isoformat(),
            "outboundDepartureDateTo": date_to.isoformat(),
        }
        quotes: list[FlightQuote] = []
        try:
            async with httpx.AsyncClient(headers=self.headers) as client:
                resp = await client.get(
                    self.BASE_URL, params=params, timeout=self.timeout_sec
                )
                if resp.status_code in (403, 429):
                    raise ProviderBlockedError(
                        f"Ryanair returned HTTP {resp.status_code}"
                    )
                if resp.status_code != 200:
                    logger.warning(
                        f"Ryanair feed returned HTTP {resp.status_code} for {origin_iata}->{dest_iata}"
                    )
                try:
                    data = resp.json()
                except Exception as e:
                    raise ParseDriftError(
                        f"Ryanair returned invalid/non-JSON response: {e}"
                    )

                if not isinstance(data, dict):
                    raise ParseDriftError(
                        f"Ryanair returned unexpected JSON root type: {type(data)}"
                    )

                for fare in data.get("fares", []):
                    out = fare.get("outbound", {})
                    p_info = out.get("price", {})
                    val = p_info.get("value")
                    curr = p_info.get("currencyCode", "EUR")
                    dep_str = out.get("departureDate")
                    arr_str = out.get("arrivalDate")
                    if val is None or not dep_str or not arr_str:
                        continue

                    dep_dt = datetime.fromisoformat(dep_str)
                    arr_dt = datetime.fromisoformat(arr_str)
                    price_cents = int(round(float(val) * 100))

                    carrier_name = out.get("carrier") or "Ryanair"
                    fl_num = out.get("flightNumber")

                    quotes.append(
                        FlightQuote(
                            origin_iata=origin_iata,
                            destination_iata=dest_iata,
                            destination_city_id=dest_iata,
                            depart_time=dep_dt,
                            arrival_time=arr_dt,
                            base_price_cents=price_cents,
                            currency=curr,
                            carrier=carrier_name,
                            flight_number=fl_num,
                            stops=0,
                            deep_link=f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={origin_iata}&destinationIata={dest_iata}&dateOut={dep_dt.date().isoformat()}",
                            source="ryanair",
                            observed_at=datetime.now(timezone.utc),
                            is_live=True,
                            confidence="high",
                            ancillaries_excluded=True,
                        )
                    )
        except (ProviderBlockedError, ParseDriftError):
            raise
        except Exception as e:
            logger.error(f"Error querying Ryanair flight feed: {e}")
        return quotes

    async def fetch_month_cheapest_per_day(
        self, origin_iata: str, dest_iata: str, month_start: date, session: Any = None
    ) -> list[FlightQuote]:
        """
        Queries Ryanair cheapestPerDay endpoint for bulk baseline bootstrapping.
        """
        from app.engine.market.flights.classifier import route_classifier

        classification = route_classifier.classify_corridor(origin_iata, dest_iata)
        if classification.corridor_region != "intra_europe":
            return []
        month_str = month_start.strftime("%Y-%m")
        cache_key = self._redis_cache_key(origin_iata, dest_iata, month_str)

        cached_payload = await self._get_cached_raw_response(cache_key)
        if cached_payload:
            return self._parse_cheapest_per_day(cached_payload, origin_iata, dest_iata)

        url = f"https://www.ryanair.com/api/farfnd/v4/oneWayFares/{origin_iata}/{dest_iata}/cheapestPerDay"
        params = {
            "outboundMonthOfDate": f"{month_str}-01",
            "market": "en-gb",
            "language": "en",
        }
        quotes: list[FlightQuote] = []
        try:
            async with httpx.AsyncClient(headers=self.headers) as client:
                resp = await client.get(url, params=params, timeout=self.timeout_sec)
                if resp.status_code in (403, 429):
                    raise ProviderBlockedError(
                        f"Ryanair cheapestPerDay returned HTTP {resp.status_code}"
                    )
                if resp.status_code != 200:
                    return []
                try:
                    data = resp.json()
                except Exception as e:
                    raise ParseDriftError(
                        f"Ryanair cheapestPerDay returned non-JSON response: {e}"
                    )

                if not isinstance(data, dict):
                    raise ParseDriftError(
                        f"Ryanair cheapestPerDay returned unexpected JSON type: {type(data)}"
                    )

                if data and data.get("outbound"):
                    await self._set_cached_raw_response(cache_key, data, ttl_sec=86400)

                quotes = self._parse_cheapest_per_day(data, origin_iata, dest_iata)
        except (ProviderBlockedError, ParseDriftError):
            raise
        except Exception as e:
            logger.debug(
                f"CheapestPerDay endpoint failed for {origin_iata}->{dest_iata}: {e}"
            )
        return quotes

    def _parse_cheapest_per_day(
        self, data: dict[str, Any], origin_iata: str, dest_iata: str
    ) -> list[FlightQuote]:
        quotes: list[FlightQuote] = []
        outbound = data.get("outbound", {})
        fares = outbound.get("fares", [])
        for f in fares:
            day_str = f.get("day")
            price_obj = f.get("price")
            unavailable = f.get("unavailable", False)
            if unavailable or not price_obj or not day_str:
                continue
            val = price_obj.get("value")
            curr = price_obj.get("currencyCode", "EUR")
            if val is None:
                continue
            dep_raw = f.get("departureDate")
            arr_raw = f.get("arrivalDate")
            if dep_raw and arr_raw:
                dep_dt = datetime.fromisoformat(dep_raw)
                arr_dt = datetime.fromisoformat(arr_raw)
            else:
                dep_dt = None
                arr_dt = None
            dep_date_val = date.fromisoformat(day_str)
            price_cents = int(round(float(val) * 100))
            quotes.append(
                FlightQuote(
                    origin_iata=origin_iata,
                    destination_iata=dest_iata,
                    destination_city_id=dest_iata,
                    depart_date=dep_date_val,
                    depart_time=dep_dt,
                    arrival_time=arr_dt,
                    base_price_cents=price_cents,
                    currency=curr,
                    carrier="Ryanair",
                    flight_number=f.get("flightNumber"),
                    stops=0,
                    deep_link=f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={origin_iata}&destinationIata={dest_iata}&dateOut={day_str}",
                    source="ryanair",
                    source_class="cache",
                    observed_at=datetime.now(timezone.utc),
                    found_at=datetime.now(timezone.utc),
                    fetched_at=datetime.now(timezone.utc),
                    is_live=False,
                    confidence="medium",
                    ancillaries_excluded=True,
                )
            )
        return quotes

    async def fetch_month(
        self, origin: str, dest: str, month: date, trip_type: str = "one_way"
    ) -> list[FareObservation]:
        """
        Implementation of FareProvider port for Ryanair direct carrier.
        Queries Ryanair cheapestPerDay endpoint, converts quotes into FareObservation models.
        """
        from app.engine.market.flights.classifier import route_classifier

        classification = route_classifier.classify_corridor(origin, dest)
        if classification.corridor_region != "intra_europe":
            return []

        quotes = await self.fetch_month_cheapest_per_day(origin, dest, month)
        now = datetime.now(timezone.utc)
        observations: list[FareObservation] = []
        for q in quotes:
            dep_date = q.depart_date or (
                q.depart_time.date() if q.depart_time else None
            )
            if not dep_date:
                continue
            obs = FareObservation(
                origin=origin.upper(),
                destination=dest.upper(),
                depart_date=dep_date,
                depart_time=q.depart_time,
                arrival_time=q.arrival_time,
                return_date=None,
                trip_type=trip_type,
                price_cents=q.base_price_cents,
                currency=q.currency,
                carrier=q.carrier or "Ryanair",
                flight_number=q.flight_number,
                stops=q.stops,
                deep_link=q.deep_link,
                source="ryanair",
                source_class="cache",
                market="es",
                found_at=q.found_at or now,
                fetched_at=q.fetched_at or now,
                flags={"unavailable": False},
            )
            observations.append(obs)
        return observations

    async def fetch_calendar_horizon(
        self,
        origin_iata: str,
        dest_iata: str,
        months_ahead: int = 11,
        session: Any = None,
    ) -> list[FlightQuote]:
        """
        Sweeps cheapestPerDay across up to `months_ahead` forward calendar months.
        Gathers ~300 real daily market prices across seasons, weekdays, and lead times.
        Politely batched with concurrency limit.
        """
        from app.engine.market.flights.classifier import route_classifier

        classification = route_classifier.classify_corridor(origin_iata, dest_iata)
        if not classification.is_europe:
            return []

        import asyncio

        now = datetime.now(timezone.utc)
        sem = asyncio.Semaphore(3)

        async def _fetch_single(m_date: date) -> list[FlightQuote]:
            async with sem:
                await asyncio.sleep(0.05)
                return await self.fetch_month_cheapest_per_day(
                    origin_iata, dest_iata, m_date, session=session
                )

        month_dates = []
        for i in range(months_ahead):
            y = now.year + (now.month - 1 + i) // 12
            m = (now.month - 1 + i) % 12 + 1
            month_dates.append(date(y, m, 1))

        tasks = [_fetch_single(m_date) for m_date in month_dates]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_quotes: list[FlightQuote] = []
        for res in results:
            if isinstance(res, list):
                all_quotes.extend(res)
            elif isinstance(res, Exception):
                logger.warning(
                    f"Error in calendar horizon sweep for {origin_iata}->{dest_iata}: {res}"
                )

        return all_quotes

    async def verify_flight(
        self, quote: FlightQuote, session: Any = None
    ) -> tuple[bool, int, dict[str, Any]]:
        """Live verification check for exact departure date."""
        dep_date = quote.depart_time.date() if quote.depart_time else quote.depart_date
        if not dep_date:
            return False, 0, {"reason": "Missing departure date on quote"}
        live_quotes = await self.fetch_cached_flights(
            quote.origin_iata,
            quote.destination_iata,
            dep_date,
            dep_date,
            session=session,
        )
        if not live_quotes:
            return False, 0, {"reason": "Flight not found on live re-check"}

        matching = [
            q
            for q in live_quotes
            if quote.depart_time
            and q.depart_time
            and abs((q.depart_time - quote.depart_time).total_seconds()) < 7200
        ]
        if not matching:
            matching = live_quotes

        live_quote = matching[0]
        tolerance = config.VERIFY_TOLERANCE
        max_acceptable = quote.base_price_cents * (1.0 + tolerance)

        if live_quote.base_price_cents <= max_acceptable:
            return (
                True,
                live_quote.base_price_cents,
                {
                    "verified_base_cents": live_quote.base_price_cents,
                    "carrier": live_quote.carrier,
                    "flight_number": live_quote.flight_number,
                    "ancillaries_excluded": True,
                },
            )
        return (
            False,
            live_quote.base_price_cents,
            {
                "reason": f"Live price {live_quote.base_price_cents} exceeds tolerance over observed {quote.base_price_cents}"
            },
        )
