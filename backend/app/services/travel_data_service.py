import logging
import urllib.parse

from app.scraper.strategies.restaurants import RestaurantScraperStrategy

logger = logging.getLogger(__name__)


async def fetch_restaurants(city: str, test_data=None):
    if test_data and "restaurants" in test_data:
        return test_data["restaurants"][:15]

    try:
        yelp_url = f"https://www.yelp.com/search?find_loc={urllib.parse.quote(city)}"
        res = await RestaurantScraperStrategy().scrape(yelp_url)
        restaurants = res.get("extracted_data", [])[:15]
        if restaurants:
            return restaurants
    except Exception as e:
        logger.debug(f"RestaurantScraperStrategy error: {e}")

    logger.info(
        f"Yelp scraper failed or returned empty for {city}. Falling back to Overpass API..."
    )
    try:
        from app.infrastructure.providers.overpass_provider import (
            OverpassProviderAdapter,
        )

        provider = OverpassProviderAdapter()
        pois = await provider.fetch_restaurants(city, limit=15)
        fallback_restaurants = []
        for i, p in enumerate(pois):
            fallback_restaurants.append(
                {
                    "name": p.name,
                    "city": city,
                    "location": {
                        "latitude": p.location.latitude,
                        "longitude": p.location.longitude,
                    },
                    "category": p.category,
                    "price_tier": "$$",
                }
            )
        return fallback_restaurants
    except Exception as fallback_e:
        logger.error(f"Fallback Overpass restaurant fetch failed: {fallback_e}")
        return []
