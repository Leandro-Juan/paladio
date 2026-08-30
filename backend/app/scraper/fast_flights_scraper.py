import logging

logger = logging.getLogger(__name__)


class FastFlightsScraper:
    async def scrape_flights(
        self, origin: str, destination: str, date: str
    ) -> list[dict]:
        """
        Fetch flights from fast-flights library.
        """
        logger.info(
            f"Fetching flights via fast-flights (Playwright fallback): {origin} -> {destination} on {date}"
        )
        try:
            from app.scraper.dynamic_scraper import scrape_dynamic

            # Construct Google Flights URL (approximate search)
            # We use the generic search URL to let the dynamic scraper handle it
            url = f"https://www.google.com/travel/flights?q=Flights%20from%20{origin}%20to%20{destination}%20on%20{date}"

            # Alternatively, we can use a direct flight search if needed, but the generic dynamic scraper handles this
            results = await scrape_dynamic(url)

            flights_data = results.get("extracted_data", [])
            if not flights_data:
                raise RuntimeError("fast-flights returned no flights.")

            flights = []
            for f in flights_data:
                flights.append(
                    {
                        "price": float(f.get("price", 150.0)),
                        "departure_time": f.get("departure_time", "10:00"),
                        "arrival_time": f.get("arrival_time", "12:00"),
                    }
                )

            return sorted(flights, key=lambda x: x["price"])
        except Exception as e:
            logger.error(f"fast-flights scraping failed: {e}")
            raise RuntimeError(f"fast-flights scraping failed: {e}")
