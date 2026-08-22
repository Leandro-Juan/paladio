import asyncio
from app.scraper.restaurant_scrapers import OSMRestaurantScraper
from app.swarm.graph import haversine, get_location_coordinates

async def main():
    city = "Barcelona"
    print(f"Testing restaurant fetching for {city}...")
    
    city_lat, city_lon = await get_location_coordinates(city)
    print(f"City center resolved to: {city_lat}, {city_lon}")
    
    scraper = OSMRestaurantScraper()
    # Fetch more than the limit to see how many get filtered out
    restaurants = await scraper.scrape_restaurants(city, limit=20)
    
    print(f"\nFetched {len(restaurants)} raw restaurants from OSM:")
    
    valid_count = 0
    for r in restaurants:
        name = r.get("name")
        lat = r.get("location", {}).get("latitude", 0.0)
        lon = r.get("location", {}).get("longitude", 0.0)
        
        dist = haversine(city_lat, city_lon, lat, lon)
        
        status = "✅ KEPT" if dist <= 8.0 else "❌ DROPPED (Too far)"
        print(f" - {name} ({dist:.2f} km away) -> {status}")
        
        if dist <= 8.0:
            valid_count += 1
            
    print(f"\nFinal valid restaurants within 8km radius: {valid_count}")

if __name__ == "__main__":
    asyncio.run(main())
