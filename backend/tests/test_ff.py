import asyncio
from app.scraper.fast_flights_scraper import FastFlightsScraper

async def main():
    scraper = FastFlightsScraper()
    print("Scraping...")
    flights = await scraper.scrape_flights("ALC", "BCN", "2027-03-31")
    print(f"Got {len(flights)} flights")
    print(flights)

if __name__ == "__main__":
    asyncio.run(main())
