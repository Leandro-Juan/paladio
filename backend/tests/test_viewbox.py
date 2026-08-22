import httpx
import asyncio

async def test_query(city_lat, city_lon):
    url = "https://nominatim.openstreetmap.org/search"
    # viewbox: left,top,right,bottom (lon1,lat1,lon2,lat2)
    # roughly +/- 0.05 degrees is ~5km
    viewbox = f"{city_lon-0.05},{city_lat+0.05},{city_lon+0.05},{city_lat-0.05}"
    
    params = {
        "q": "restaurant",
        "format": "json",
        "limit": 10,
        "viewbox": viewbox,
        "bounded": 1
    }
    headers = {"User-Agent": "Paladio-Travel-App/1.0"}
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)
        data = response.json()
        print(f"\nResults for viewbox {viewbox}:")
        for p in data:
            name = p.get("name", "")
            if not name: name = p.get("display_name", "").split(",")[0]
            print(f" - {name} ({p.get('lat')}, {p.get('lon')})")

if __name__ == "__main__":
    # Barcelona center
    asyncio.run(test_query(41.3825802, 2.177073))
