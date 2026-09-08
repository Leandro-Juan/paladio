from app.scraper.browser_pool import pool


class BaseScraperStrategy:
    async def scrape(self, url: str):
        context = await pool.get_context()
        page = await context.new_page()
        try:
            await page.goto(url)
            # Fix 5s CAPTCHA evasion timeout
            await page.wait_for_timeout(5000)

            # Use standard locators instead of fake abstractions
            element = page.locator("body")
            content = await element.inner_text()
            return content
        finally:
            await context.close()
