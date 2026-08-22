import asyncio
from scripts.seed_static_pois import fetch_pois_for_city

async def main():
    res = await fetch_pois_for_city("Barcelona", limit=5)
    print(res)

asyncio.run(main())
