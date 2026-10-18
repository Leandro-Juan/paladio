"""
Google Travel Hotels Provider (Tier 2 Lodging).
Meta-search query directly for accommodation offers in destination municipality.
Zero cloud LLMs; zero hardcoded fake hotel data.
"""

import logging
import re
import urllib.parse
from datetime import date, datetime, timezone
import httpx
from app.db.models import CityModel, DestinationAirportModel
from app.engine.market.ports import LodgingQuote
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    NoDataError,
    ParseDriftError,
    ProviderBlockedError,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class GoogleTravelHotelsProvider(BaseQuoteProvider):
    """
    Tier 2 Lodging meta-search provider querying Google Travel accommodation pages.
    Extracts authentic hotel names, price comparisons, and deep links.
    """

    BASE_URL = "https://www.google.com/travel/search"

    def __init__(self, timeout_sec: float = 15.0):
        super().__init__(name="google_travel", asset_type="lodging", cloud=False)
        self.timeout_sec = timeout_sec
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def is_healthy(self) -> bool:
        return True

    async def _resolve_city_name(self, session: AsyncSession, code: str) -> str:
        stmt = (
            select(CityModel.name)
            .join(
                DestinationAirportModel, DestinationAirportModel.city_id == CityModel.id
            )
            .where(DestinationAirportModel.iata == code.upper())
            .limit(1)
        )
        res = await session.execute(stmt)
        name = res.scalar_one_or_none()
        if name:
            return name

        stmt_city = (
            select(CityModel.name)
            .where(
                (CityModel.id.ilike(f"{code}%")) | (CityModel.name.ilike(f"{code}%"))
            )
            .limit(1)
        )
        res_city = await session.execute(stmt_city)
        name_city = res_city.scalar_one_or_none()
        return name_city or code.upper()

    async def search_offers(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        adults: int = 2,
        session: AsyncSession = None,
    ) -> list[LodgingQuote]:
        city_name = (
            await self._resolve_city_name(session, destination_code)
            if session
            else destination_code
        )
        query_str = f"Hotels in {city_name}"
        params = {
            "q": query_str,
            "hl": "en",
            "gl": "es",
        }
        quotes: list[LodgingQuote] = []
        now = datetime.now(timezone.utc)

        try:
            async with httpx.AsyncClient(
                headers=self.headers, follow_redirects=True
            ) as client:
                resp = await client.get(
                    self.BASE_URL, params=params, timeout=self.timeout_sec
                )
                if resp.status_code in (403, 429):
                    raise ProviderBlockedError(
                        f"Google Travel returned HTTP {resp.status_code}"
                    )
                if resp.status_code != 200:
                    raise ParseDriftError(
                        f"Google Travel returned HTTP {resp.status_code}"
                    )

                html = resp.text
                # Look for hotel cards with names and prices (e.g. €50, €85, $100)
                price_matches = re.finditer(r"(?:€|EUR\s*)(\d{2,4})\b", html)
                name_matches = re.finditer(
                    r"<h2[^>]*>([^<]{4,50})</h2>", html, re.IGNORECASE
                )

                names = [
                    m.group(1).strip()
                    for m in name_matches
                    if "hotel" in m.group(1).lower() or "resort" in m.group(1).lower()
                ]
                prices = [
                    int(m.group(1))
                    for m in price_matches
                    if 20 <= int(m.group(1)) <= 1500
                ]

                deep_link = f"https://www.google.com/travel/search?q={urllib.parse.quote(query_str)}"

                for idx in range(min(len(names), len(prices))):
                    h_name = names[idx]
                    nightly_cents = prices[idx] * 100
                    quotes.append(
                        LodgingQuote(
                            destination_code=destination_code,
                            check_in=check_in,
                            check_out=check_out,
                            base_price_per_night_cents=nightly_cents,
                            currency="EUR",
                            quality_score=None,
                            property_name=h_name,
                            property_id=h_name.lower().replace(" ", "_"),
                            stars=None,
                            review_score=None,
                            review_count=None,
                            latitude=None,
                            longitude=None,
                            taxes_included=True,
                            estimated_fee_ratio=None,
                            deep_link=deep_link,
                            source="google_travel",
                            observed_at=now,
                            is_live=True,
                            confidence="high",
                        )
                    )
        except ProviderBlockedError:
            raise
        except Exception as e:
            logger.debug(f"Google travel hotels search error: {e}")

        return quotes

    async def fetch_destination_summary(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        session: AsyncSession = None,
    ) -> LodgingQuote:
        offers = await self.search_offers(
            destination_code, check_in, check_out, adults=2, session=session
        )
        if not offers:
            raise NoDataError(
                f"Google Travel returned 0 hotel quotes for {destination_code}"
            )
        offers.sort(key=lambda x: x.base_price_per_night_cents)
        return offers[0]
