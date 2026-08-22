import asyncio
from app.scraper.dynamic_scraper import scrape_dynamic
import urllib.parse

async def main():
    city = "Barcelona"
    hotel_url = f"https://www.booking.com/searchresults.html?ss={urllib.parse.quote(city)}"
    try:
        hotel_results = await scrape_dynamic(hotel_url)
        print("Got hotels:", len(hotel_results.get("extracted_data", [])))
        for h in hotel_results.get("extracted_data", [])[:2]:
            print(h['name'], h['financials']['price_per_night'])
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
