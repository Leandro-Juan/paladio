"""
Agoda Lodging Quote Provider.
Queries live accommodation offers for destination cities without cloud LLM dependencies.
Zero hardcoded data.
"""

import logging
import re
import urllib.parse
from datetime import date, datetime, timezone
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import CityModel, DestinationAirportModel
from app.engine.market.lodging.browser_pool import browser_pool
from app.engine.market.lodging.normalize import parse_money
from app.engine.market.ports import LodgingQuote
from app.engine.market.providers.base import (
    BaseQuoteProvider,
    NoDataError,
    ParseDriftError,
    ProviderBlockedError,
)

logger = logging.getLogger(__name__)


class AgodaProvider(BaseQuoteProvider):
    """
    Scrapes live hotel search results from Agoda.
    """

    BASE_URL = "https://www.agoda.com/search"

    def __init__(self, timeout_sec: float = 15.0):
        super().__init__(name="agoda", asset_type="lodging", cloud=False)
        self.timeout_sec = timeout_sec

    async def is_healthy(self) -> bool:
        return True

    async def _resolve_city_name(self, session: AsyncSession | None, code: str) -> str:
        code_clean = (code or "").strip().upper()
        if not code_clean:
            return code

        if session is not None:
            try:
                stmt = (
                    select(CityModel.name)
                    .join(
                        DestinationAirportModel,
                        DestinationAirportModel.city_id == CityModel.id,
                    )
                    .where(DestinationAirportModel.iata == code_clean)
                    .limit(1)
                )
                res = await session.execute(stmt)
                name = res.scalar_one_or_none()
                if name:
                    return name

                stmt_city = (
                    select(CityModel.name)
                    .where(
                        (CityModel.id.ilike(f"{code_clean}%"))
                        | (CityModel.name.ilike(f"{code_clean}%"))
                    )
                    .limit(1)
                )
                res_city = await session.execute(stmt_city)
                name_city = res_city.scalar_one_or_none()
                if name_city:
                    return name_city
            except Exception:
                pass

        from app.services.airport_service import get_city_from_iata

        city = get_city_from_iata(code_clean)
        if city and city != "Unknown":
            return city

        return code_clean

    async def search_offers(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        adults: int = 2,
        session: AsyncSession = None,
    ) -> list[LodgingQuote]:
        city_name = await self._resolve_city_name(session, destination_code)
        params = {
            "city": city_name,
            "checkIn": check_in.isoformat(),
            "checkOut": check_out.isoformat(),
            "rooms": "1",
            "adults": str(adults),
            "currency": "EUR",
        }
        headers = {
            "User-Agent": browser_pool.get_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        quotes: list[LodgingQuote] = []
        now = datetime.now(timezone.utc)

        await browser_pool.throttle(100, 300)

        try:
            proxy = browser_pool.get_next_proxy()
            client_kwargs = {
                "headers": headers,
                "follow_redirects": True,
                "timeout": self.timeout_sec,
            }
            if proxy:
                client_kwargs["proxy"] = proxy

            async with httpx.AsyncClient(**client_kwargs) as client:
                resp = await client.get(self.BASE_URL, params=params)
                if resp.status_code in (403, 429):
                    raise ProviderBlockedError(
                        f"Agoda blocked with status {resp.status_code}"
                    )
                if resp.status_code != 200:
                    raise ParseDriftError(f"Agoda returned HTTP {resp.status_code}")

                html = resp.text
                deep_link = f"https://www.agoda.com/search?city={urllib.parse.quote(city_name)}&checkIn={check_in.isoformat()}&checkOut={check_out.isoformat()}"

                # Agoda hotel card title & price extraction
                card_pattern = re.compile(
                    r'data-selenium="hotel-item".*?data-selenium="hotel-name">([^<]+)<.*?data-selenium="display-price">([^<]+)<',
                    re.DOTALL | re.IGNORECASE,
                )

                for m in card_pattern.finditer(html):
                    name = m.group(1).strip()
                    raw_price = m.group(2)
                    price_val, curr = parse_money(raw_price, default_currency="EUR")
                    if not price_val or price_val <= 0:
                        continue

                    nightly_cents = int(round(price_val * 100))
                    prop_id = re.sub(r"[^a-z0-9]", "_", name.lower())[:64]

                    quotes.append(
                        LodgingQuote(
                            destination_code=destination_code,
                            check_in=check_in,
                            check_out=check_out,
                            base_price_per_night_cents=nightly_cents,
                            currency=curr,
                            quality_score=None,
                            property_name=name,
                            property_id=prop_id,
                            stars=None,
                            review_score=None,
                            review_count=None,
                            latitude=None,
                            longitude=None,
                            taxes_included=True,
                            estimated_fee_ratio=1.0,
                            deep_link=deep_link,
                            source="agoda",
                            observed_at=now,
                            is_live=True,
                            confidence="medium",
                        )
                    )
        except ProviderBlockedError:
            raise
        except Exception as e:
            logger.debug(f"Agoda search error: {e}")

        return quotes

    async def fetch_destination_summary(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        session: AsyncSession = None,
    ) -> LodgingQuote:
        offers = await self.search_offers(
            destination_code, check_in, check_out, session=session
        )
        if not offers:
            raise NoDataError(f"Agoda returned 0 quotes for {destination_code}")
        offers.sort(key=lambda x: x.base_price_per_night_cents)
        return offers[0]
