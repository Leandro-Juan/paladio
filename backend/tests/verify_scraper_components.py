import asyncio
import os
from datetime import datetime
import json
import traceback
from app.schemas.scraper import Flight, Route, FlightSchedule, Financials, Booking, Metadata
from app.scraper.amenity_filter import AmenityFilter
from app.scraper.exceptions import DOMChangedError
from app.scraper.http_scrapers import VuelingScraper
from app.scraper.playwright_scrapers import GoogleFlightsScraper

def test_schemas():
    flight = Flight(
        id="test-123",
        airline="Test Air",
        flight_number="123",
        route=Route(origin_iata="MAD", destination_iata="OPO"),
        schedule=FlightSchedule(departure_utc=datetime.utcnow(), arrival_utc=datetime.utcnow(), duration_minutes=60),
        financials=Financials(price=50.0, currency="EUR"),
        booking=Booking(provider_url="https://test.com/?adults=2"),
        metadata=Metadata(source="Test")
    )
    print("Schema test passed:", flight.model_dump_json(indent=2))

def test_amenity_filter():
    raw = ["Free WiFi throughout", "some weird text", "Swimming Pool (Outdoor)", "AC", "Pets allowed", "random fluff"]
    cleaned = AmenityFilter.clean_amenities(raw)
    print("Amenity Filter input:", raw)
    print("Amenity Filter output:", cleaned)
    
async def test_scrapers():
    v = VuelingScraper()
    flights = await v.scrape_flights("MAD", "OPO", "2026-09-01")
    print(f"Vueling returned {len(flights)} flights")
    
    # Not testing Playwright fully to avoid spinning up browser in basic unit test, 
    # but we can test DOMChangedError
    try:
        raise DOMChangedError("Test Error", "<html></html>")
    except DOMChangedError as e:
        print("DOMChangedError caught successfully:", str(e))

if __name__ == "__main__":
    test_schemas()
    test_amenity_filter()
    asyncio.run(test_scrapers())
