import logging

logger = logging.getLogger(__name__)


async def fetch_restaurants(
    city: str,
    test_data=None,
    preferred_cuisines: list[str] | None = None,
    target_frequency: int = 1,
):
    if test_data and "restaurants" in test_data:
        return test_data["restaurants"][:15]

    try:
        from app.infrastructure.providers.overpass_provider import (
            OverpassProviderAdapter,
        )

        provider = OverpassProviderAdapter()
        preferred_restaurants = []

        # 1. Fetch targeted preferred cuisine restaurants if specified
        if preferred_cuisines:
            for cuisine in preferred_cuisines:
                c_pois = await provider.fetch_restaurants(
                    city, limit=target_frequency + 1, cuisine=cuisine
                )
                for p in c_pois:
                    preferred_restaurants.append(
                        {
                            "name": p.name,
                            "city": city,
                            "location": {
                                "latitude": p.location.latitude,
                                "longitude": p.location.longitude,
                            },
                            "category": p.category,
                            "cuisine": cuisine,
                            "price_tier": "$$",
                        }
                    )

        # 2. Fetch general local restaurants
        general_pois = await provider.fetch_restaurants(city, limit=15)
        general_restaurants = []
        for p in general_pois:
            general_restaurants.append(
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

        # Combine preferred (capped at target_frequency per cuisine) + general restaurants
        result = []
        if preferred_restaurants:
            result.extend(preferred_restaurants[: max(1, target_frequency)])

        for r in general_restaurants:
            if not any(r["name"] == res["name"] for res in result):
                result.append(r)

        return result[:15]
    except Exception as fallback_e:
        logger.error(f"Overpass restaurant fetch failed: {fallback_e}")
        raise RuntimeError(
            f"Failed to fetch restaurants for {city}: {fallback_e}"
        ) from fallback_e
