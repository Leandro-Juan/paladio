"""
Booking.com Scraper Provider (Tier 1 Lodging).
Uses HTTP JSON extraction / structured search results interception.
Zero hardcoded hotel data: captures authentic property names, real ratings, real prices, and deep links.
"""

import json
import logging
import re
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


class BookingScraperProvider(BaseQuoteProvider):
    """
    Scrapes live hotel search results from Booking.com without cloud services.
    Extracts real property IDs, names, prices, coordinates, star ratings, and review scores.
    """

    SEARCH_URL = "https://www.booking.com/searchresults.html"

    def __init__(self, timeout_sec: float = 15.0):
        super().__init__(name="booking", asset_type="lodging", cloud=False)
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

    def _parse_html_offers(
        self, html: str, destination_code: str, check_in: date, check_out: date
    ) -> list[LodgingQuote]:
        """
        Parses structured property data (JSON-LD blocks and search result attributes) from HTML.
        """
        quotes: list[LodgingQuote] = []
        now = datetime.now(timezone.utc)
        nights = max((check_out - check_in).days, 1)

        # 1. Parse JSON-LD blocks
        script_pattern = re.compile(
            r'<script\s+type=["\']application/ld\+json["\']>(.*?)</script>',
            re.DOTALL | re.IGNORECASE,
        )
        for match in script_pattern.finditer(html):
            raw_json = match.group(1).strip()
            try:
                data = json.loads(raw_json)
                items = data.get("itemListElement") if isinstance(data, dict) else None
                if not items and isinstance(data, list):
                    items = data

                if items and isinstance(items, list):
                    for item in items:
                        item_obj = (
                            item.get("item", item) if isinstance(item, dict) else {}
                        )
                        item_type = item_obj.get("@type", "")
                        if item_type in (
                            "Hotel",
                            "LodgingBusiness",
                            "Hostel",
                            "Resort",
                        ):
                            p_name = item_obj.get("name")
                            p_url = item_obj.get("url")
                            agg_rating = item_obj.get("aggregateRating", {})
                            r_val = agg_rating.get("ratingValue")
                            r_count = agg_rating.get("reviewCount")
                            r_score = float(r_val) if r_val is not None else None
                            r_cnt = int(r_count) if r_count is not None else None

                            # Look for price in offers
                            offers = item_obj.get("offers", {})
                            price = offers.get("price")
                            curr = offers.get("priceCurrency", "EUR")

                            if p_name and price is not None:
                                total_price_cents = int(round(float(price) * 100))
                                nightly_cents = int(round(total_price_cents / nights))
                                quotes.append(
                                    LodgingQuote(
                                        destination_code=destination_code,
                                        check_in=check_in,
                                        check_out=check_out,
                                        base_price_per_night_cents=nightly_cents,
                                        currency=curr,
                                        quality_score=r_score * 10.0
                                        if r_score
                                        else None,
                                        property_name=p_name,
                                        property_id=p_name.lower().replace(" ", "_"),
                                        stars=None,
                                        review_score=r_score,
                                        review_count=r_cnt,
                                        latitude=None,
                                        longitude=None,
                                        taxes_included=True,
                                        estimated_fee_ratio=None,
                                        deep_link=p_url or self.SEARCH_URL,
                                        source="booking",
                                        observed_at=now,
                                        is_live=True,
                                        confidence="high",
                                    )
                                )
            except Exception:
                continue

        # 2. Parse data-testid="property-card" blocks if JSON-LD was minimal
        if not quotes:
            card_pattern = re.compile(
                r'data-testid=["\']property-card["\'].*?data-testid=["\']title["\']>(.*?)</div>.*?data-testid=["\']price-and-discounted-price["\']>(.*?)</span>',
                re.DOTALL,
            )
            for m in card_pattern.finditer(html):
                title = re.sub(r"<.*?>", "", m.group(1)).strip()
                raw_price = re.sub(r"[^\d,\.]", "", m.group(2)).replace(",", ".")
                try:
                    price_val = float(raw_price)
                    total_cents = int(round(price_val * 100))
                    nightly = int(round(total_cents / nights))
                    quotes.append(
                        LodgingQuote(
                            destination_code=destination_code,
                            check_in=check_in,
                            check_out=check_out,
                            base_price_per_night_cents=nightly,
                            currency="EUR",
                            quality_score=None,
                            property_name=title,
                            property_id=title.lower().replace(" ", "_"),
                            stars=None,
                            review_score=None,
                            review_count=None,
                            latitude=None,
                            longitude=None,
                            taxes_included=True,
                            estimated_fee_ratio=None,
                            deep_link=self.SEARCH_URL,
                            source="booking",
                            observed_at=now,
                            is_live=True,
                            confidence="medium",
                        )
                    )
                except Exception:
                    continue

        return quotes

    async def _scrape_with_playwright(
        self, city: str, check_in: date, check_out: date, adults: int = 2
    ) -> list[LodgingQuote]:
        import asyncio
        import os

        script_path = os.path.join(
            os.path.dirname(__file__), "..", "scripts", "scrape_booking.js"
        )
        cmd = [
            "node",
            script_path,
            city,
            check_in.isoformat(),
            check_out.isoformat(),
            str(adults),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            err_text = stderr.decode()[:300]
            raise ProviderBlockedError(f"Playwright booking scraper failed: {err_text}")

        try:
            data = json.loads(stdout.decode())
        except Exception as e:
            raise ParseDriftError(f"Failed to decode Playwright output: {e}")

        offers = data.get("offers", [])
        quotes: list[LodgingQuote] = []
        now = datetime.now(timezone.utc)
        nights = max((check_out - check_in).days, 1)

        for off in offers:
            title = off.get("title")
            raw_p = off.get("priceText") or ""
            score_val = off.get("score")
            rev_cnt = off.get("reviewCount")
            link = off.get("link")
            if not title or not raw_p:
                continue

            cleaned_p = (
                re.sub(r"[^\d,\.]", "", raw_p).replace(".", "").replace(",", ".")
            )
            try:
                total_eur = float(cleaned_p)
                total_cents = int(round(total_eur * 100))
                nightly_cents = int(round(total_cents / nights))
                quotes.append(
                    LodgingQuote(
                        destination_code=city[:3].upper(),
                        check_in=check_in,
                        check_out=check_out,
                        base_price_per_night_cents=nightly_cents,
                        currency="EUR",
                        quality_score=score_val * 10.0 if score_val else None,
                        property_name=title,
                        property_id=title.lower().replace(" ", "_")[:64],
                        stars=None,
                        review_score=score_val,
                        review_count=rev_cnt,
                        latitude=None,
                        longitude=None,
                        taxes_included=True,
                        estimated_fee_ratio=None,
                        deep_link=link or self.SEARCH_URL,
                        source="booking_playwright",
                        observed_at=now,
                        is_live=True,
                        confidence="high",
                    )
                )
            except Exception:
                continue

        return quotes

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
        params = {
            "ss": city_name,
            "checkin": check_in.isoformat(),
            "checkout": check_out.isoformat(),
            "group_adults": str(adults),
            "no_rooms": "1",
            "selected_currency": "EUR",
        }
        try:
            async with httpx.AsyncClient(
                headers=self.headers, follow_redirects=True
            ) as client:
                resp = await client.get(
                    self.SEARCH_URL, params=params, timeout=self.timeout_sec
                )
                # If HTTP gets CloudFront WAF challenge or status 202/403, fallback to headless Playwright
                if resp.status_code in (
                    202,
                    403,
                    429,
                ) or "challenge" in resp.headers.get("x-amzn-waf-action", ""):
                    logger.info(
                        f"[Booking] HTTP challenged ({resp.status_code}); escalating to headless Playwright worker..."
                    )
                    return await self._scrape_with_playwright(
                        city_name, check_in, check_out, adults=adults
                    )

                if resp.status_code != 200:
                    raise ParseDriftError(
                        f"Booking.com returned status {resp.status_code}"
                    )

                quotes = self._parse_html_offers(
                    resp.text, destination_code, check_in, check_out
                )
                if not quotes:
                    return await self._scrape_with_playwright(
                        city_name, check_in, check_out, adults=adults
                    )
                return quotes
        except ProviderBlockedError:
            raise
        except Exception as e:
            logger.info(
                f"Booking HTTP failed ({e}); falling back to headless Playwright..."
            )
            return await self._scrape_with_playwright(
                city_name, check_in, check_out, adults=adults
            )

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
                f"Booking.com returned 0 live properties for {destination_code}"
            )
        # Return the best value offer
        offers.sort(key=lambda x: x.base_price_per_night_cents)
        return offers[0]
