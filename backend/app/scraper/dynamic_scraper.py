import logging
import os
import urllib.parse
from datetime import datetime, date
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from playwright_stealth import Stealth
from app.scraper.exceptions import BotDetectionError, DOMChangedError
from app.schemas.scraper import (
    Flight, Hotel, Route, FlightSchedule, Financials, Booking, Metadata, 
    Location, Stay, HotelFinancials, Scoring, FoodAndDrink, Schedule, 
    MealSuitability, FoodFinancials
)
from app.scraper.amenity_filter import AmenityFilter

logger = logging.getLogger(__name__)

async def scrape_dynamic(url: str) -> dict:
    """
    Scrapes a dynamic, JavaScript-heavy single-page site using Playwright.
    Returns structured JSON representation of the page.
    """
    logger.info(f"Starting dynamic scrape for URL: {url}")
    
    async with async_playwright() as p:
        # Launch Chromium. Playwright-stealth concepts applied:
        # Standard viewport, headless but mimicking headed properties via args where needed.
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ]
        )
        
        # Parse Webshare proxy URL for Playwright
        proxy_url = os.environ.get("WEBSHARE_PROXY_URL")
        proxy_config = None
        if proxy_url and "skyscanner" not in url:
            parsed = urllib.parse.urlparse(proxy_url)
            proxy_config = {
                "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
            }
            if parsed.username and parsed.password:
                proxy_config["username"] = parsed.username
                proxy_config["password"] = parsed.password
            logger.info("Using Webshare proxy for dynamic request.")
        
        # Create a context with a realistic user agent and viewport
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            has_touch=False,
            is_mobile=False,
            proxy=proxy_config,
        )
        
        page = await context.new_page()
        
        try:
            await Stealth().apply_stealth_async(page)
            # Mask webdriver property using initialization script
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            
            # Navigate and wait for DOM content to be loaded (JS will execute)
            response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            
            # Additional generic wait to let frameworks initialize
            await page.wait_for_timeout(3000)
            
            if response is None:
                raise Exception("Page failed to load completely.")
            
            # Extract basic data (simulating extraction for flight/hotel sites)
            title = await page.title()
            
            # Global Bot Detection Check
            preview_text = await page.evaluate("() => document.body ? document.body.innerText.substring(0, 2000) : ''")
            captcha_keywords = ["Are you a person or a robot?", "Access Denied", "captcha", "Incapsula", "Cloudflare", "Pardon Our Interruption", "DataDome"]
            
            # Check for completely empty response (often used by CDNs to block headless)
            raw_html_check = await page.content()
            if len(raw_html_check) < 100 and "</body>" in raw_html_check:
                 raise BotDetectionError(f"Bot detection triggered (Empty Body Drop) for URL: {url}")
                 
            for keyword in captcha_keywords:
                if keyword.lower() in preview_text.lower() or keyword.lower() in raw_html_check.lower():
                    raise BotDetectionError(f"Bot detection triggered (found '{keyword}') for URL: {url}")
            
            # Domain-specific structured extraction
            structured_results = []
            try:
                if "booking.com" in url:
                    page_data = await page.evaluate('''() => {
                        const cards = Array.from(document.querySelectorAll('[data-testid="property-card"]'));
                        if (cards.length === 0) throw new Error("DOM changed");
                        return cards.map(card => {
                            const nameEl = card.querySelector('[data-testid="title"]');
                            const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                            const ratingEl = card.querySelector('[aria-label*="Scored"]');
                            const amenities = Array.from(card.querySelectorAll('.bui-review-score__badge, .a3b8729ab1')).map(a => a.innerText);
                            return {
                                name: nameEl ? nameEl.innerText.trim() : "Unknown",
                                price: priceEl ? priceEl.innerText.trim().replace(/\\n/g, ' ') : "0",
                                rating: ratingEl ? ratingEl.innerText.trim() : "0",
                                raw_amenities: amenities
                            };
                        });
                    }''')
                    for idx, item in enumerate(page_data):
                        price_val = float(''.join(filter(str.isdigit, item['price'])) or 0) / 100.0 # simple heuristic
                        clean_am = AmenityFilter.clean_amenities(item.get("raw_amenities", []))
                        structured_results.append(Hotel(
                            id=f"BOOKING-{idx}",
                            name=item["name"],
                            location=Location(latitude=0.0, longitude=0.0),
                            stay=Stay(check_in_date=date.today(), check_out_date=date.today(), nights=1),
                            financials=HotelFinancials(total_price=price_val, price_per_night=price_val, currency="EUR"),
                            scoring=Scoring(rating=0.0),
                            amenities=clean_am,
                            booking=Booking(provider_url=url),
                            metadata=Metadata(source="Booking.com")
                        ).model_dump(mode='json'))
                        
                elif "ryanair.com" in url:
                    page_data = await page.evaluate('''() => {
                        let results = [];
                        const cards = Array.from(document.querySelectorAll('flight-card, [data-ref="flight-card-wrap"], .flight-card, flights-trip-details, [data-ref="flight-segment"]'));
                        if (cards.length > 0) {
                            results = cards.map(card => {
                                const dep = card.querySelector('[data-ref="flight-segment.departure"] .time, [data-ref="departure-time"], .departure-time');
                                const arr = card.querySelector('[data-ref="flight-segment.arrival"] .time, [data-ref="arrival-time"], .arrival-time');
                                const price = card.querySelector('[data-ref="flight-price"] .price-value, .price, [data-ref="price"]');
                                return {
                                    departure: dep ? dep.innerText.trim() : "Unknown",
                                    arrival: arr ? arr.innerText.trim() : "Unknown",
                                    price: price ? price.innerText.trim() : "0"
                                };
                            });
                        }
                        if (results.length === 0 || results[0].price === "Unknown") {
                            results = [];
                            const text = document.body.innerText;
                            const blocks = text.split(/Select\\n|Sel\\n/);
                            blocks.forEach(block => {
                                const timeMatch = block.match(/(\\d{2}:\\d{2})/g);
                                const priceMatch = block.match(/(?:€|£|\\$)\\s?\\d+\\.\\d{2}/);
                                if (timeMatch && timeMatch.length >= 2 && priceMatch) {
                                    results.push({
                                        departure: timeMatch[0],
                                        arrival: timeMatch[1],
                                        price: priceMatch[0]
                                    });
                                }
                            });
                        }
                        if (results.length === 0) throw new Error("DOM changed");
                        return results;
                    }''')
                    for idx, item in enumerate(page_data):
                        price_val = float(''.join(filter(lambda c: c.isdigit() or c == '.', item['price'])) or 0)
                        structured_results.append(Flight(
                            id=f"RYANAIR-{idx}",
                            airline="Ryanair",
                            flight_number="Unknown",
                            route=Route(origin_iata="XXX", destination_iata="XXX"), # Mocked
                            schedule=FlightSchedule(departure_utc=datetime.utcnow(), arrival_utc=datetime.utcnow(), duration_minutes=120),
                            financials=Financials(price=price_val, currency="EUR"),
                            booking=Booking(provider_url=url),
                            metadata=Metadata(source="Ryanair")
                        ).model_dump(mode='json'))
                        
                elif "google.com/travel/flights" in url:
                    page_data = await page.evaluate('''() => {
                        const flightCards = document.querySelectorAll('.pIav2d'); 
                        if (flightCards.length === 0) throw new Error("DOM changed");
                        return Array.from(flightCards).map(card => {
                            const price = card.querySelector('span[role="text"]')?.innerText || "0";
                            const airline = card.querySelector('.sSHqwe')?.innerText || "Unknown Airline";
                            // The times are usually inside spans with specific attributes, or just the first two time strings
                            // e.g. "8:00 AM - 10:30 AM" or separate elements. We'll use aria-labels if possible.
                            const allSpans = Array.from(card.querySelectorAll('span'));
                            let departure = "08:00";
                            let arrival = "11:00";
                            
                            const timeRegex = /(\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm)?)/g;
                            const text = card.innerText;
                            const matches = text.match(timeRegex);
                            if (matches && matches.length >= 2) {
                                departure = matches[0];
                                arrival = matches[1];
                            }
                            return {price, airline, departure, arrival};
                        });
                    }''')
                    for idx, item in enumerate(page_data):
                        price_val = float(''.join(filter(str.isdigit, item['price'])) or 0)
                        
                        # Convert to HH:MM format (24 hour)
                        def parse_time(t_str):
                            t_str = t_str.strip().upper()
                            try:
                                if "AM" in t_str or "PM" in t_str:
                                    t = datetime.strptime(t_str, "%I:%M %p")
                                else:
                                    t = datetime.strptime(t_str, "%H:%M")
                                return t.strftime("%H:%M")
                            except Exception:
                                return "12:00" # Fallback if regex matched something weird
                                
                        dep = parse_time(item["departure"])
                        arr = parse_time(item["arrival"])
                        
                        structured_results.append({
                            "price": price_val,
                            "airline": item["airline"],
                            "departure_time": dep,
                            "arrival_time": arr
                        })
                        
                elif "skyscanner.net" in url:
                    page_data = await page.evaluate('''() => {
                        const flightCards = document.querySelectorAll('.BpkTicket_bpk-ticket__NDYzN');
                        if (flightCards.length === 0) throw new Error("DOM changed");
                        return [{price: "150", airline: "SkyscannerAirline"}];
                    }''')
                    # Map to model omitted for brevity, would follow same structure
                    
                elif "agoda.com" in url:
                    page_data = await page.evaluate('''() => {
                        const propertyCards = document.querySelectorAll('[data-selenium="hotel-item"]');
                        if (propertyCards.length === 0) throw new Error("DOM changed");
                        return Array.from(propertyCards).map(card => {
                            const name = card.querySelector('[data-selenium="hotel-name"]')?.innerText || "Unknown";
                            const price = card.querySelector('[data-selenium="display-price"]')?.innerText || "0";
                            const amenities = Array.from(card.querySelectorAll('.amenity-icon')).map(a => a.innerText);
                            return {name, price, raw_amenities: amenities};
                        });
                    }''')
                    # Map to model omitted for brevity
                    
                elif "expedia.com" in url:
                    raise DOMChangedError("Expedia DOM logic not yet implemented")
                
                elif "hostelworld.com" in url:
                    raise DOMChangedError("Hostelworld DOM logic not yet implemented")
                    
                elif "tripadvisor" in url:
                    page_data = await page.evaluate('''() => {
                        // Attempt to extract restaurant cards from Tripadvisor search/list
                        const cards = Array.from(document.querySelectorAll('.zdCeB, .YItvm, [data-test-target="restaurants-list"] .list-item'));
                        if (cards.length === 0) throw new Error("DOM changed");
                        
                        return cards.map(card => {
                            const name = card.querySelector('.Lwqic, .bHgVA, .XoxkG')?.innerText || "Unknown";
                            const rating = card.querySelector('.b, .ui_bubble_rating')?.getAttribute('aria-label') || "0";
                            const reviews = card.querySelector('.Wb, .Nozbn')?.innerText || "0";
                            const priceAndCuisine = card.querySelector('.YtX, .bhDlF')?.innerText || "";
                            
                            // priceAndCuisine often looks like: "$$ - $$$ • Mexican, Latin, Spanish"
                            const parts = priceAndCuisine.split('•').map(s => s.trim());
                            const price = parts[0] || "$";
                            const cuisines = parts.length > 1 ? parts.slice(1).join(', ') : "";
                            
                            return { name, rating, reviews, price, cuisines };
                        });
                    }''')
                    
                    for idx, item in enumerate(page_data):
                        # Extract numerical rating (e.g. "4.5 of 5 bubbles")
                        rating_val = 0.0
                        if item['rating'] != "0":
                            try:
                                rating_val = float(item['rating'].split()[0].replace(',', '.'))
                            except: pass
                            
                        # Extract reviews (e.g. "1,234 reviews")
                        reviews_val = 0
                        try:
                            reviews_val = int(''.join(filter(str.isdigit, item['reviews'])))
                        except: pass
                        
                        # Parse price tier (usually "$", "$$", "$$$", "$$$$")
                        price_tier = "".join([c for c in item['price'] if c == '$'])
                        if not price_tier: price_tier = "$$"
                        
                        # Parse cuisines
                        raw_cuisines = [c.strip() for c in item['cuisines'].split(',') if c.strip()]
                        
                        # Heuristics for meal suitability and duration
                        is_bf = any("cafe" in c.lower() or "bakery" in c.lower() or "breakfast" in c.lower() for c in raw_cuisines)
                        cat = "cafe_bakery" if is_bf else "restaurant"
                        dur = 45 if is_bf else 90
                        
                        structured_results.append(FoodAndDrink(
                            id=f"TA-{idx}",
                            category=cat,
                            name=item["name"],
                            location=Location(latitude=0.0, longitude=0.0), # Mocked pending detail page scrape
                            schedule=Schedule(opening_time_local="08:00", closing_time_local="23:00", recommended_duration_minutes=dur),
                            meal_suitability=MealSuitability(is_breakfast=is_bf, is_lunch=True, is_dinner=not is_bf, is_snack=is_bf),
                            financials=FoodFinancials(price_tier=price_tier, currency="EUR"),
                            scoring=Scoring(rating=rating_val, reviews=reviews_val),
                            cuisine=raw_cuisines,
                            dietary_options=[],
                            metadata=Metadata(source="tripadvisor")
                        ).model_dump(mode='json'))
                        
                elif "yelp.com" in url:
                    page_data = await page.evaluate('''() => {
                        const cards = Array.from(document.querySelectorAll('.container__09f24__mpR8_'));
                        if (cards.length === 0) throw new Error("DOM changed");
                        
                        return cards.map(card => {
                            const name = card.querySelector('.css-1m051bw, h3')?.innerText || "Unknown";
                            const rating = card.querySelector('.css-gutk1c')?.getAttribute('aria-label') || "0";
                            const price = card.querySelector('.priceRange__09f24__mmOuH')?.innerText || "$$";
                            const cuisines = Array.from(card.querySelectorAll('.css-111k8z4')).map(el => el.innerText).join(', ');
                            return { name, rating, price, cuisines };
                        });
                    }''')
                    
                    for idx, item in enumerate(page_data):
                        rating_val = 0.0
                        try: rating_val = float(item['rating'].split()[0])
                        except: pass
                        
                        price_tier = "".join([c for c in item['price'] if c == '$']) or "$$"
                        raw_cuisines = [c.strip() for c in item['cuisines'].split(',') if c.strip()]
                        is_bf = any("cafe" in c.lower() or "bakery" in c.lower() for c in raw_cuisines)
                        cat = "cafe_bakery" if is_bf else "restaurant"
                        dur = 45 if is_bf else 90
                        
                        structured_results.append(FoodAndDrink(
                            id=f"YELP-{idx}",
                            category=cat,
                            name=item["name"],
                            location=Location(latitude=0.0, longitude=0.0), 
                            schedule=Schedule(opening_time_local="09:00", closing_time_local="22:00", recommended_duration_minutes=dur),
                            meal_suitability=MealSuitability(is_breakfast=is_bf, is_lunch=True, is_dinner=not is_bf, is_snack=is_bf),
                            financials=FoodFinancials(price_tier=price_tier, currency="EUR"),
                            scoring=Scoring(rating=rating_val, reviews=0),
                            cuisine=raw_cuisines,
                            dietary_options=[],
                            metadata=Metadata(source="yelp")
                        ).model_dump(mode='json'))
                        
                else:
                    # Generic Regex Fallback for unknown airline sites (like Skyscanner, Vueling, Easyjet)
                    page_data = await page.evaluate('''() => {
                        let results = [];
                        const text = document.body.innerText;
                        const blocks = text.split(/\\n/);
                        let tempTimes = [];
                        blocks.forEach(block => {
                            const timeMatch = block.match(/(\\d{2}:\\d{2})/g);
                            const priceMatch = block.match(/(?:€|£|\\$)\\s?\\d+(?:\\.\\d{2})?|\\d+(?:\\.\\d{2})?\\s?(?:€|£|\\$)/);
                            
                            if (timeMatch) tempTimes.push(...timeMatch);
                            
                            if (priceMatch && tempTimes.length >= 2) {
                                results.push({
                                    departure: tempTimes[tempTimes.length-2],
                                    arrival: tempTimes[tempTimes.length-1],
                                    price: priceMatch[0]
                                });
                                tempTimes = []; // reset after finding a flight
                            }
                        });
                        if (results.length === 0) throw new Error("DOM changed");
                        return results;
                    }''')
                    
                    for idx, item in enumerate(page_data[:3]): # top 3 to avoid noise
                        price_str = ''.join(filter(lambda c: c.isdigit() or c == '.', item['price'].replace(',', '.')))
                        price_val = float(price_str) if price_str else 0.0
                        
                        structured_results.append({
                            "price": price_val,
                            "airline": urllib.parse.urlparse(url).hostname.replace('www.', '').split('.')[0].title(),
                            "departure_time": item["departure"],
                            "arrival_time": item["arrival"]
                        })
            
            except Exception as e:
                raw_html = await page.content()
                raise DOMChangedError(f"DOM failed for {url}: {e}", raw_html)

            

            logger.info(f"Successfully scraped dynamic URL: {url}")
            
            return {
                "url": url,
                "status_code": response.status if response else 0,
                "title": title,
                "extracted_data": structured_results
            }
            
        except PlaywrightTimeoutError as exc:
            logger.error(f"Timeout while scraping {url}: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while scraping {url}: {exc}")
            raise
        finally:
            await browser.close()
