from playwright.async_api import (
    TimeoutError as PlaywrightTimeoutError,
)
from playwright.async_api import (
    async_playwright,
)

from app.schemas.scraper import (
    FoodAndDrink,
    FoodFinancials,
    Location,
    MealSuitability,
    Metadata,
    Schedule,
    Scoring,
)
from app.scraper.exceptions import DOMChangedError
from app.scraper.strategies.base import BaseScraperStrategy, logger


class RestaurantScraperStrategy(BaseScraperStrategy):
    async def scrape(self, url: str) -> dict:
        logger.info(f"Starting restaurant scrape for URL: {url}")

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
                if "google.com/maps/search/" in url:
                    structured_results = await self._scrape_google_maps(page, url)
                elif "tripadvisor" in url:
                    structured_results = await self._scrape_tripadvisor(page, url)
                elif "yelp.com" in url:
                    structured_results = await self._scrape_yelp(page, url)
                else:
                    raise DOMChangedError(
                        f"Restaurant strategy for {url} not supported yet."
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

    async def _scrape_google_maps(self, page, url):
        structured_results = []
        try:
            await page.evaluate("""() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const acceptBtn = buttons.find(b => b.innerText && b.innerText.match(/Accept all|Aceptar todo/i));
                if(acceptBtn) acceptBtn.click();
            }""")
            await page.wait_for_timeout(2000)
        except Exception as e:
            logger.debug(f"Could not click cookie accept button: {e}")
        page_data = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => a.closest('.Nv2PK')).filter(Boolean);
            if (cards.length === 0) throw new Error("DOM changed");
            
            return Array.from(new Set(cards)).map(card => {
                const name = card.querySelector('.qBF1Pd')?.innerText || "Unknown";
                const ratingEl = card.querySelector('.MW4etd');
                const reviewsEl = card.querySelector('.UY7F9');
                const priceEl = card.innerText.match(/\\$\\$\\$\\$|\\$\\$\\$|\\$\\$|\\$/);
                
                return {
                    name: name,
                    rating: ratingEl ? ratingEl.innerText : "0",
                    reviews: reviewsEl ? reviewsEl.innerText : "0",
                    price: priceEl ? priceEl[0] : "$$"
                };
            });
        }""")

        for idx, item in enumerate(page_data):
            rating_val = 0.0
            try:
                rating_val = float(item["rating"].replace(",", "."))
            except Exception:
                pass

            reviews_val = 0
            try:
                reviews_val = int("".join(filter(str.isdigit, item["reviews"])))
            except Exception:
                pass

            structured_results.append(
                FoodAndDrink(
                    id=f"GMAPS-{idx}",
                    category="restaurant",
                    name=item["name"],
                    location=Location(latitude=0.0, longitude=0.0),
                    schedule=Schedule(
                        opening_time_local="12:00",
                        closing_time_local="23:00",
                        recommended_duration_minutes=90,
                    ),
                    meal_suitability=MealSuitability(
                        is_breakfast=False,
                        is_lunch=True,
                        is_dinner=True,
                        is_snack=False,
                    ),
                    financials=FoodFinancials(price_tier=item["price"], currency="EUR"),
                    scoring=Scoring(rating=rating_val, reviews=reviews_val),
                    cuisine=[],
                    dietary_options=[],
                    metadata=Metadata(source="google_maps"),
                ).model_dump(mode="json")
            )
        return structured_results

    async def _scrape_tripadvisor(self, page, url):
        structured_results = []
        page_data = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('.zdCeB, .YItvm, [data-test-target="restaurants-list"] .list-item'));
            if (cards.length === 0) throw new Error("DOM changed");
            
            return cards.map(card => {
                const name = card.querySelector('.Lwqic, .bHgVA, .XoxkG')?.innerText || "Unknown";
                const rating = card.querySelector('.b, .ui_bubble_rating')?.getAttribute('aria-label') || "0";
                const reviews = card.querySelector('.Wb, .Nozbn')?.innerText || "0";
                const priceAndCuisine = card.querySelector('.YtX, .bhDlF')?.innerText || "";
                
                const parts = priceAndCuisine.split('•').map(s => s.trim());
                const price = parts[0] || "$";
                const cuisines = parts.length > 1 ? parts.slice(1).join(', ') : "";
                
                return { name, rating, reviews, price, cuisines };
            });
        }""")

        for idx, item in enumerate(page_data):
            rating_val = 0.0
            if item["rating"] != "0":
                try:
                    rating_val = float(item["rating"].split()[0].replace(",", "."))
                except Exception:
                    pass

            reviews_val = 0
            try:
                reviews_val = int("".join(filter(str.isdigit, item["reviews"])))
            except Exception:
                pass

            price_tier = "".join([c for c in item["price"] if c == "$"])
            if not price_tier:
                price_tier = "$$"

            raw_cuisines = [c.strip() for c in item["cuisines"].split(",") if c.strip()]
            is_bf = any(
                "cafe" in c.lower() or "bakery" in c.lower() or "breakfast" in c.lower()
                for c in raw_cuisines
            )
            cat = "cafe_bakery" if is_bf else "restaurant"
            dur = 45 if is_bf else 90

            structured_results.append(
                FoodAndDrink(
                    id=f"TA-{idx}",
                    category=cat,
                    name=item["name"],
                    location=Location(latitude=0.0, longitude=0.0),
                    schedule=Schedule(
                        opening_time_local="08:00",
                        closing_time_local="23:00",
                        recommended_duration_minutes=dur,
                    ),
                    meal_suitability=MealSuitability(
                        is_breakfast=is_bf,
                        is_lunch=True,
                        is_dinner=not is_bf,
                        is_snack=is_bf,
                    ),
                    financials=FoodFinancials(price_tier=price_tier, currency="EUR"),
                    scoring=Scoring(rating=rating_val, reviews=reviews_val),
                    cuisine=raw_cuisines,
                    dietary_options=[],
                    metadata=Metadata(source="tripadvisor"),
                ).model_dump(mode="json")
            )
        return structured_results

    async def _scrape_yelp(self, page, url):
        structured_results = []
        page_data = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('.container__09f24__mpR8_'));
            if (cards.length === 0) throw new Error("DOM changed");
            
            return cards.map(card => {
                const name = card.querySelector('.css-1m051bw, h3')?.innerText || "Unknown";
                const rating = card.querySelector('.css-gutk1c')?.getAttribute('aria-label') || "0";
                const price = card.querySelector('.priceRange__09f24__mmOuH')?.innerText || "$$";
                const cuisines = Array.from(card.querySelectorAll('.css-111k8z4')).map(el => el.innerText).join(', ');
                return { name, rating, price, cuisines };
            });
        }""")

        for idx, item in enumerate(page_data):
            rating_val = 0.0
            try:
                rating_val = float(item["rating"].split()[0])
            except Exception:
                pass

            price_tier = "".join([c for c in item["price"] if c == "$"]) or "$$"
            raw_cuisines = [c.strip() for c in item["cuisines"].split(",") if c.strip()]
            is_bf = any(
                "cafe" in c.lower() or "bakery" in c.lower() for c in raw_cuisines
            )
            cat = "cafe_bakery" if is_bf else "restaurant"
            dur = 45 if is_bf else 90

            structured_results.append(
                FoodAndDrink(
                    id=f"YELP-{idx}",
                    category=cat,
                    name=item["name"],
                    location=Location(latitude=0.0, longitude=0.0),
                    schedule=Schedule(
                        opening_time_local="09:00",
                        closing_time_local="22:00",
                        recommended_duration_minutes=dur,
                    ),
                    meal_suitability=MealSuitability(
                        is_breakfast=is_bf,
                        is_lunch=True,
                        is_dinner=not is_bf,
                        is_snack=is_bf,
                    ),
                    financials=FoodFinancials(price_tier=price_tier, currency="EUR"),
                    scoring=Scoring(rating=rating_val, reviews=0),
                    cuisine=raw_cuisines,
                    dietary_options=[],
                    metadata=Metadata(source="yelp"),
                ).model_dump(mode="json")
            )
        return structured_results
