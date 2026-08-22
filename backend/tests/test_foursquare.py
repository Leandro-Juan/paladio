import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()
async def test_foursquare():
    key = os.getenv("FOURSQUARE_API_KEY")
    url = "https://api.foursquare.com/v3/places/search"
    params = {"query": "restaurant", "near": "Barcelona", "limit": 4}
    headers = {"Accept": "application/json", "Authorization": key}
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params, headers=headers)
        print(res.status_code)
        print(res.text)

asyncio.run(test_foursquare())
