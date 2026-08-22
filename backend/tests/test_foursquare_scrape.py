import asyncio
import logging
from app.scraper.dynamic_scraper import scrape_dynamic

logging.basicConfig(level=logging.INFO)

async def main():
    print("Testing real-world dynamic scraping on Foursquare...")
    try:
        url = "https://foursquare.com/explore?mode=url&near=Madrid%2C%20Spain&q=Food"
        result = await scrape_dynamic(url)
        print("Scrape successful!")
        print(f"Items extracted: {len(result.get('extracted_data', []))}")
        print(f"Title: {result.get('title')}")
    except Exception as e:
        print(f"Scrape failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
