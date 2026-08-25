import asyncio
from app.services.poi_service import get_attractions_for_city

async def main():
    pois = await get_attractions_for_city("madrid")
    print("POIS:", len(pois))

if __name__ == "__main__":
    asyncio.run(main())
