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

        self.cookies = {
            "SOCS": "CAESHAgBEhJnd3NfMjAyNDA5MjQtMF9SQzIaAmVuIAEaBgiA_L22Bg"
        }

    async def is_healthy(self) -> bool:
        return True

    async def _resolve_city_name(self, session: AsyncSession | None, code: str) -> str:
        if session is not None:
            try:
                stmt = (
                    select(CityModel.name)
                    .join(
                        DestinationAirportModel,
                        DestinationAirportModel.city_id == CityModel.id,
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
                        (CityModel.id.ilike(f"{code}%"))
                        | (CityModel.name.ilike(f"{code}%"))
                    )
                    .limit(1)
                )
                res_city = await session.execute(stmt_city)
                name_city = res_city.scalar_one_or_none()
                if name_city:
                    return name_city
            except Exception:
                pass

        try:
            import airportsdata

            airports = airportsdata.load("IATA")
            info = airports.get(code.upper())
            if info and info.get("city"):
                return info["city"]
        except Exception:
            pass

        return code.upper()

    async def search_offers(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        adults: int = 2,
        session: AsyncSession = None,
    ) -> list[LodgingQuote]:
        city_name = await self._resolve_city_name(session, destination_code)
        query_str = f"Hotels in {city_name}"
        params = {
            "q": query_str,
            "hl": "en",
            "gl": "es",
            "checkin": check_in.isoformat(),
            "checkout": check_out.isoformat(),
        }
        quotes: list[LodgingQuote] = []
        now = datetime.now(timezone.utc)
        nights = max((check_out - check_in).days, 1)

        try:
            async with httpx.AsyncClient(
                headers=self.headers, cookies=self.cookies, follow_redirects=True
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
                deep_link = f"https://www.google.com/travel/search?q={urllib.parse.quote(query_str)}&checkin={check_in.isoformat()}&checkout={check_out.isoformat()}"

                # Primary extraction: Google Travel hotel card structure
                card_pattern = re.compile(
                    r"<div class=\"[^\"]*AF5RIe\">([^<]+)</div>\s*<div class=\"[^\"]*\">€([0-9\.,]+)</div>(.*?)(?=<div class=\"[^\"]*AF5RIe\"|\Z)",
                    re.DOTALL,
                )

                for match in card_pattern.finditer(html):
                    h_name = (
                        match.group(1)
                        .strip()
                        .replace("&#39;", "'")
                        .replace("&amp;", "&")
                    )
                    raw_price = match.group(2).replace(",", "").replace(".", "")
                    try:
                        price_num = float(raw_price)
                        total_cents = int(round(price_num * 100))
                        # In Google Travel with dates, displayed price is total stay
                        nightly_cents = (
                            int(round(total_cents / nights))
                            if nights > 1
                            else total_cents
                        )
                    except (ValueError, TypeError):
                        continue

                    card_chunk = match.group(3)
                    rating_val = None
                    reviews_cnt = None
                    rev_m = re.search(
                        r"aria-label=\"([0-9\.]+)\s*out of 5 stars from ([0-9\.,]+) reviews\"",
                        card_chunk,
                    )
                    if rev_m:
                        try:
                            rating_val = float(rev_m.group(1).replace(",", "."))
                        except (ValueError, TypeError):
                            pass
                        try:
                            cleaned_cnt = re.sub(r"[^\d]", "", rev_m.group(2))
                            reviews_cnt = int(cleaned_cnt)
                        except (ValueError, TypeError):
                            pass

                    # Extract stars if present within this property's card
                    stars = None
                    star_match = re.search(r"(\d)-star hotel", card_chunk)
                    if star_match:
                        try:
                            stars = int(star_match.group(1))
                        except (ValueError, TypeError):
                            pass

                    quotes.append(
                        LodgingQuote(
                            destination_code=destination_code,
                            check_in=check_in,
                            check_out=check_out,
                            base_price_per_night_cents=nightly_cents,
                            currency="EUR",
                            quality_score=rating_val * 10.0 if rating_val else None,
                            property_name=h_name,
                            property_id=h_name.lower().replace(" ", "_")[:64],
                            stars=stars,
                            review_score=rating_val,
                            review_count=reviews_cnt,
                            latitude=None,
                            longitude=None,
                            taxes_included=True,
                            estimated_fee_ratio=1.0,
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
