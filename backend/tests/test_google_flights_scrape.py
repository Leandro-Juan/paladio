import asyncio
import logging
from app.scraper.dynamic_scraper import scrape_dynamic

logging.basicConfig(level=logging.INFO)

async def main():
    print("Testing real-world dynamic scraping on Google Flights...")
    try:
        url = "https://www.google.com/travel/flights?q=Flights%20to%20BCN%20from%20MAD%20on%202026-10-15"
        result = await scrape_dynamic(url)
        print("Scrape successful!")
        print(f"Items extracted: {len(result.get('extracted_data', []))}")
        print(f"First item snippet: {str(result.get('extracted_data', [])[0])[:200] if result.get('extracted_data') else 'None'}")
    except Exception as e:
        print(f"Scrape failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
