import httpx
import asyncio

async def test_query():
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "city": "Barcelona",
        "amenity": "restaurant",
        "format": "json",
        "limit": 5
    }
    headers = {"User-Agent": "Paladio-Travel-App/1.0"}
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)
        data = response.json()
        for p in data:
            name = p.get("name", "")
            if not name: name = p.get("display_name", "").split(",")[0]
            print(f" - {name} ({p.get('lat')}, {p.get('lon')})")

if __name__ == "__main__":
    asyncio.run(test_query())
