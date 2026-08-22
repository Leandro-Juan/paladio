import httpx
import asyncio

async def test_query(query):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "json",
        "limit": 5
    }
    headers = {"User-Agent": "Paladio-Travel-App/1.0"}
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)
        data = response.json()
        print(f"\nResults for '{query}':")
        for p in data:
            name = p.get("name", "")
            if not name: name = p.get("display_name", "").split(",")[0]
            print(f" - {name} ({p.get('lat')}, {p.get('lon')})")

async def main():
    await test_query("restaurant in Barcelona")
    await test_query("restaurant, Barcelona")
    await test_query("restaurant in Barcelona City")
    
if __name__ == "__main__":
    asyncio.run(main())
