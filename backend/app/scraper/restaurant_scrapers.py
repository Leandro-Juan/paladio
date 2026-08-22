import os
import logging
import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()
FOURSQUARE_API_KEY = os.getenv("FOURSQUARE_API_KEY")

class FoursquareScraper:
    def __init__(self):
        if not FOURSQUARE_API_KEY:
            raise ValueError("FOURSQUARE_API_KEY not found in environment variables.")
        self.api_key = FOURSQUARE_API_KEY

    async def scrape_restaurants(self, city: str, limit: int = 4) -> list[dict]:
        """
        Fetch restaurants using Foursquare API v3.
        """
        logger.info(f"Fetching restaurants via Foursquare for {city}")
        url = "https://api.foursquare.com/v3/places/search"
        params = {
            "query": "restaurant",
            "near": city,
            "limit": limit
        }
        headers = {
            "Accept": "application/json",
            "Authorization": self.api_key
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                
            restaurants = []
            for place in data.get("results", []):
                name = place.get("name", "Unknown Restaurant")
                lat = place.get("geocodes", {}).get("main", {}).get("latitude", 0.0)
                lon = place.get("geocodes", {}).get("main", {}).get("longitude", 0.0)
                
                restaurants.append({
                    "name": name,
                    "location": {"latitude": lat, "longitude": lon}
                })
                
            if not restaurants:
                raise RuntimeError("Foursquare returned no restaurants.")
                
            return restaurants
        except Exception as e:
            logger.error(f"Foursquare scraping failed: {e}")
            raise RuntimeError(f"Foursquare scraping failed: {e}")

class OSMRestaurantScraper:
    async def scrape_restaurants(self, city: str, limit: int = 4) -> list[dict]:
        """
        Fetch restaurants using OpenStreetMap Nominatim API.
        """
        from app.swarm.graph import get_location_coordinates
        city_lat, city_lon = await get_location_coordinates(city)
        viewbox = f"{city_lon-0.05},{city_lat+0.05},{city_lon+0.05},{city_lat-0.05}"
        
        logger.info(f"Fetching restaurants via OpenStreetMap Nominatim for {city} with viewbox {viewbox}")
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": "restaurant",
            "format": "json",
            "limit": limit,
            "viewbox": viewbox,
            "bounded": 1
        }
        # Nominatim requires a user agent
        headers = {
            "User-Agent": "Paladio-Travel-App/1.0"
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                
            restaurants = []
            for place in data:
                name = place.get("name", "Unknown Restaurant")
                # Sometimes Nominatim name is just the query or empty, fallback to display_name
                if name == "Unknown Restaurant" and "display_name" in place:
                    name = place["display_name"].split(",")[0]
                
                lat = float(place.get("lat", 0.0))
                lon = float(place.get("lon", 0.0))
                
                restaurants.append({
                    "name": name,
                    "location": {"latitude": lat, "longitude": lon}
                })
                
            if not restaurants:
                raise RuntimeError("OSM returned no restaurants.")
                
            return restaurants
        except Exception as e:
            logger.error(f"OSM scraping failed: {e}")
            raise RuntimeError(f"OSM scraping failed: {e}")
