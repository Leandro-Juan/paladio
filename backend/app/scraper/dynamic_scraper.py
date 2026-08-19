import logging
import os
import urllib.parse
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from app.scraper.exceptions import BotDetectionError

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
        if proxy_url:
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
            # Mask webdriver property using initialization script
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            
            # Navigate and wait for DOM content to be loaded (JS will execute)
            response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            # Additional generic wait to let frameworks initialize
            await page.wait_for_timeout(3000)
            
            if response is None:
                raise Exception("Page failed to load completely.")
            
            # Extract basic data (simulating extraction for flight/hotel sites)
            title = await page.title()
            
            # Use page.evaluate to extract structured data from the DOM
            # In a real scenario, this would have site-specific logic.
            # Here we extract all text and links generically.
            page_data = await page.evaluate('''() => {
                const links = Array.from(document.querySelectorAll('a')).map(a => a.href).filter(href => href);
                // Get basic visible text payload, bounded to avoid massive returns
                const bodyText = document.body.innerText.substring(0, 2000);
                return {
                    links: [...new Set(links)].slice(0, 10), // return top 10 unique links
                    preview_text: bodyText
                };
            }''')
            
            # Basic CAPTCHA detection logic
            captcha_keywords = ["Are you a person or a robot?", "Access Denied", "captcha", "Incapsula", "Cloudflare"]
            preview_text = page_data.get("preview_text", "")
            for keyword in captcha_keywords:
                if keyword.lower() in preview_text.lower():
                    raise BotDetectionError(f"Bot detection triggered (found '{keyword}') for URL: {url}")
            
            logger.info(f"Successfully scraped dynamic URL: {url}")
            
            return {
                "url": url,
                "status_code": response.status if response else 0,
                "title": title,
                "extracted_data": page_data
            }
            
        except PlaywrightTimeoutError as exc:
            logger.error(f"Timeout while scraping {url}: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while scraping {url}: {exc}")
            raise
        finally:
            await browser.close()
