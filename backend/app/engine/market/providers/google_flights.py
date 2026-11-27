"""
Google Flights Live Provider powered by fast-flights Protobuf queries (?tfs=)
and primp async Chrome TLS impersonation with defensive selectolax ds:1 parsing.
Zero synthetic data and zero cloud scraping services (cloud=False).
"""

from __future__ import annotations

import asyncio
import calendar
import json
import logging
import urllib.parse
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

import primp
from fast_flights import FlightQuery, Passengers, create_query
from selectolax.lexbor import LexborHTMLParser

from app.engine.market.config import config
from app.engine.market.flights.browser_pool import flight_browser_pool
from app.engine.market.flights.classifier import UnknownAirportError, route_classifier
from app.engine.market.ports import FareObservation, FlightQuote
from app.engine.market.providers.aviasales import TokenBucketRateLimiter
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    DailyBudgetExhaustedError,
    ParseDriftError,
    ProviderBlockedError,
)

logger = logging.getLogger(__name__)

_GENERIC_CARRIERS = frozenset(
    {"", "airline", "various", "aviasales", "flight_feed", "google_flights", "carrier"}
)


class _TransientGoogleError(Exception):
    """Internal signal for Google Flights transient ErrorResponse code 13."""


@dataclass(frozen=True)
class ParsedGoogleItinerary:
    origin_iata: str
    destination_iata: str
    depart_date: date
    depart_time: datetime | None
    arrival_time: datetime | None
    price_cents: int
    currency: str
    carrier: str
    carrier_code: str | None
    flight_number: str | None
    stops: int
    duration_mins: int | None
    is_best: bool
    deep_link: str
    price_insights: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["depart_date"] = self.depart_date.isoformat()
        data["depart_time"] = self.depart_time.isoformat() if self.depart_time else None
        data["arrival_time"] = (
            self.arrival_time.isoformat() if self.arrival_time else None
        )
        return data

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ParsedGoogleItinerary":
        return cls(
            origin_iata=str(raw["origin_iata"]),
            destination_iata=str(raw["destination_iata"]),
            depart_date=date.fromisoformat(raw["depart_date"]),
            depart_time=(
                datetime.fromisoformat(raw["depart_time"])
                if raw.get("depart_time")
                else None
            ),
            arrival_time=(
                datetime.fromisoformat(raw["arrival_time"])
                if raw.get("arrival_time")
                else None
            ),
            price_cents=int(raw["price_cents"]),
            currency=str(raw["currency"]),
            carrier=str(raw["carrier"]),
            carrier_code=raw.get("carrier_code"),
            flight_number=raw.get("flight_number"),
            stops=int(raw.get("stops", 0)),
            duration_mins=raw.get("duration_mins"),
            is_best=bool(raw.get("is_best", False)),
            deep_link=str(raw.get("deep_link", "")),
            price_insights=raw.get("price_insights"),
        )


def _is_number(val: Any) -> bool:
    return isinstance(val, (int, float)) and not isinstance(val, bool)


def _extract_wrapped_price_cents(node: Any) -> int | None:
    """Extracts a price from Google's `[None, 43]` or `[43]` wrappers as integer cents."""
    val: Any = None
    if isinstance(node, list):
        if len(node) >= 2 and _is_number(node[1]):
            val = node[1]
        elif len(node) >= 1 and _is_number(node[0]):
            val = node[0]
    elif _is_number(node):
        val = node
    if val is None or float(val) <= 0:
        return None
    return int(round(float(val) * 100))


def _parse_google_datetime(date_arr: Any, time_arr: Any) -> datetime | None:
    """
    Expands Google's `[YYYY, M, D]` + compact time pair (`[13]` -> 13:00, `[None, 20]` -> 00:20)
    into a naive local airport datetime matching RyanairProvider and detector conventions.
    """
    if not isinstance(date_arr, list) or len(date_arr) < 3:
        return None
    y, m, d = date_arr[0], date_arr[1], date_arr[2]
    if not (isinstance(y, int) and isinstance(m, int) and isinstance(d, int)):
        return None

    hour = 0
    minute = 0
    if isinstance(time_arr, list):
        if len(time_arr) >= 1 and isinstance(time_arr[0], int):
            hour = time_arr[0]
        if len(time_arr) >= 2 and isinstance(time_arr[1], int):
            minute = time_arr[1]

    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None

    try:
        return datetime(y, m, d, hour, minute)
    except ValueError:
        return None


