import logging
from playwright.async_api import async_playwright, Page, BrowserContext
from playwright_stealth import Stealth
from app.scraper.exceptions import BotDetectionError, DOMChangedError

logger = logging.getLogger(__name__)

class BaseScraperStrategy:
    """
    Base class for Playwright-based dynamic scrapers.
    Handles stealth initialization and bot detection evasion.
    """
    def __init__(self, proxy_config=None):
        self.proxy_config = proxy_config

    async def scrape(self, url: str) -> dict:
        raise NotImplementedError("Subclasses must implement scrape()")

    async def _init_context(self, p) -> BrowserContext:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--window-size=1920,1080",
                "--ignore-certificate-errors",
                "--disable-extensions",
                "--disable-dev-shm-usage",
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            has_touch=False,
            is_mobile=False,
            proxy=self.proxy_config,
            locale="en-US",
            timezone_id="Europe/Madrid",
            color_scheme="light"
        )
        return context

    async def _apply_stealth(self, page: Page):
        await Stealth().apply_stealth_async(page)
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        """)

    async def _check_bot_detection(self, page: Page, url: str):
        captcha_keywords = ["Are you a person or a robot?", "Access Denied", "captcha", "Incapsula", "Cloudflare", "Pardon Our Interruption", "DataDome"]
        
        for _ in range(3):
            preview_text = await page.evaluate("() => document.body ? document.body.innerText.substring(0, 2000) : ''")
            raw_html_check = await page.content()
            detected = False
            for keyword in captcha_keywords:
                if keyword.lower() in preview_text.lower() or keyword.lower() in raw_html_check.lower():
                    detected = True
                    break
            if detected:
                logger.info("Bot detection triggered. Waiting 5s for potential auto-solve...")
                await page.wait_for_timeout(5000)
            else:
                return False
                
        if detected:
             raise BotDetectionError(f"Bot detection triggered and not resolved for URL: {url}")
             
        if len(raw_html_check) < 100 and "</body>" in raw_html_check:
             raise BotDetectionError(f"Bot detection triggered (Empty Body Drop) for URL: {url}")
        
        return False
