"""
Aviasales / Travelpayouts v3 Flight Cache Provider.
Provides bulk month flight price observations with zero synthetic data.
Complies with PLAN.md Phase 2 and Strict Token Conservation Protocol.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from app.engine.market.config import config, get_travelpayouts_token
from app.engine.market.ports import FareObservation, FlightQuote
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    CircuitBreakerOpenError,
    ParseDriftError,
    ProviderBlockedError,
)

logger = logging.getLogger(__name__)


class TokenBucketRateLimiter:
    """
    Token bucket rate limiter enforcing AVIASALES_MAX_RPM.
    Spreads requests evenly to prevent burst throttling.
    """

    def __init__(self, max_rpm: int):
        self.capacity = float(max_rpm)
        self.fill_rate = float(max_rpm) / 60.0  # tokens per second
        self.tokens = self.capacity
        self.last_updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_updated
            self.last_updated = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.fill_rate)

            if self.tokens < 1.0:
                wait_time = (1.0 - self.tokens) / self.fill_rate
                await asyncio.sleep(wait_time)
                self.tokens = 0.0
                self.last_updated = time.monotonic()
            else:
                self.tokens -= 1.0


class AviasalesProvider(BaseQuoteProvider):
    """
    Primary Flight Cache Provider using Travelpayouts v3 Data API.
    Provides true observed historical prices across European, Transatlantic,
    and Global flight corridors.
    """

    BASE_URL = "https://api.travelpayouts.com/aviasales/v3/grouped_prices"
    PRICES_FOR_DATES_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"

    def __init__(
        self,
        token: str | None = None,
        market: str | None = None,
        currency: str | None = None,
        timeout_sec: float = 15.0,
        max_rpm: int | None = None,
    ):
        super().__init__(name="aviasales", asset_type="flight", cloud=False)
        self._token = get_travelpayouts_token() if token is None else token
        self.market = (market or config.AVIASALES_MARKET).lower()
        self.currency = (currency or config.AVIASALES_CURRENCY).lower()
        self.timeout_sec = timeout_sec
        rpm = max_rpm or config.AVIASALES_MAX_RPM
        self._rate_limiter = TokenBucketRateLimiter(max_rpm=rpm)
        self._semaphore = asyncio.Semaphore(3)
        self._consecutive_failures = 0
        self.headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Paladio/1.0",
            "Accept": "application/json",
            "x-access-token": self._token,
        }

    async def is_healthy(self) -> bool:
        return bool(self._token)

    def _redis_cache_key(
        self, origin: str, dest: str, month_str: str, market: str, trip_type: str
    ) -> str:
        return f"market:aviasales:raw:{origin.upper()}:{dest.upper()}:{month_str}:{market.lower()}:{trip_type}"

    async def _get_cached_raw_response(self, cache_key: str) -> dict[str, Any] | None:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.debug(f"[Aviasales] Redis cache read bypassed: {e}")
        return None

    async def _set_cached_raw_response(
        self, cache_key: str, data: dict[str, Any], ttl_sec: int = 86400
    ) -> None:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            await redis.set(cache_key, json.dumps(data), ex=ttl_sec)
        except Exception as e:
            logger.debug(f"[Aviasales] Redis cache write bypassed: {e}")

    async def _call_api_with_resilience(
        self, url: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Executes HTTP request with token bucket rate limit, concurrency control,
        exponential backoff on 429/5xx, and rate limit telemetry logging.
        """
        if self._consecutive_failures >= 5:
            raise CircuitBreakerOpenError(
                f"Aviasales provider circuit breaker tripped after {self._consecutive_failures} consecutive failures"
            )

        max_retries = 3
        for attempt in range(1, max_retries + 1):
            await self._rate_limiter.acquire()
            async with self._semaphore:
                try:
                    async with httpx.AsyncClient(headers=self.headers) as client:
                        resp = await client.get(
                            url, params=params, timeout=self.timeout_sec
                        )

                        # Telemetry: log rate limit headers if present
                        rl = resp.headers.get("x-rate-limit")
                        rl_rem = resp.headers.get("x-rate-limit-remaining")
                        rl_reset = resp.headers.get("x-rate-limit-reset")
                        if rl or rl_rem:
                            logger.debug(
                                f"[Aviasales API] RateLimit limit={rl} remaining={rl_rem} reset={rl_reset}"
                            )

                        if resp.status_code == 429:
                            retry_after = resp.headers.get("retry-after")
                            backoff = None
                            if retry_after:
                                try:
                                    backoff = float(retry_after)
                                except (ValueError, TypeError):
                                    pass
                            if backoff is None:
                                backoff = min(
                                    2**attempt + random.uniform(0.1, 0.5), 30.0
                                )
                            logger.warning(
                                f"[Aviasales] Rate limited (429). Backing off for {backoff:.2f}s (attempt {attempt}/{max_retries})"
                            )
                            await asyncio.sleep(backoff)
                            continue

                        if resp.status_code == 403:
                            self._consecutive_failures += 1
                            raise ProviderBlockedError(
                                "Aviasales returned HTTP 403 Forbidden. Check TRAVELPAYOUTS_TOKEN."
                            )

                        if resp.status_code >= 500:
                            backoff = min(2**attempt + random.uniform(0.1, 0.5), 15.0)
                            logger.warning(
                                f"[Aviasales] Server error {resp.status_code}. Backing off {backoff:.2f}s (attempt {attempt}/{max_retries})"
                            )
                            await asyncio.sleep(backoff)
                            continue

                        if resp.status_code != 200:
                            self._consecutive_failures += 1
                            logger.error(
                                f"[Aviasales] Unexpected status code {resp.status_code}: {resp.text[:200]}"
                            )
                            return {}

                        try:
                            data = resp.json()
                        except Exception as e:
                            self._consecutive_failures += 1
                            raise ParseDriftError(
                                f"Aviasales returned non-JSON payload: {e}"
                            )

                        self._consecutive_failures = 0
                        return data

                except (ProviderBlockedError, CircuitBreakerOpenError, ParseDriftError):
                    raise
                except Exception as exc:
                    logger.warning(
                        f"[Aviasales] Request failed attempt {attempt}/{max_retries}: {exc}"
                    )
                    if attempt == max_retries:
                        self._consecutive_failures += 1
                        raise

        self._consecutive_failures += 1
        raise ProviderBlockedError(
            f"Aviasales requests exhausted after {max_retries} attempts"
        )

    def parse_raw_payload(
        self,
        raw_payload: dict[str, Any],
        origin: str,
        dest: str,
        month: date,
        trip_type: str = "one_way",
        market: str = "es",
        fetched_at: datetime | None = None,
    ) -> list[FareObservation]:
        """
        Pure parser mapping Travelpayouts raw payload to FareObservation.
        Strictly enforces:
        - Rejection of price <= 0 or missing currency.
        - Strict month window validation (guards against substituted dates).
        - Accurate extraction of search_date (found_at) from deep link.
        - Stale flag (> 7 days) and low confidence on actual=false.
        """
        now = fetched_at or datetime.now(timezone.utc)
        if not isinstance(raw_payload, dict):
            raise ParseDriftError(
                f"Aviasales payload must be a JSON object, got {type(raw_payload)}"
            )

        if "data" not in raw_payload:
            raise ParseDriftError(
                "Aviasales payload missing expected 'data' top-level key"
            )

        raw_data = raw_payload["data"]
        raw_items: list[dict[str, Any]] = []

        if isinstance(raw_data, dict):
            raw_items = list(raw_data.values())
        elif isinstance(raw_data, list):
            raw_items = raw_data
        else:
            raise ParseDriftError(
                f"Aviasales 'data' key must be dict or list, got {type(raw_data)}"
            )

        envelope_currency = str(raw_payload.get("currency") or "EUR").upper()
        observations: list[FareObservation] = []

        for item in raw_items:
            if not isinstance(item, dict):
                continue

            # 1. Price check
            # 1. Price check
            if "price" not in item:
                raise ParseDriftError("Aviasales item missing required price field")
            price_val = item.get("price")
            if price_val is None:
                continue
            try:
                price_float = float(price_val)
            except (ValueError, TypeError):
                continue
            if price_float <= 0.0:
                continue
            price_cents = int(round(price_float * 100))

            # 2. Currency check
            item_currency = str(item.get("currency") or envelope_currency).upper()
            if not item_currency or len(item_currency) != 3:
                continue

            # 3. Departure date validation (strict requested month window check)
            if "departure_at" not in item:
                raise ParseDriftError(
                    "Aviasales item missing required departure_at field"
                )
            dep_raw = item.get("departure_at")
            if not dep_raw:
                continue
            try:
                dep_dt = datetime.fromisoformat(str(dep_raw))
            except Exception:
                continue

            dep_date = dep_dt.date()
            if dep_date.year != month.year or dep_date.month != month.month:
                # Substituted date outside requested month window -> reject
                continue

            has_time = "T" in str(dep_raw) or " " in str(dep_raw)
            depart_time = dep_dt if has_time else None

            # 4. Extract found_at from link search_date=DDMMYYYY
            link = item.get("link")
            found_at = now
            if link and isinstance(link, str):
                match = re.search(r"search_date=(\d{2})(\d{2})(\d{4})", link)
                if match:
                    try:
                        d, m, y = (
                            int(match.group(1)),
                            int(match.group(2)),
                            int(match.group(3)),
                        )
                        found_at = datetime(y, m, d, tzinfo=timezone.utc)
                    except Exception:
                        found_at = now

            # 5. Stale evaluation & confidence
            age_days = (now.date() - found_at.date()).days
            is_stale = age_days > config.MARKET_MAX_OBSERVATION_AGE_DAYS
            is_actual = bool(item.get("actual", True))

            # 6. Durations and arrival time (only if real departure time exists)
            duration_to = item.get("duration_to") or item.get("duration")
            arr_dt: datetime | None = None
            if depart_time and duration_to and isinstance(duration_to, (int, float)):
                arr_dt = depart_time + timedelta(minutes=int(duration_to))

            # 7. Metadata attributes
            carrier = item.get("airline")
            flight_num = str(item.get("flight_number") or "") or None
            stops_raw = item.get("transfers")
            stops = int(stops_raw) if stops_raw is not None else None
            gate = item.get("gate")
            origin_code = (
                item.get("origin_airport") or item.get("origin") or origin
            ).upper()
            dest_code = (
                item.get("destination_airport") or item.get("destination") or dest
            ).upper()

            deep_link = None
            if link:
                deep_link = (
                    f"https://www.aviasales.com{link}" if link.startswith("/") else link
                )

            obs = FareObservation(
                origin=origin_code,
                destination=dest_code,
                depart_date=dep_date,
                depart_time=depart_time,
                arrival_time=arr_dt,
                return_date=None,  # One-way observations store NULL return_date
                trip_type=trip_type,
                price_cents=price_cents,
                currency=item_currency,
                carrier=carrier,
                flight_number=flight_num,
                stops=stops,
                deep_link=deep_link,
                source="aviasales",
                source_class="cache",
                market=market.lower(),
                found_at=found_at,
                fetched_at=now,
                flags={
                    "is_stale": is_stale,
                    "is_actual": is_actual,
                    "gate": gate,
                    "age_days": age_days,
                    "duration_minutes": duration_to,
                },
            )
            observations.append(obs)

        return observations

    async def fetch_month(
        self, origin: str, dest: str, month: date, trip_type: str = "one_way"
    ) -> list[FareObservation]:
        """
        Implementation of FareProvider port per PLAN.md section 4.
        Queries Travelpayouts v3 grouped_prices (cheapest per day),
        leveraging Redis cache and returning clean FareObservation objects.
        """
        month_str = month.strftime("%Y-%m")
        cache_key = self._redis_cache_key(
            origin, dest, month_str, self.market, trip_type
        )

        cached_payload = await self._get_cached_raw_response(cache_key)
        if cached_payload:
            return self.parse_raw_payload(
                cached_payload,
                origin=origin,
                dest=dest,
                month=month,
                trip_type=trip_type,
                market=self.market,
            )

        params = {
            "origin": origin.upper(),
            "destination": dest.upper(),
            "departure_at": month_str,
            "currency": self.currency,
            "market": self.market,
            "group_by": "departure_at",
            "token": self._token,
        }

        fetched_at = datetime.now(timezone.utc)
        payload = await self._call_api_with_resilience(self.BASE_URL, params)

        if payload and payload.get("data"):
            await self._set_cached_raw_response(cache_key, payload, ttl_sec=86400)

        return self.parse_raw_payload(
            payload,
            origin=origin,
            dest=dest,
            month=month,
            trip_type=trip_type,
            market=self.market,
            fetched_at=fetched_at,
        )

    async def fetch_month_cheapest_per_day(
        self, origin_iata: str, dest_iata: str, month_start: date, session: Any = None
    ) -> list[FlightQuote]:
        """
        Adapter method satisfying BaseQuoteProvider ladder for bulk scans.
        Converts FareObservation into FlightQuote instances.
        """
        observations = await self.fetch_month(
            origin=origin_iata,
            dest=dest_iata,
            month=month_start,
            trip_type="one_way",
        )
        quotes: list[FlightQuote] = []
        for obs in observations:
            is_stale = obs.flags.get("is_stale", False) if obs.flags else False
            is_actual = obs.flags.get("is_actual", True) if obs.flags else True
            conf = "low" if (is_stale or not is_actual) else "medium"

            quotes.append(
                FlightQuote(
                    origin_iata=obs.origin,
                    destination_iata=obs.destination,
                    destination_city_id=obs.destination,
                    depart_date=obs.depart_date,
                    depart_time=obs.depart_time,
                    arrival_time=obs.arrival_time,
                    base_price_cents=obs.price_cents,
                    currency=obs.currency,
                    carrier=obs.carrier or "Various",
                    flight_number=obs.flight_number,
                    stops=obs.stops or 0,
                    deep_link=obs.deep_link,
                    source="aviasales",
                    source_class="cache",
                    observed_at=obs.fetched_at,
                    found_at=obs.found_at,
                    fetched_at=obs.fetched_at,
                    is_live=False,
                    confidence=conf,
                    ancillaries_excluded=True,
                )
            )
        return quotes

    async def fetch_cached_flights(
        self,
        origin_iata: str,
        dest_iata: str,
        date_from: date,
        date_to: date,
        session: Any = None,
    ) -> list[FlightQuote]:
        """
        Fetches quotes covering range [date_from, date_to] across relevant months.
        """
        quotes: list[FlightQuote] = []
        cur_year, cur_month = date_from.year, date_from.month
        end_year, end_month = date_to.year, date_to.month

        months_to_fetch: list[date] = []
        while (cur_year, cur_month) <= (end_year, end_month):
            months_to_fetch.append(date(cur_year, cur_month, 1))
            if cur_month == 12:
                cur_year += 1
                cur_month = 1
            else:
                cur_month += 1

        for m in months_to_fetch:
            month_quotes = await self.fetch_month_cheapest_per_day(
                origin_iata, dest_iata, m, session=session
            )
            for q in month_quotes:
                if q.depart_date and date_from <= q.depart_date <= date_to:
                    quotes.append(q)

        return quotes

    async def fetch_calendar_horizon(
        self,
        origin_iata: str,
        dest_iata: str,
        months_ahead: int = 11,
        session: Any = None,
    ) -> list[FlightQuote]:
        """
        Sweeps cheapest-per-day across up to `months_ahead` forward calendar months.
        Gathers real daily market price observations across forward horizon.
        """
        now = datetime.now(timezone.utc)
        month_dates = []
        for i in range(months_ahead):
            y = now.year + (now.month - 1 + i) // 12
            m = (now.month - 1 + i) % 12 + 1
            month_dates.append(date(y, m, 1))

        all_quotes: list[FlightQuote] = []
        for m_date in month_dates:
            try:
                quotes = await self.fetch_month_cheapest_per_day(
                    origin_iata, dest_iata, m_date, session=session
                )
                all_quotes.extend(quotes)
            except Exception as exc:
                logger.debug(
                    f"[Aviasales] Horizon step {origin_iata}->{dest_iata} for {m_date} failed: {exc}"
                )

        return all_quotes
