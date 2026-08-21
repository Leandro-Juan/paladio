import httpx
import asyncio
from datetime import datetime
from typing import List
from app.schemas.scraper import Flight, Route, FlightSchedule, Financials, Booking, Metadata
from app.scraper.exceptions import RateLimitError

class BaseHTTPScraper:
    async def _fetch_json(self, url: str, headers: dict = None) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 429:
                raise RateLimitError("Rate limit exceeded")
            response.raise_for_status()
            return response.json()

class VuelingScraper(BaseHTTPScraper):
    """
    Scraper for Vueling delegating to dynamic scraper.
    """
    async def scrape_flights(self, origin: str, destination: str, date: str) -> List[dict]:
        url = f"https://www.vueling.com/en/book-your-flight/flight-availability?OriginId={origin}&DestinationId={destination}&OutboundFlightDate={date}&Adults=1"
        try:
            from app.scraper.dynamic_scraper import scrape_dynamic
            result = await scrape_dynamic(url)
            return result.get("extracted_data", [])
        except Exception as e:
            raise RuntimeError(f"Vueling scraping failed: {e}")

class EasyJetScraper(BaseHTTPScraper):
    """
    Scraper for EasyJet delegating to dynamic scraper.
    """
    async def scrape_flights(self, origin: str, destination: str, date: str) -> List[dict]:
        url = f"https://www.easyjet.com/en/buy/flights?origin={origin}&destination={destination}&date={date}"
        try:
            from app.scraper.dynamic_scraper import scrape_dynamic
            result = await scrape_dynamic(url)
            return result.get("extracted_data", [])
        except Exception as e:
            raise RuntimeError(f"EasyJet scraping failed: {e}")

class SkyscannerScraper(BaseHTTPScraper):
    """
    Scraper for Skyscanner delegating to dynamic scraper.
    """
    async def scrape_flights(self, origin: str, destination: str, date: str) -> List[dict]:
        formatted_date = date.replace("-", "")[2:] if "-" in date else date
        url = f"https://www.skyscanner.net/transport/flights/{origin}/{destination}/{formatted_date}/"
        try:
            from app.scraper.dynamic_scraper import scrape_dynamic
            result = await scrape_dynamic(url)
            return result.get("extracted_data", [])
        except Exception as e:
            raise RuntimeError(f"Skyscanner scraping failed: {e}")
