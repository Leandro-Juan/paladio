import asyncio
import httpx
import urllib.parse

async def test_osm():
    query = "The Conica Deluxe Bed&Breakfast in Barcelona"
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "limit": 1}
    headers = {"User-Agent": "Paladio-Travel-App/1.0"}
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params, headers=headers)
        print(res.status_code)
        print(res.json())

asyncio.run(test_osm())
