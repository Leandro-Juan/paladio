import asyncio
import os
import sys
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(usecwd=True))

# Add the backend dir to sys.path so we can import from app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.scraper.http_scrapers import SkyscannerScraper

async def test_skyscanner():
    print("Testing SkyscannerScraper...")
    scraper = SkyscannerScraper()
    try:
        flights = await scraper.scrape_flights("MAD", "OPO", "2026-09-01")
        print("Success! Scraped flights:")
        import json
        print(json.dumps(flights, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Scraper failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_skyscanner())
