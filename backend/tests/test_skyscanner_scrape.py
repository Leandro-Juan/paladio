import asyncio
import logging
from app.scraper.dynamic_scraper import scrape_dynamic

logging.basicConfig(level=logging.INFO)

async def main():
    print("Testing real-world dynamic scraping on skyscanner.net...")
    try:
        # We try a real search URL on Skyscanner for Madrid to Barcelona
        url = "https://www.skyscanner.net/transport/flights/MAD/BCN/261015/"
        result = await scrape_dynamic(url)
        print("Scrape successful!")
        print(f"Title: {result.get('title')}")
        print(f"Items extracted: {len(result.get('extracted_data', []))}")
        print(f"First item snippet: {str(result.get('extracted_data', [])[0])[:200] if result.get('extracted_data') else 'None'}")
    except Exception as e:
        print(f"Scrape failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
