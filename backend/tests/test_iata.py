import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()
async def test_aviationstack():
    key = os.getenv("AVIATIONSTACK_API_KEY")
    url = f"http://api.aviationstack.com/v1/cities?access_key={key}&search=Barcelona"
    async with httpx.AsyncClient() as client:
        res = await client.get(url)
        print(res.json())

asyncio.run(test_aviationstack())
