import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://www.booking.com/searchresults.html?ss=Barcelona")
        await page.wait_for_selector('[data-testid="property-card"]')
        card = await page.query_selector('[data-testid="property-card"]')
        html = await card.inner_html()
        print(html[:2000])
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
