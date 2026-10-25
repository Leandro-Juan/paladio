"""Google Maps Real Rating & Review Resolver without API keys.

Scrapes public Google Maps place search using headless Playwright to extract
authentic user review ratings (1.0 - 5.0) and review counts for attractions.
Caches results in Redis with a 30-day TTL and persists them to PostgreSQL.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import re
import urllib.parse
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def _get_redis_url() -> str:
    env_url = os.getenv("REDIS_URL")
    if env_url:
        return env_url
    return "redis://redis:6379/0"


class GoogleMapsRatingResolver:
    """Zero-API-key Google Maps Rating & Review extraction with Redis caching."""

    _browser = None
    _playwright = None
    _lock = asyncio.Lock()
    _semaphore = asyncio.Semaphore(2)

    @classmethod
    async def get_cached_rating(cls, poi_id: str) -> dict[str, Any] | None:
        """Retrieves cached rating from Redis."""
        if not poi_id:
            return None
        redis_urls = [
            _get_redis_url(),
            "redis://localhost:6379/0",
            "redis://127.0.0.1:6379/0",
        ]
        for r_url in redis_urls:
            try:
                import redis.asyncio as aioredis

                r = aioredis.from_url(r_url, decode_responses=True)
                try:
                    cached = await r.get(f"poi:rating:{poi_id}")
                    if cached:
                        return json.loads(cached)
                    return None
                finally:
                    await r.aclose()
            except Exception:
                continue
        return None

    @classmethod
    async def set_cached_rating(
        cls, poi_id: str, data: dict[str, Any], ttl: int = CACHE_TTL_SECONDS
    ) -> None:
        """Stores resolved rating into Redis with TTL."""
        if not poi_id or not data:
            return
        redis_urls = [
            _get_redis_url(),
            "redis://localhost:6379/0",
            "redis://127.0.0.1:6379/0",
        ]
        for r_url in redis_urls:
            try:
                import redis.asyncio as aioredis

                r = aioredis.from_url(r_url, decode_responses=True)
                try:
                    await r.set(
                        f"poi:rating:{poi_id}",
                        json.dumps(data, ensure_ascii=False),
                        ex=ttl,
                    )
                    return
                finally:
                    await r.aclose()
            except Exception:
                continue

    @classmethod
    async def scrape_rating(
        cls,
        name: str,
        city: str,
        page=None,
    ) -> dict[str, Any] | None:
        """Extracts rating and review count for a POI using a Playwright page."""
        if not name or not name.strip():
            return None

        clean_name = name.strip()
        query = f"{clean_name} {city}".strip()
        encoded = urllib.parse.quote_plus(query)
        url = f"https://www.google.com/maps/search/{encoded}?hl=en"

        created_page = False
        browser = None
        playwright_obj = None

        try:
            if page is None:
                from playwright.async_api import async_playwright

                playwright_obj = await async_playwright().start()
                browser = await playwright_obj.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                    ],
                )
                context = await browser.new_context(
                    locale="en-US",
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                )
                page = await context.new_page()
                created_page = True

            try:
                await page.goto(url, timeout=14000, wait_until="domcontentloaded")
            except Exception as nav_err:
                logger.debug(f"Navigation error for {query}: {nav_err}")
                return None

            # Handle consent banner if present
            try:
                consent = page.locator(
                    'button:has-text("Accept all"), button:has-text("Reject all"), form[action*="consent"] button'
                )
                if await consent.count() > 0:
                    await consent.first.click()
                    await page.wait_for_timeout(1000)
            except Exception:
                pass

            # Wait briefly for place card or listing to render
            await page.wait_for_timeout(2000)
            html = await page.content()

            # Pattern 1: aria-label with rating and review count
            # e.g., '4.4 stars 92,104 Reviews' or '4.6 stars 18,293 Reviews' or '4.7 stars '
            aria_matches = re.findall(
                r'aria-label="([1-5]\.[0-9])\s*stars?\s*([0-9,]+)?\s*(?:reviews?)?"',
                html,
                re.IGNORECASE,
            )

            rating: float | None = None
            reviews: int = 0

            if aria_matches:
                # Pick the first valid match
                for m_rate, m_revs in aria_matches:
                    try:
                        r_val = float(m_rate)
                        if 1.0 <= r_val <= 5.0:
                            rating = r_val
                            if m_revs:
                                reviews = int(m_revs.replace(",", ""))
                            break
                    except (ValueError, TypeError):
                        continue

            # Pattern 2: Search for review count if rating was found but reviews was 0
            if rating is not None and reviews == 0:
                rev_matches = re.findall(
                    r'(?:aria-label="([0-9,]+)\s*reviews?"|\(([0-9,]+)\s+reviews?\)|([0-9,]+)\s+reviews\b)',
                    html,
                    re.IGNORECASE,
                )
                for groups in rev_matches:
                    val = next((g for g in groups if g), None)
                    if val:
                        try:
                            c = int(val.replace(",", ""))
                            if 0 < c < 10000000:
                                reviews = c
                                break
                        except ValueError:
                            continue

            # Pattern 3: Fallback DOM extraction from standard Google Maps classes
            if rating is None:
                try:
                    f7 = page.locator("div.F7nice span[aria-hidden='true']").first
                    if await f7.count() > 0:
                        text_val = await f7.text_content()
                        if text_val:
                            r_val = float(text_val.strip())
                            if 1.0 <= r_val <= 5.0:
                                rating = r_val
                except Exception:
                    pass

            if rating is not None:
                return {
                    "rating": round(rating, 1),
                    "reviews": reviews,
                    "source": "google_maps",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }

            return None

        except Exception as e:
            logger.debug(f"Error scraping rating for {query}: {e}")
            return None
        finally:
            if created_page:
                try:
                    if page:
                        await page.close()
                    if browser:
                        await browser.close()
                    if playwright_obj:
                        await playwright_obj.stop()
                except Exception:
                    pass

    @classmethod
    async def resolve_rating(
        cls,
        poi_id: str,
        name: str,
        city: str,
        lat: float | None = None,
        lng: float | None = None,
        session: AsyncSession | None = None,
    ) -> dict[str, Any] | None:
        """Resolves rating with Redis cache checking, scraping, and DB persistence."""
        # 1. Check Redis cache
        cached = await cls.get_cached_rating(poi_id)
        if cached:
            return cached

        # 2. Check Database if session provided
        if session and poi_id:
            try:
                res = await session.execute(
                    text("SELECT scoring FROM attractions WHERE id = :id"),
                    {"id": poi_id},
                )
                db_scoring = res.scalar_one_or_none()
                if (
                    isinstance(db_scoring, dict)
                    and float(db_scoring.get("rating", 0)) > 0
                ):
                    await cls.set_cached_rating(poi_id, db_scoring)
                    return db_scoring
            except Exception as e:
                logger.debug(f"DB check failed for {poi_id}: {e}")

        # 3. Scrape live rating via Playwright (throttled by semaphore)
        async with cls._semaphore:
            data = await cls.scrape_rating(name=name, city=city)

        if data:
            # Cache in Redis
            await cls.set_cached_rating(poi_id, data)

            # Persist to PostgreSQL if session is available
            if session and poi_id:
                try:
                    await session.execute(
                        text(
                            "UPDATE attractions SET scoring = :scoring WHERE id = :id"
                        ),
                        {"scoring": json.dumps(data), "id": poi_id},
                    )
                    await session.commit()
                    logger.info(
                        f"Persisted real rating {data['rating']}★ ({data['reviews']} revs) for {name} ({poi_id})"
                    )
                except Exception as db_err:
                    logger.debug(f"Failed to persist rating for {poi_id}: {db_err}")

            return data

        return None
