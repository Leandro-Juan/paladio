import asyncio
from app.scraper.dynamic_scraper import scrape_dynamic
from app.swarm.graph import haversine, get_location_coordinates
import urllib.parse

async def main():
    city = "Barcelona"
    print(f"Testing Google Maps dynamic scraping for restaurants in {city}...")
    city_lat, city_lon = await get_location_coordinates(city)
    
    gmaps_url = f"https://www.google.com/maps/search/restaurants+in+{urllib.parse.quote(city)}/"
    gmaps_result = await scrape_dynamic(gmaps_url)
    restaurants = gmaps_result.get("extracted_data", [])
    
    print(f"\nFetched {len(restaurants)} raw restaurants from Google Maps:")
    
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
