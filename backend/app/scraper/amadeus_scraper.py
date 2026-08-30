import logging

from amadeus import Client

logger = logging.getLogger(__name__)


class AmadeusScraper:
    def __init__(self):
        try:
            self.amadeus = Client()
        except Exception as e:
            logger.warning(
                f"Amadeus client init failed (missing AMADEUS_CLIENT_ID/SECRET?): {e}"
            )
            self.amadeus = None

    def scrape_hotels(self, city: str) -> list[dict]:
        """
        Fetch hotels using Amadeus.
        """
        logger.info(f"Fetching hotels via Amadeus for {city}")
        if not self.amadeus:
            raise RuntimeError("Amadeus client not initialized.")

        try:
            # Note: cityCode should ideally be the 3-letter IATA code, e.g. PAR for Paris, BCN for Barcelona.
            # Here we just pass the first 3 letters capitalized as a naive heuristic,
            # in a real app this should map city name to IATA code.
            city_code = city[:3].upper()
            response = self.amadeus.reference_data.locations.hotels.by_city.get(
                cityCode=city_code
            )

            hotels_data = []
            if response.data:
                for hotel in response.data[:2]:  # Get top 2
                    name = hotel.get("name", "Unknown Amadeus Hotel")
                    lat = hotel.get("geoCode", {}).get("latitude", 0.0)
                    lon = hotel.get("geoCode", {}).get("longitude", 0.0)

                    hotels_data.append(
                        {
                            "name": name,
                            "financials": {
                                "price_per_night": 100.0
                            },  # Amadeus basic hotel search doesn't return price
                            "location": {"latitude": lat, "longitude": lon},
                        }
                    )

            if not hotels_data:
                raise RuntimeError("Amadeus returned no hotels.")

            return hotels_data
        except Exception as e:
            logger.error(f"Amadeus hotel scraping failed: {e}")
            raise RuntimeError(f"Amadeus hotel scraping failed: {e}")
