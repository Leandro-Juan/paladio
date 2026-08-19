import asyncio
import logging
from app.scraper.dynamic_scraper import scrape_dynamic

logging.basicConfig(level=logging.INFO)

async def main():
    print("Testing real-world dynamic scraping on booking.com...")
    try:
        # We try a simple search URL on Booking.com for Madrid
        url = "https://www.booking.com/searchresults.html?ss=Madrid"
        result = await scrape_dynamic(url)
        print("Scrape successful!")
        print(f"Title: {result.get('title')}")
        print(f"Links found: {len(result.get('extracted_data', {}).get('links', []))}")
        print(f"Preview text snippet: {result.get('extracted_data', {}).get('preview_text', '')[:200]}")
    except Exception as e:
        print(f"Scrape failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