def _extract_group(payload: list[Any], idx: int) -> list[Any]:
    if len(payload) <= idx or not isinstance(payload[idx], list) or not payload[idx]:
        return []
    group = payload[idx][0]
    return group if isinstance(group, list) else []


def _extract_price_insights(payload: list[Any]) -> dict[str, Any] | None:
    if len(payload) <= 5 or not isinstance(payload[5], list) or len(payload[5]) < 6:
        return None
    block = payload[5]
    insights: dict[str, Any] = {}
    if isinstance(block[0], int) and not isinstance(block[0], bool):
        insights["price_level"] = block[0]
    typical_low = _extract_wrapped_price_cents(block[4])
    typical_high = _extract_wrapped_price_cents(block[5])
    if typical_low is not None:
        insights["typical_low_cents"] = typical_low
    if typical_high is not None:
        insights["typical_high_cents"] = typical_high
    if (
        len(block) > 10
        and isinstance(block[10], list)
        and block[10]
        and isinstance(block[10][0], list)
    ):
        insights["history_points"] = len(block[10][0])
    return insights or None


def _parse_single_itinerary(
    item: Any,
    *,
    is_best: bool,
    origin_iata: str,
    dest_iata: str,
    depart_date: date,
    currency: str,
    deep_link: str,
    price_insights: dict[str, Any] | None,
) -> ParsedGoogleItinerary | None:
    if not isinstance(item, list) or len(item) < 2 or not isinstance(item[0], list):
        return None

    flight = item[0]
    price_block = item[1]
    if (
        not isinstance(price_block, list)
        or not price_block
        or not isinstance(price_block[0], list)
    ):
        return None
    price_cents = _extract_wrapped_price_cents(price_block[0])
    if price_cents is None:
        return None

    legs = flight[2] if len(flight) > 2 and isinstance(flight[2], list) else []
    if not legs:
        return None

    first_leg = legs[0]
    last_leg = legs[-1]
    if not isinstance(first_leg, list) or not isinstance(last_leg, list):
        return None

    dep_dt = _parse_google_datetime(
        first_leg[20] if len(first_leg) > 20 else None,
        first_leg[8] if len(first_leg) > 8 else None,
    )
    arr_dt = _parse_google_datetime(
        last_leg[21] if len(last_leg) > 21 else None,
        last_leg[10] if len(last_leg) > 10 else None,
    )

    c_info = first_leg[22] if len(first_leg) > 22 else None
    carrier_code: str | None = None
    flight_number: str | None = None
    if isinstance(c_info, list) and len(c_info) >= 2 and c_info[0] and c_info[1]:
        carrier_code = str(c_info[0]).strip().upper()
        num_part = str(c_info[1]).strip().upper()
        flight_number = (
            num_part
            if num_part.startswith(carrier_code)
            else f"{carrier_code}{num_part}"
        )
    elif len(flight) > 0 and isinstance(flight[0], str) and len(flight[0].strip()) == 2:
        carrier_code = flight[0].strip().upper()

    carrier = ""
    if len(flight) > 1 and isinstance(flight[1], list):
        names = [str(x).strip() for x in flight[1] if isinstance(x, str) and x.strip()]
        carrier = ", ".join(names)
    if (
        not carrier
        and isinstance(c_info, list)
        and len(c_info) > 3
        and isinstance(c_info[3], str)
    ):
        carrier = c_info[3].strip()
    if not carrier:
        carrier = carrier_code or "Airline"

    stops = max(len(legs) - 1, 0)
    duration_mins: int | None = None
    if (
        len(flight) > 9
        and isinstance(flight[9], int)
        and not isinstance(flight[9], bool)
        and flight[9] > 0
    ):
        duration_mins = flight[9]
    else:
        leg_durs = [
            lg[11]
            for lg in legs
            if isinstance(lg, list)
            and len(lg) > 11
            and isinstance(lg[11], int)
            and not isinstance(lg[11], bool)
            and lg[11] > 0
        ]
        if leg_durs:
            duration_mins = sum(leg_durs)

    leg_origin = (
        str(first_leg[3]).strip().upper()
        if len(first_leg) > 3 and isinstance(first_leg[3], str) and first_leg[3].strip()
        else origin_iata.upper()
    )
    leg_dest = (
        str(last_leg[6]).strip().upper()
        if len(last_leg) > 6 and isinstance(last_leg[6], str) and last_leg[6].strip()
        else dest_iata.upper()
    )

    return ParsedGoogleItinerary(
        origin_iata=leg_origin,
        destination_iata=leg_dest,
        depart_date=dep_dt.date() if dep_dt else depart_date,
        depart_time=dep_dt,
        arrival_time=arr_dt,
        price_cents=price_cents,
        currency=currency.upper(),
        carrier=carrier,
        carrier_code=carrier_code,
        flight_number=flight_number,
        stops=stops,
        duration_mins=duration_mins,
        is_best=is_best,
        deep_link=deep_link,
        price_insights=price_insights,
    )


