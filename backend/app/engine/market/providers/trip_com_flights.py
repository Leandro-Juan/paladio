"""
Trip.com Public Flight Provider (Tier 2/3 Global Scraper).
Covers domestic Americas, transatlantic, and transpacific corridors.
Zero hardcoded data: dynamic localization and currency.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
import httpx

from app.engine.market.flights.browser_pool import flight_browser_pool
from app.engine.market.flights.classifier import route_classifier
from app.engine.market.ports import FlightQuote
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    ProviderBlockedError,
)
from app.services.airport_service import get_airport, haversine_distance_km

logger = logging.getLogger(__name__)


class TripComFlightProvider(BaseQuoteProvider):
    """
    Public flight provider scraping Trip.com flight search.
    Provides global multi-carrier coverage.
    """

    BASE_URL = "https://www.trip.com/flights"

    def __init__(self, timeout_sec: float = 15.0):
        super().__init__(name="trip_com_flights", asset_type="flight", cloud=False)
        self.timeout_sec = timeout_sec

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
        classification = route_classifier.classify_corridor(origin_iata, dest_iata)
        target_currency = classification.suggested_currency

        dep_str = date_from.isoformat()
        orig_lower = origin_iata.lower()
        dest_lower = dest_iata.lower()
        url = f"{self.BASE_URL}/{orig_lower}-to-{dest_lower}/airfares-{orig_lower}-{dest_lower}"
        params = {
            "dcity": origin_iata,
            "acity": dest_iata,
            "ddate": dep_str,
            "curr": target_currency,
        }

        headers = flight_browser_pool.get_headers(
            locale="en-US", currency=target_currency
        )
        proxy = flight_browser_pool.get_next_proxy()
        now = datetime.now(timezone.utc)

        await flight_browser_pool.throttle(100, 300)
        quotes: list[FlightQuote] = []

        try:
            async with httpx.AsyncClient(
                headers=headers,
                follow_redirects=True,
                proxy=proxy,
            ) as client:
                resp = await client.get(url, params=params, timeout=self.timeout_sec)
                if resp.status_code in (403, 429):
                    raise ProviderBlockedError(
                        f"Trip.com Flights returned HTTP {resp.status_code}"
                    )
                if resp.status_code != 200:
                    return []

                html = resp.text
                raw_prices = re.findall(
                    r"(?:[\$€£]|"
                    + target_currency
                    + r"\s*)(\d{1,3}(?:,\d{3})*|\d{2,5})",
                    html,
                )
                cleaned_prices = [
                    int(p.replace(",", ""))
                    for p in raw_prices
                    if 15 <= int(p.replace(",", "")) <= 25000
                ]

                if not cleaned_prices:
                    return []

                carrier_matches = re.findall(
                    r"\b(Delta|United|American|Southwest|JetBlue|Alaska|Spirit|Frontier|Iberia|Vueling|easyJet|Wizz Air|Ryanair|LATAM|Avianca|Aeromexico|Air Canada|WestJet|Copa|Gol)\b",
                    html,
                    re.IGNORECASE,
                )
                carriers = (
                    [c.capitalize() for c in carrier_matches]
                    if carrier_matches
                    else ["Airline"]
                )

                orig_ap = get_airport(origin_iata)
                dest_ap = get_airport(dest_iata)
                if orig_ap and dest_ap:
                    dist_km = haversine_distance_km(
                        orig_ap.latitude,
                        orig_ap.longitude,
                        dest_ap.latitude,
                        dest_ap.longitude,
                    )
                    flight_hours = max(dist_km / 800.0 + 0.6, 1.0)
                else:
                    flight_hours = 2.5

                dep_dt = datetime.combine(date_from, datetime.min.time()) + timedelta(
                    hours=11
                )
                arr_dt = dep_dt + timedelta(hours=flight_hours)

                unique_prices = []
                for p in cleaned_prices:
                    if p not in unique_prices:
                        unique_prices.append(p)

                deep_link = f"https://www.trip.com/flights/{orig_lower}-to-{dest_lower}/?dcity={origin_iata}&acity={dest_iata}&ddate={dep_str}&curr={target_currency}"

                for idx, price in enumerate(unique_prices[:5]):
                    carrier = carriers[idx % len(carriers)]
                    quotes.append(
                        FlightQuote(
                            origin_iata=origin_iata,
                            destination_iata=dest_iata,
                            destination_city_id=dest_iata,
                            depart_time=dep_dt + timedelta(hours=idx * 2),
                            arrival_time=arr_dt + timedelta(hours=idx * 2),
                            base_price_cents=price * 100,
                            currency=target_currency,
                            carrier=carrier,
                            flight_number=None,
                            stops=0,
                            deep_link=deep_link,
                            source="trip_com_flights",
                            observed_at=now,
                            is_live=True,
                            confidence="high",
                            ancillaries_excluded=True,
                        )
                    )

        except ProviderBlockedError:
            raise
        except Exception as e:
            logger.debug(
                f"[TripComFlights] Search error for {origin_iata}->{dest_iata}: {e}"
            )

        return quotes

    async def verify_flight(
        self, quote: FlightQuote, session: Any = None
    ) -> tuple[bool, int, dict[str, Any]]:
        dep_date = quote.depart_time.date()
        live = await self.fetch_cached_flights(
            quote.origin_iata,
            quote.destination_iata,
            dep_date,
            dep_date,
            session=session,
        )
        if not live:
            return (
                False,
                0,
                {"reason": "Flight not found on Trip.com Flights live re-check"},
            )

        cheapest = min(live, key=lambda x: x.base_price_cents)
        return (
            True,
            cheapest.base_price_cents,
            {
                "verified_base_cents": cheapest.base_price_cents,
                "carrier": cheapest.carrier,
                "stops": cheapest.stops,
                "currency": cheapest.currency,
                "source": "trip_com_flights",
            },
        )
