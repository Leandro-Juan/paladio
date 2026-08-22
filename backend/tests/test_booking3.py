import asyncio
from playwright.async_api import async_playwright
import urllib.parse
from playwright_stealth import Stealth

async def main():
    city = "Barcelona"
    url = f"https://www.booking.com/searchresults.html?ss={urllib.parse.quote(city)}&checkin=2027-03-31&checkout=2027-04-05"
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-US"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        await page.goto(url, wait_until="commit", timeout=60000)
        await page.wait_for_timeout(4000)
        
        page_data = await page.evaluate('''() => {
            const cards = Array.from(document.querySelectorAll('[data-testid="property-card"]'));
            if (cards.length === 0) return [];
            return cards.map(card => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
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
                    raw: card.innerText.substring(0, 300).replace(/\\n/g, ' ')
                };
            });
        }''')
        for i in page_data[:3]:
            print(i)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