def parse_google_flights_html(
    html: str,
    *,
    origin_iata: str,
    dest_iata: str,
    depart_date: date,
    currency: str,
    deep_link: str,
) -> list[ParsedGoogleItinerary]:
    """
    Defensively parses Google Flights `script.ds:1` payload (Best + Other itineraries).
    Raises ProviderBlockedError on consent/anti-bot pages and ParseDriftError on unexpected HTML.
    """
    parser = LexborHTMLParser(html)
    script = parser.css_first(r"script.ds\:1")
    if script is None:
        lower_html = html.lower()
        has_consent_host = any(
            (
                urllib.parse.urlparse(
                    el.attributes.get("href") or el.attributes.get("action") or ""
                ).hostname
                or ""
            ).lower()
            == "consent.google.com"
            for el in parser.css("base[href], a[href], form[action]")
        )
        if has_consent_host or "consentui" in lower_html:
            raise ProviderBlockedError(
                "Google Flights redirected to consent wall (check MARKET_GOOGLE_FLIGHTS_SOCS_COOKIE)"
            )
        if (
            "/sorry/" in lower_html
            or "g-recaptcha" in lower_html
            or "unusual traffic" in lower_html
        ):
            raise ProviderBlockedError(
                "Google Flights rate-limit / anti-bot challenge detected"
            )
        raise ParseDriftError("Google Flights response missing script.ds:1 payload")

    raw = script.text() or ""
    if "errorHasStatus: true" in raw:
        if "ErrorResponse" in raw and depart_date >= date.today():
            raise _TransientGoogleError(
                "Google Flights returned transient ErrorResponse"
            )
        return []

    marker_idx = raw.find("data:")
    if marker_idx == -1:
        raise ParseDriftError("Google Flights ds:1 script missing data: payload")

    idx = marker_idx + 5
    while idx < len(raw) and raw[idx].isspace():
        idx += 1

    try:
        payload, _ = json.JSONDecoder().raw_decode(raw, idx)
    except json.JSONDecodeError as exc:
        raise ParseDriftError(
            f"Google Flights ds:1 invalid JSON payload: {exc}"
        ) from exc

    if not isinstance(payload, list):
        raise ParseDriftError(
            f"Google Flights ds:1 unexpected payload root type: {type(payload).__name__}"
        )
    if not payload:
        return []

    price_insights = _extract_price_insights(payload)
    best_items = _extract_group(payload, 2)
    other_items = _extract_group(payload, 3)

    deduped: dict[tuple[str, str, int, int], ParsedGoogleItinerary] = {}
    for is_best, item in [
        *((True, it) for it in best_items),
        *((False, it) for it in other_items),
    ]:
        parsed = _parse_single_itinerary(
            item,
            is_best=is_best,
            origin_iata=origin_iata,
            dest_iata=dest_iata,
            depart_date=depart_date,
            currency=currency,
            deep_link=deep_link,
            price_insights=price_insights,
        )
        if parsed is None:
            continue

        key = (
            parsed.flight_number or parsed.carrier,
            parsed.depart_time.isoformat() if parsed.depart_time else "",
            parsed.price_cents,
            parsed.stops,
        )
        existing = deduped.get(key)
        if existing is None or (parsed.is_best and not existing.is_best):
            deduped[key] = parsed

    results = list(deduped.values())
    results.sort(key=lambda it: (it.price_cents, it.stops, not it.is_best))
    return results


