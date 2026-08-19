import asyncio
import logging
from app.scraper.api_scraper import get_flights_aviationstack, get_hotels_amadeus

logging.basicConfig(level=logging.INFO)

async def main():
    print("Testing API Scrapers (without keys, expects mock data fallback)...")
    
    # Test Aviationstack (Flights)
    print("\n--- Testing Flights (Aviationstack) ---")
    flights = await get_flights_aviationstack("MAD", "BCN")
    print(flights)
    
    # Test Amadeus (Hotels)
    print("\n--- Testing Hotels (Amadeus) ---")
    hotels = await get_hotels_amadeus("MAD")
    print(hotels)

if __name__ == "__main__":
    asyncio.run(main())
