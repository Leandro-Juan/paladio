from datetime import date

from playwright.async_api import (
    TimeoutError as PlaywrightTimeoutError,
)
from playwright.async_api import (
    async_playwright,
)

from app.schemas.scraper import (
    Booking,
    Hotel,
    HotelFinancials,
    Location,
    Metadata,
    Scoring,
    Stay,
)
from app.scraper.amenity_filter import AmenityFilter
from app.scraper.exceptions import DOMChangedError
from app.scraper.strategies.base import BaseScraperStrategy, logger


class HotelScraperStrategy(BaseScraperStrategy):
    async def scrape(self, url: str) -> dict:
        logger.info(f"Starting hotel scrape for URL: {url}")

        async with async_playwright() as p:
            context = await self._init_context(p)
            page = await context.new_page()

            try:
                await self._apply_stealth(page)
                response = await page.goto(url, wait_until="commit", timeout=60000)

                await page.wait_for_timeout(3000)
                await page.mouse.move(100, 100)
                await page.evaluate(
                    "if(document.body) window.scrollBy(0, document.body.scrollHeight / 3);"
                )

                if response is None:
                    raise Exception("Page failed to load completely.")

                await self._check_bot_detection(page, url)

                structured_results = []
                if "booking.com" in url:
                    structured_results = await self._scrape_booking(page, url)
                elif "agoda.com" in url:
                    structured_results = await self._scrape_agoda(page, url)
                else:
                    raise DOMChangedError(
                        f"Hotel strategy for {url} not supported yet."
                    )

                title = await page.title()

                return {
                    "url": url,
                    "status_code": response.status if response else 0,
                    "title": title,
                    "extracted_data": structured_results,
                }

            except PlaywrightTimeoutError as exc:
                logger.error(f"Timeout while scraping {url}: {exc}")
                raise
            except Exception as exc:
                logger.error(f"Unexpected error while scraping {url}: {exc}")
                raise
            finally:
                await context.close()

    async def _scrape_booking(self, page, url):
        structured_results = []
        try:
            await page.wait_for_selector('[data-testid="property-card"]', timeout=10000)
        except PlaywrightTimeoutError as e:
            logger.debug(f"Selector not found or timeout: {e}")
        except Exception as e:
            logger.debug(f"Unexpected error while waiting for selector: {e}")
        page_data = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('[data-testid="property-card"]'));
            if (cards.length === 0) throw new Error("DOM changed");
            return cards.map(card => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                const ratingEl = card.querySelector('[aria-label*="Scored"]');
                const amenities = Array.from(card.querySelectorAll('.bui-review-score__badge, .a3b8729ab1')).map(a => a.innerText);
                
                let priceStr = "0";
                if (priceEl) {
                    priceStr = priceEl.innerText.trim().replace(/\\n/g, ' ');
                } else {
                    const m = card.innerText.match(/(?:€|£|\\$)\\s?\\d+(?:,\\d{3})*(?:\\.\\d{2})?|\\d+(?:,\\d{3})*(?:\\.\\d{2})?\\s?(?:€|£|\\$)/);
                    if (m) priceStr = m[0];
                }
                
                return {
                    name: nameEl ? nameEl.innerText.trim() : "Unknown",
                    price: priceStr,
                    rating: ratingEl ? ratingEl.innerText.trim() : "0",
                    raw_amenities: amenities
                };
            });
        }""")

        for idx, item in enumerate(page_data):
            price_digits = "".join(filter(str.isdigit, item["price"]))
            price_val = float(price_digits) if price_digits else 0.0
            clean_am = AmenityFilter.clean_amenities(item.get("raw_amenities", []))

            structured_results.append(
                Hotel(
                    id=f"BOOKING-{idx}",
                    name=item["name"],
                    location=Location(latitude=0.0, longitude=0.0),
                    stay=Stay(
                        check_in_date=date.today(),
                        check_out_date=date.today(),
                        nights=1,
                    ),
                    financials=HotelFinancials(
                        total_price=price_val, price_per_night=price_val, currency="EUR"
                    ),
                    scoring=Scoring(rating=0.0),
                    amenities=clean_am,
                    booking=Booking(provider_url=url),
                    metadata=Metadata(source="Booking.com"),
                ).model_dump(mode="json")
            )
        return structured_results

    async def _scrape_agoda(self, page, url):
        structured_results = []
        page_data = await page.evaluate("""() => {
            const propertyCards = document.querySelectorAll('[data-selenium="hotel-item"]');
            if (propertyCards.length === 0) throw new Error("DOM changed");
            return Array.from(propertyCards).map(card => {
                const name = card.querySelector('[data-selenium="hotel-name"]')?.innerText || "Unknown";
                const price = card.querySelector('[data-selenium="display-price"]')?.innerText || "0";
                const amenities = Array.from(card.querySelectorAll('.amenity-icon')).map(a => a.innerText);
                return {name, price, raw_amenities: amenities};
            });
        }""")

        for idx, item in enumerate(page_data):
            price_digits = "".join(filter(str.isdigit, item["price"]))
            price_val = float(price_digits) if price_digits else 0.0
            clean_am = AmenityFilter.clean_amenities(item.get("raw_amenities", []))

            structured_results.append(
                Hotel(
                    id=f"AGODA-{idx}",
                    name=item["name"],
                    location=Location(latitude=0.0, longitude=0.0),
                    stay=Stay(
                        check_in_date=date.today(),
                        check_out_date=date.today(),
                        nights=1,
                    ),
                    financials=HotelFinancials(
                        total_price=price_val, price_per_night=price_val, currency="EUR"
                    ),
                    scoring=Scoring(rating=0.0),
                    amenities=clean_am,
                    booking=Booking(provider_url=url),
                    metadata=Metadata(source="Agoda"),
                ).model_dump(mode="json")
            )
        return structured_results
