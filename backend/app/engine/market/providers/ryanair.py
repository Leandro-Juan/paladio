"""
Ryanair public fare API provider.
Includes oneWayFares standard query and cheapestPerDay bulk month sweep for day-0 baselines.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any
import httpx
from app.engine.market.config import config
from app.engine.market.ports import FlightQuote
from app.engine.market.providers.base import BaseQuoteProvider, ProviderBlockedError

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
                    return []
                data = resp.json()
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
        except ProviderBlockedError:
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
        url = f"https://www.ryanair.com/api/farfnd/v4/oneWayFares/{origin_iata}/{dest_iata}/cheapestPerDay"
        params = {
            "outboundMonthOfDate": month_start.strftime("%Y-%m-01"),
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
                data = resp.json()
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
                    dep_dt = datetime.fromisoformat(f"{day_str}T10:00:00")
                    arr_dt = dep_dt + timedelta(hours=2, minutes=30)
                    price_cents = int(round(float(val) * 100))
                    quotes.append(
                        FlightQuote(
                            origin_iata=origin_iata,
                            destination_iata=dest_iata,
                            destination_city_id=dest_iata,
                            depart_time=dep_dt,
                            arrival_time=arr_dt,
                            base_price_cents=price_cents,
                            currency=curr,
                            carrier="Ryanair",
                            flight_number=None,
                            stops=0,
                            deep_link=f"https://www.ryanair.com/gb/en/trip/flights/select?originIata={origin_iata}&destinationIata={dest_iata}&dateOut={day_str}",
                            source="ryanair",
                            observed_at=datetime.now(timezone.utc),
                            is_live=True,
                            confidence="high",
                            ancillaries_excluded=True,
                        )
                    )
        except ProviderBlockedError:
            raise
        except Exception as e:
            logger.debug(
                f"CheapestPerDay endpoint failed for {origin_iata}->{dest_iata}: {e}"
            )
        return quotes

    async def verify_flight(
        self, quote: FlightQuote, session: Any = None
    ) -> tuple[bool, int, dict[str, Any]]:
        """Live verification check for exact departure date."""
        dep_date = quote.depart_time.date()
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
            if abs((q.depart_time - quote.depart_time).total_seconds()) < 7200
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