def _select_range_dates(start: date, end: date, max_days: int) -> list[date]:
    total = (end - start).days + 1
    if total <= 0 or max_days <= 0:
        return []
    if total <= max_days:
        return [start + timedelta(days=i) for i in range(total)]
    if max_days == 1:
        return [start]
    indices = [round(i * (total - 1) / (max_days - 1)) for i in range(max_days)]
    return [start + timedelta(days=idx) for idx in dict.fromkeys(indices)]


def _select_month_sample_dates(
    month: date, max_samples: int, today: date | None = None
) -> list[date]:
    ref_today = today or date.today()
    days_in_month = calendar.monthrange(month.year, month.month)[1]
    first_day = max(date(month.year, month.month, 1), ref_today)
    last_day = date(month.year, month.month, days_in_month)
    if first_day > last_day:
        return []
    return _select_range_dates(first_day, last_day, max_samples)


def _normalize_flight_num(val: str | None) -> str:
    return (val or "").replace(" ", "").replace("-", "").strip().upper()


def _carrier_matches(
    itinerary: ParsedGoogleItinerary, quote_carrier: str | None
) -> bool:
    qc = (quote_carrier or "").strip()
    if qc.lower() in _GENERIC_CARRIERS:
        return False
    if itinerary.carrier_code and itinerary.carrier_code.upper() == qc.upper():
        return True
    return qc.lower() in itinerary.carrier.lower()


def _match_itinerary(
    itineraries: list[ParsedGoogleItinerary], quote: FlightQuote
) -> tuple[ParsedGoogleItinerary, str]:
    target_fn = _normalize_flight_num(quote.flight_number)
    if target_fn:
        for it in itineraries:
            if _normalize_flight_num(it.flight_number) == target_fn:
                return it, "exact_flight_number"

    if quote.depart_time is not None:
        q_dep = quote.depart_time.replace(tzinfo=None)
        for it in itineraries:
            if (
                it.depart_time is not None
                and _carrier_matches(it, quote.carrier)
                and abs((it.depart_time.replace(tzinfo=None) - q_dep).total_seconds())
                < 7200
            ):
                return it, "carrier_and_time"

    for it in itineraries:
        if _carrier_matches(it, quote.carrier):
            return it, "carrier"

    return itineraries[0], "exact_date_cheapest"


