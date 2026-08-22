import os
from duffel_api import Duffel
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

load_dotenv()
DUFFEL_TOKEN = os.getenv("DUFFEL_TOKEN")

class DuffelScraper:
    def __init__(self):
        if not DUFFEL_TOKEN:
            raise ValueError("DUFFEL_TOKEN not found in environment variables.")
        self.client = Duffel(access_token=DUFFEL_TOKEN, api_version='v2')

    def scrape_flights(self, origin: str, destination: str, date: str) -> list[dict]:
        """
        Fetch flights from Duffel API.
        """
        logger.info(f"Fetching flights via Duffel: {origin} -> {destination} on {date}")
        try:
            # We are assuming basic parameters, 1 adult.
            offer_request = self.client.offer_requests.create()
            offer_request = self.client.offer_requests.create().slices([
                {"origin": origin, "destination": destination, "departure_date": date}
            ]).passengers([{"type": "adult"}]).execute()
            
            flights = []
            for offer in offer_request.offers:
                # Get total price
                price = float(offer.total_amount)
                # Slices
                for slice in offer.slices:
                    # Get departure and arrival times from the first segment
                    dep_time = slice.segments[0].departing_at.strftime("%H:%M") if hasattr(slice.segments[0].departing_at, "strftime") else str(slice.segments[0].departing_at)[11:16]
                    arr_time = slice.segments[-1].arriving_at.strftime("%H:%M") if hasattr(slice.segments[-1].arriving_at, "strftime") else str(slice.segments[-1].arriving_at)[11:16]
                    flights.append({
                        "price": price,
                        "departure_time": dep_time,
                        "arrival_time": arr_time
                    })
            if not flights:
                raise RuntimeError("Duffel returned no flights.")
            
            return sorted(flights, key=lambda x: x["price"])
        except Exception as e:
            logger.error(f"Duffel flight scraping failed: {e}")
            raise RuntimeError(f"Duffel flight scraping failed: {e}")

    def scrape_hotels(self, city: str, check_in_date: str, check_out_date: str) -> list[dict]:
        """
        Fetch hotels from Duffel Stays API.
        This is a stub, Stays API might require more complex queries like lat/lon.
        """
        # Duffel Stays search might require coordinates or property IDs, so we raise exception for fallback if it fails.
        raise RuntimeError("Duffel Stays API not fully supported without coordinates/property ID mapping. Falling back.")