class GoogleFlightsProvider(BaseQuoteProvider):
    """
    Sovereign Flight Provider querying Google Flights via fast-flights Protobuf ?tfs=
    encoding and primp async Chrome TLS impersonation.
    """

    BASE_URL = "https://www.google.com/travel/flights/search"

    def __init__(
        self,
        timeout_sec: float = 18.0,
        max_rpm: int | None = None,
    ):
        super().__init__(name="google_flights", asset_type="flight", cloud=False)
        self.timeout_sec = timeout_sec
        rpm = max_rpm or config.GOOGLE_FLIGHTS_MAX_RPM
        self._rate_limiter = TokenBucketRateLimiter(max_rpm=max(1, rpm))
        self._semaphore = asyncio.Semaphore(2)
        self._budget_lock = asyncio.Lock()
        self._local_daily_counts: dict[str, int] = {}

    async def is_healthy(self) -> bool:
        return bool(config.ENABLE_GOOGLE_FLIGHTS)

    def _build_query(
        self,
        origin_iata: str,
        dest_iata: str,
        depart_date: date,
        *,
        return_date: date | None = None,
        currency: str = "EUR",
        adults: int = 1,
        max_stops: int | None = None,
    ) -> tuple[Any, str, str]:
        orig = origin_iata.strip().upper()
        dest = dest_iata.strip().upper()
        curr = (currency or "EUR").strip().upper()

        try:
            classification = route_classifier.classify_corridor(orig, dest)
            gl = (classification.origin_country or "US").upper()
        except UnknownAirportError:
            gl = "US"

        flight_queries = [
            FlightQuery(
                date=depart_date.isoformat(),
                from_airport=orig,
                to_airport=dest,
            )
        ]
        trip_type = "one-way"
        if return_date is not None:
            flight_queries.append(
                FlightQuery(
                    date=return_date.isoformat(),
                    from_airport=dest,
                    to_airport=orig,
                )
            )
            trip_type = "round-trip"

        query = create_query(
            flights=flight_queries,
            seat="economy",
            trip=trip_type,  # type: ignore[arg-type]
            passengers=Passengers(adults=max(1, adults)),
            language="en-US",
            currency=curr,
            max_stops=max_stops,
        )
        deep_link = f"{query.url()}&gl={gl}"
        return query, gl, deep_link

    def _cache_key(
        self,
        origin: str,
        dest: str,
        depart_date: date,
        return_date: date | None,
        currency: str,
        gl: str,
        adults: int,
        max_stops: int | None,
    ) -> str:
        ret_key = return_date.isoformat() if return_date else "ow"
        stops_key = str(max_stops) if max_stops is not None else "any"
        return (
            f"market:google_flights:v1:{origin.upper()}:{dest.upper()}:"
            f"{depart_date.isoformat()}:{ret_key}:{currency.upper()}:{gl.upper()}:"
            f"{adults}:{stops_key}"
        )

    async def _get_cached_itineraries(
        self, key: str
    ) -> list[ParsedGoogleItinerary] | None:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            cached = await redis.get(key)
            if cached:
                items = json.loads(cached)
                return [ParsedGoogleItinerary.from_dict(it) for it in items]
        except Exception as exc:
            logger.debug(f"[GoogleFlights] Redis cache read bypassed: {exc}")
        return None

    async def _set_cached_itineraries(
        self,
        key: str,
        itineraries: list[ParsedGoogleItinerary],
        ttl_sec: int,
    ) -> None:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            payload = [it.to_dict() for it in itineraries]
            await redis.set(key, json.dumps(payload), ex=ttl_sec)
        except Exception as exc:
            logger.debug(f"[GoogleFlights] Redis cache write bypassed: {exc}")

    async def _consume_daily_budget(self) -> None:
        limit = config.GOOGLE_FLIGHTS_DAILY_BUDGET
        if limit <= 0:
            raise DailyBudgetExhaustedError(
                "Google Flights daily budget is configured as 0"
            )
        today_str = datetime.now(timezone.utc).date().isoformat()
        budget_key = f"market:google_flights:daily_budget:{today_str}"

        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            current_raw = await redis.get(budget_key)
            if current_raw is not None and int(current_raw) >= limit:
                raise DailyBudgetExhaustedError(
                    f"Google Flights daily request budget ({limit}) exhausted"
                )
            new_count = await redis.incr(budget_key)
            if new_count == 1:
                await redis.expire(budget_key, 172800)
            if new_count > limit:
                raise DailyBudgetExhaustedError(
                    f"Google Flights daily request budget ({limit}) exhausted"
                )
            return
        except DailyBudgetExhaustedError:
            raise
        except Exception as exc:
            logger.debug(f"[GoogleFlights] Redis daily budget fallback to local: {exc}")

        async with self._budget_lock:
            count = self._local_daily_counts.get(today_str, 0)
            if count >= limit:
                raise DailyBudgetExhaustedError(
                    f"Google Flights daily request budget ({limit}) exhausted"
                )
            self._local_daily_counts[today_str] = count + 1

    def _create_async_client(self) -> primp.AsyncClient:
        proxy = flight_browser_pool.get_next_proxy()
        return primp.AsyncClient(
            impersonate="chrome_145",
            impersonate_os="macos",
            referer=True,
            cookie_store=True,
            timeout=self.timeout_sec,
            headers={"Cookie": f"SOCS={config.GOOGLE_FLIGHTS_SOCS_COOKIE}"},
            proxy=proxy,
        )

    async def _fetch_and_parse(
        self,
        *,
        client: primp.AsyncClient,
        params: dict[str, str],
        origin_iata: str,
        dest_iata: str,
        depart_date: date,
        currency: str,
        deep_link: str,
    ) -> list[ParsedGoogleItinerary]:
        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            await self._consume_daily_budget()
            await self._rate_limiter.acquire()
            async with self._semaphore:
                await flight_browser_pool.throttle(150, 400)
                try:
                    res = await client.get(self.BASE_URL, params=params)
                except Exception as exc:
                    if attempt < max_attempts:
                        logger.debug(
                            f"[GoogleFlights] Network error for {origin_iata}->{dest_iata} (attempt {attempt}): {exc}"
                        )
                        await asyncio.sleep(0.6)
                        continue
                    raise ProviderBlockedError(
                        f"Google Flights request failed after {max_attempts} attempts: {exc}"
                    ) from exc

            if res.status_code in (403, 429):
                raise ProviderBlockedError(
                    f"Google Flights returned HTTP {res.status_code}"
                )
            if res.status_code >= 500:
                if attempt < max_attempts:
                    await asyncio.sleep(0.8)
                    continue
                raise ProviderBlockedError(
                    f"Google Flights returned HTTP {res.status_code}"
                )
            if res.status_code != 200:
                raise ParseDriftError(
                    f"Google Flights unexpected HTTP status {res.status_code}"
                )

            try:
                return parse_google_flights_html(
                    res.text,
                    origin_iata=origin_iata,
                    dest_iata=dest_iata,
                    depart_date=depart_date,
                    currency=currency,
                    deep_link=deep_link,
                )
            except _TransientGoogleError:
                if attempt < max_attempts:
                    await asyncio.sleep(0.6)
                    continue
                logger.warning(
                    f"[GoogleFlights] Persistent ErrorResponse for {origin_iata}->{dest_iata} on {depart_date}"
                )
                return []

        return []

    async def search_date(
        self,
        origin_iata: str,
        dest_iata: str,
        depart_date: date,
        *,
        return_date: date | None = None,
        currency: str = "EUR",
        adults: int = 1,
        max_stops: int | None = None,
        cache_ttl_sec: int | None = None,
        bypass_cache: bool = False,
        client: primp.AsyncClient | None = None,
    ) -> list[ParsedGoogleItinerary]:
        if not config.ENABLE_GOOGLE_FLIGHTS:
            return []

        orig = origin_iata.strip().upper()
        dest = dest_iata.strip().upper()
        curr = (currency or "EUR").strip().upper()
        query, gl, deep_link = self._build_query(
            orig,
            dest,
            depart_date,
            return_date=return_date,
            currency=curr,
            adults=adults,
            max_stops=max_stops,
        )
        cache_key = self._cache_key(
            orig, dest, depart_date, return_date, curr, gl, adults, max_stops
        )

        if not bypass_cache:
            cached = await self._get_cached_itineraries(cache_key)
            if cached is not None:
                return cached

        params = {**query.params(), "gl": gl}
        if client is not None:
            itineraries = await self._fetch_and_parse(
                client=client,
                params=params,
                origin_iata=orig,
                dest_iata=dest,
                depart_date=depart_date,
                currency=curr,
                deep_link=deep_link,
            )
        else:
            async with self._create_async_client() as local_client:
                itineraries = await self._fetch_and_parse(
                    client=local_client,
                    params=params,
                    origin_iata=orig,
                    dest_iata=dest,
                    depart_date=depart_date,
                    currency=curr,
                    deep_link=deep_link,
                )

        if itineraries:
            ttl = cache_ttl_sec or config.GOOGLE_FLIGHTS_CACHE_TTL_SEC
            await self._set_cached_itineraries(cache_key, itineraries, ttl_sec=ttl)

        return itineraries

    def _to_flight_quote(self, it: ParsedGoogleItinerary, now: datetime) -> FlightQuote:
        return FlightQuote(
            origin_iata=it.origin_iata,
            destination_iata=it.destination_iata,
            destination_city_id=it.destination_iata,
            depart_date=it.depart_date,
            depart_time=it.depart_time,
            arrival_time=it.arrival_time,
            base_price_cents=it.price_cents,
            currency=it.currency,
            carrier=it.carrier_code or it.carrier,
            flight_number=it.flight_number,
            stops=it.stops,
            deep_link=it.deep_link,
            source="google_flights",
            source_class="live",
            observed_at=now,
            found_at=now,
            fetched_at=now,
            is_live=True,
            confidence="high",
            ancillaries_excluded=True,
        )

    async def fetch_cached_flights(
        self,
        origin_iata: str,
        dest_iata: str,
        date_from: date,
        date_to: date,
        session: Any = None,
    ) -> list[FlightQuote]:
        if not config.ENABLE_GOOGLE_FLIGHTS:
            return []

        start = max(date_from, date.today())
        if start > date_to:
            return []

        target_dates = _select_range_dates(
            start, date_to, config.GOOGLE_FLIGHTS_MAX_RANGE_DAYS
        )
        if not target_dates:
            return []

        quotes: list[FlightQuote] = []
        now = datetime.now(timezone.utc)
        async with self._create_async_client() as client:
            for d in target_dates:
                itineraries = await self.search_date(
                    origin_iata,
                    dest_iata,
                    d,
                    currency="EUR",
                    client=client,
                )
                for it in itineraries[:5]:
                    quotes.append(self._to_flight_quote(it, now))
        return quotes

    async def fetch_month(
        self, origin: str, dest: str, month: date, trip_type: str = "one_way"
    ) -> list[FareObservation]:
        """
        Budgeted sparse-sampling fallback for FareProvider when bulk month sources
        (Ryanair / Aviasales) return no observations for a corridor.
        """
        if not config.ENABLE_GOOGLE_FLIGHTS:
            return []

        sample_dates = _select_month_sample_dates(
            month, config.GOOGLE_FLIGHTS_MONTH_SAMPLE_DAYS
        )
        if not sample_dates:
            return []

        orig = origin.strip().upper()
        dst = dest.strip().upper()
        try:
            market = (
                route_classifier.classify_corridor(orig, dst).origin_country or "es"
            ).lower()
        except UnknownAirportError:
            market = "es"

        now = datetime.now(timezone.utc)
        observations: list[FareObservation] = []
        async with self._create_async_client() as client:
            for d in sample_dates:
                try:
                    itineraries = await self.search_date(
                        orig,
                        dst,
                        d,
                        currency="EUR",
                        cache_ttl_sec=config.GOOGLE_FLIGHTS_SWEEP_CACHE_TTL_SEC,
                        client=client,
                    )
                except (DailyBudgetExhaustedError, ProviderBlockedError):
                    raise
                except Exception as exc:
                    logger.warning(
                        f"[GoogleFlights] Sample step failed for {orig}->{dst} on {d}: {exc}"
                    )
                    continue

                if not itineraries:
                    continue

                cheapest = itineraries[0]
                observations.append(
                    FareObservation(
                        origin=orig,
                        destination=dst,
                        depart_date=cheapest.depart_date,
                        depart_time=cheapest.depart_time,
                        arrival_time=cheapest.arrival_time,
                        return_date=None,
                        trip_type=trip_type,
                        price_cents=cheapest.price_cents,
                        currency=cheapest.currency,
                        carrier=cheapest.carrier_code or cheapest.carrier,
                        flight_number=cheapest.flight_number,
                        stops=cheapest.stops,
                        deep_link=cheapest.deep_link,
                        source="google_flights",
                        source_class="live",
                        market=market,
                        found_at=now,
                        fetched_at=now,
                        flags={
                            "is_best": cheapest.is_best,
                            "duration_mins": cheapest.duration_mins,
                            "price_insights": cheapest.price_insights,
                        },
                    )
                )

        return observations

    async def fetch_month_cheapest_per_day(
        self, origin_iata: str, dest_iata: str, month_start: date, session: Any = None
    ) -> list[FlightQuote]:
        observations = await self.fetch_month(
            origin=origin_iata,
            dest=dest_iata,
            month=month_start,
            trip_type="one_way",
        )
        quotes: list[FlightQuote] = []
        for obs in observations:
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
                    carrier=obs.carrier or "Airline",
                    flight_number=obs.flight_number,
                    stops=obs.stops or 0,
                    deep_link=obs.deep_link,
                    source="google_flights",
                    source_class="live",
                    observed_at=obs.fetched_at,
                    found_at=obs.found_at,
                    fetched_at=obs.fetched_at,
                    is_live=True,
                    confidence="high",
                    ancillaries_excluded=True,
                )
            )
        return quotes

    async def fetch_calendar_horizon(
        self,
        origin_iata: str,
        dest_iata: str,
        months_ahead: int = 11,
        session: Any = None,
    ) -> list[FlightQuote]:
        now = datetime.now(timezone.utc)
        all_quotes: list[FlightQuote] = []
        for i in range(months_ahead):
            y = now.year + (now.month - 1 + i) // 12
            m = (now.month - 1 + i) % 12 + 1
            try:
                quotes = await self.fetch_month_cheapest_per_day(
                    origin_iata, dest_iata, date(y, m, 1), session=session
                )
                all_quotes.extend(quotes)
            except (DailyBudgetExhaustedError, ProviderBlockedError) as exc:
                logger.warning(
                    f"[GoogleFlights] Stopping horizon sweep for {origin_iata}->{dest_iata}: {exc}"
                )
                break
            except Exception as exc:
                logger.debug(
                    f"[GoogleFlights] Horizon step {origin_iata}->{dest_iata} ({y}-{m:02d}) failed: {exc}"
                )
        return all_quotes

    async def verify_flight(
        self, quote: FlightQuote, session: Any = None
    ) -> tuple[bool, int, dict[str, Any]]:
        """Live verification check on exact departure date with strict tolerance."""
        if not config.ENABLE_GOOGLE_FLIGHTS:
            return False, 0, {"reason": "Google Flights provider disabled"}

        dep_date = quote.depart_time.date() if quote.depart_time else quote.depart_date
        if not dep_date:
            return False, 0, {"reason": "Missing departure date on quote"}

        itineraries = await self.search_date(
            quote.origin_iata,
            quote.destination_iata,
            dep_date,
            currency=quote.currency or "EUR",
            bypass_cache=True,
        )
        if not itineraries:
            return (
                False,
                0,
                {
                    "reason": "Flight not found on Google Flights live re-check",
                    "source": "google_flights",
                },
            )

        matched, match_type = _match_itinerary(itineraries, quote)
        max_acceptable = quote.base_price_cents * (1.0 + config.VERIFY_TOLERANCE)
        is_within_tolerance = (
            quote.base_price_cents > 0 and matched.price_cents <= max_acceptable
        )

        details: dict[str, Any] = {
            "verified_base_cents": matched.price_cents,
            "carrier": matched.carrier,
            "carrier_code": matched.carrier_code,
            "flight_number": matched.flight_number,
            "depart_time": matched.depart_time.isoformat()
            if matched.depart_time
            else None,
            "arrival_time": matched.arrival_time.isoformat()
            if matched.arrival_time
            else None,
            "stops": matched.stops,
            "duration_mins": matched.duration_mins,
            "deep_link": matched.deep_link,
            "source": "google_flights",
            "match_type": match_type,
            "ancillaries_excluded": True,
        }
        if not is_within_tolerance:
            details["reason"] = (
                f"Live price {matched.price_cents} exceeds tolerance over observed {quote.base_price_cents}"
            )
        return is_within_tolerance, matched.price_cents, details

    async def verify_round_trip(
        self,
        origin_iata: str,
        dest_iata: str,
        dep_date: date,
        ret_date: date,
        observed_total_cents: int,
        currency: str = "EUR",
    ) -> tuple[bool, int, dict[str, Any]]:
        """Verifies true round-trip Google Flights fare when paired one-way legs diverge."""
        if not config.ENABLE_GOOGLE_FLIGHTS:
            return False, 0, {"reason": "Google Flights provider disabled"}

        itineraries = await self.search_date(
            origin_iata,
            dest_iata,
            dep_date,
            return_date=ret_date,
            currency=currency or "EUR",
            bypass_cache=True,
        )
        if not itineraries:
            return (
                False,
                0,
                {
                    "reason": "Round-trip itinerary not found on Google Flights",
                    "source": "google_flights",
                },
            )

        cheapest = itineraries[0]
        max_acceptable = observed_total_cents * (1.0 + config.VERIFY_TOLERANCE)
        is_ok = observed_total_cents > 0 and cheapest.price_cents <= max_acceptable
        return (
            is_ok,
            cheapest.price_cents,
            {
                "verified_base_cents": cheapest.price_cents,
                "carrier": cheapest.carrier,
                "carrier_code": cheapest.carrier_code,
                "flight_number": cheapest.flight_number,
                "stops": cheapest.stops,
                "deep_link": cheapest.deep_link,
                "source": "google_flights",
                "match_type": "round_trip_cheapest",
                "ancillaries_excluded": True,
            },
        )
